import { HttpStatus, Injectable } from '@nestjs/common';
import {
  FollowUpStatus,
  LeadLifecycleStatus,
  MembershipStatus,
  PeriodType,
  TargetScopeType,
} from '@prisma/client';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  PERIOD_CATALOG,
  PeriodTypeCode,
  periodLabel,
  periodRangeUtc,
  resolvePeriod,
  ymdToUtcDate,
} from '../../targets/domain/target-period';
import {
  PERFORMANCE_KPI_CATALOG,
  PERFORMANCE_WEIGHTS,
  assignDenseRanks,
  assignTeamRanks,
  computePerformanceScore,
  followUpCompletionBps,
  leadConversionBps,
  quotationConversionBps,
  salesAchievementBps,
  topByKpi,
} from '../domain/performance-score';
import { PerformanceBoardQuery, PerformanceReportQuery } from '../interface/http/dto/performance.dto';

export type StaffPerformanceView = {
  membershipId: string;
  name: string;
  designation: string | null;
  teamId: string | null;
  teamName: string | null;
  leadsCreated: number;
  leadsWon: number;
  leadsLost: number;
  followUpsDue: number;
  followUpsCompleted: number;
  quotationsSent: number;
  quotationsWon: number;
  quotationsLost: number;
  revenueMinor: number;
  salesTargetMinor: number | null;
  leadConversionBps: number | null;
  followUpCompletionBps: number | null;
  salesAchievementBps: number | null;
  quotationConversionBps: number | null;
  scoreBps: number | null;
  scoreBand: string;
  rank: number;
  teamRank: number | null;
  rankedOutOf: number;
};

const LEADERBOARD_SIZE = 10;

@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async catalog(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    const teams = await this.prisma.team.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      take: 200,
      select: { id: true, code: true, name: true },
    });
    return {
      periods: PERIOD_CATALOG,
      kpis: PERFORMANCE_KPI_CATALOG,
      weights: PERFORMANCE_WEIGHTS,
      teams,
    };
  }

  async board(actor: AuthUser, query: PerformanceBoardQuery) {
    const built = await this.buildStandings(actor, query);
    const limit = query.limit ?? 50;
    const standings = built.standings.slice(0, limit);
    return {
      generatedAt: built.generatedAt,
      period: built.period,
      weights: PERFORMANCE_WEIGHTS,
      rankedOutOf: built.standings.length,
      standings,
      leaderboards: this.leaderboards(built.standings),
    };
  }

  async me(actor: AuthUser, query: PerformanceBoardQuery) {
    if (!actor.membershipId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Membership required', {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
    return this.get(actor, actor.membershipId, query);
  }

  async get(actor: AuthUser, membershipId: string, query: PerformanceBoardQuery) {
    const built = await this.buildStandings(actor, query);
    const row = built.standings.find((item) => item.membershipId === membershipId);
    if (!row) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Staff performance not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return {
      generatedAt: built.generatedAt,
      period: built.period,
      weights: PERFORMANCE_WEIGHTS,
      staff: row,
      neighbors: this.neighbors(built.standings, membershipId),
      leaderboards: this.leaderboards(built.standings),
    };
  }

  async report(actor: AuthUser, query: PerformanceReportQuery) {
    const built = await this.buildStandings(actor, query);
    const scores = built.standings
      .map((row) => row.scoreBps)
      .filter((value): value is number => value != null);
    const byTeam = new Map<
      string,
      { teamId: string; teamName: string; count: number; scores: number[] }
    >();
    for (const row of built.standings) {
      if (!row.teamId || !row.teamName) {
        continue;
      }
      const current = byTeam.get(row.teamId) ?? {
        teamId: row.teamId,
        teamName: row.teamName,
        count: 0,
        scores: [],
      };
      current.count += 1;
      if (row.scoreBps != null) {
        current.scores.push(row.scoreBps);
      }
      byTeam.set(row.teamId, current);
    }
    return {
      generatedAt: built.generatedAt,
      period: built.period,
      totals: {
        staff: built.standings.length,
        scored: scores.length,
        averageScoreBps:
          scores.length === 0
            ? null
            : Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length),
        outstanding: built.standings.filter((row) => row.scoreBand === 'outstanding').length,
        strong: built.standings.filter((row) => row.scoreBand === 'strong').length,
        average: built.standings.filter((row) => row.scoreBand === 'average').length,
        needsWork: built.standings.filter((row) => row.scoreBand === 'needs_work').length,
        noData: built.standings.filter((row) => row.scoreBand === 'no_data').length,
      },
      top: built.standings.slice(0, 5),
      byTeam: [...byTeam.values()]
        .map((team) => ({
          teamId: team.teamId,
          teamName: team.teamName,
          count: team.count,
          averageScoreBps:
            team.scores.length === 0
              ? null
              : Math.round(team.scores.reduce((sum, value) => sum + value, 0) / team.scores.length),
        }))
        .sort((a, b) => (b.averageScoreBps ?? -1) - (a.averageScoreBps ?? -1)),
      leaderboards: this.leaderboards(built.standings),
    };
  }

  private async buildStandings(actor: AuthUser, query: PerformanceBoardQuery | PerformanceReportQuery) {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const periodType = (query.periodType ?? 'monthly') as PeriodTypeCode;
    let bounds: { start: string; end: string };
    try {
      bounds = resolvePeriod({
        periodType,
        ...(query.periodStart ? { periodStart: query.periodStart.slice(0, 10) } : {}),
        now,
        timeZone,
      });
    } catch (error) {
      throw new AppException(HttpStatus.BAD_REQUEST, (error as Error).message, {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
    const range = periodRangeUtc(bounds.start, bounds.end, timeZone);
    const members = await this.prisma.membership.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: MembershipStatus.active,
        ...(query.teamId
          ? {
              OR: [{ teamId: query.teamId }, { teamLinks: { some: { teamId: query.teamId } } }],
            }
          : {}),
      },
      include: {
        user: { select: { fullName: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const counts = await this.loadCounts(tenantId, range.from, range.toExclusive, bounds, periodType);
    const scored = members.map((member) => {
      const created = counts.leadsCreated.get(member.id) ?? 0;
      const won = counts.leadsWon.get(member.id) ?? 0;
      const lost = counts.leadsLost.get(member.id) ?? 0;
      const due = counts.followUpsDue.get(member.id) ?? 0;
      const completed = counts.followUpsCompleted.get(member.id) ?? 0;
      const sent = counts.quotationsSent.get(member.id) ?? 0;
      const quotesWon = counts.quotationsWon.get(member.id) ?? 0;
      const quotesLost = counts.quotationsLost.get(member.id) ?? 0;
      const revenueMinor = counts.revenueMinor.get(member.id) ?? 0;
      const salesTarget = counts.salesTarget.get(member.id) ?? null;
      const kpis = {
        leadConversionBps: leadConversionBps({ created, won, lost }),
        followUpCompletionBps: followUpCompletionBps({ due, completed }),
        salesAchievementBps:
          salesTarget == null ? null : salesAchievementBps({ target: salesTarget, achieved: revenueMinor }),
        quotationConversionBps: quotationConversionBps({ sent, won: quotesWon, lost: quotesLost }),
      };
      const score = computePerformanceScore(kpis);
      return {
        id: member.id,
        membershipId: member.id,
        name: member.user.fullName,
        designation: member.designation,
        teamId: member.team?.id ?? member.teamId,
        teamName: member.team?.name ?? null,
        leadsCreated: created,
        leadsWon: won,
        leadsLost: lost,
        followUpsDue: due,
        followUpsCompleted: completed,
        quotationsSent: sent,
        quotationsWon: quotesWon,
        quotationsLost: quotesLost,
        revenueMinor,
        salesTargetMinor: salesTarget,
        ...kpis,
        scoreBps: score.scoreBps,
        scoreBand: score.band,
      };
    });
    const ranked = assignDenseRanks(scored);
    const teamRanks = assignTeamRanks(ranked);
    const standings: StaffPerformanceView[] = ranked.map((row) => ({
      membershipId: row.membershipId,
      name: row.name,
      designation: row.designation,
      teamId: row.teamId,
      teamName: row.teamName,
      leadsCreated: row.leadsCreated,
      leadsWon: row.leadsWon,
      leadsLost: row.leadsLost,
      followUpsDue: row.followUpsDue,
      followUpsCompleted: row.followUpsCompleted,
      quotationsSent: row.quotationsSent,
      quotationsWon: row.quotationsWon,
      quotationsLost: row.quotationsLost,
      revenueMinor: row.revenueMinor,
      salesTargetMinor: row.salesTargetMinor,
      leadConversionBps: row.leadConversionBps,
      followUpCompletionBps: row.followUpCompletionBps,
      salesAchievementBps: row.salesAchievementBps,
      quotationConversionBps: row.quotationConversionBps,
      scoreBps: row.scoreBps,
      scoreBand: row.scoreBand,
      rank: row.rank,
      teamRank: teamRanks.get(row.id) ?? null,
      rankedOutOf: ranked.length,
    }));
    return {
      generatedAt: now.toISOString(),
      period: {
        type: periodType,
        start: bounds.start,
        end: bounds.end,
        label: periodLabel(periodType, bounds.start, bounds.end),
      },
      standings,
    };
  }

  private async loadCounts(
    tenantId: string,
    from: Date,
    toExclusive: Date,
    bounds: { start: string; end: string },
    periodType: PeriodTypeCode,
  ) {
    const range = { gte: from, lt: toExclusive };
    const [
      leadsCreated,
      stageChanges,
      followUps,
      quotationsSent,
      quotationsWon,
      quotationsLost,
      targets,
    ] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['ownerMembershipId'],
        where: {
          tenantId,
          deletedAt: null,
          createdAt: range,
          ownerMembershipId: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.leadStageChange.findMany({
        where: {
          tenantId,
          changedAt: range,
          toLifecycleStatus: { in: [LeadLifecycleStatus.won, LeadLifecycleStatus.lost] },
          lead: { deletedAt: null },
        },
        select: {
          toLifecycleStatus: true,
          lead: { select: { ownerMembershipId: true } },
        },
      }),
      this.prisma.followUp.groupBy({
        by: ['assignedToMembershipId', 'status'],
        where: {
          tenantId,
          deletedAt: null,
          dueAt: range,
          status: { not: FollowUpStatus.cancelled },
        },
        _count: { _all: true },
      }),
      this.prisma.quotation.groupBy({
        by: ['assignedToMembershipId'],
        where: {
          tenantId,
          deletedAt: null,
          sentAt: range,
          assignedToMembershipId: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.quotation.groupBy({
        by: ['assignedToMembershipId'],
        where: {
          tenantId,
          deletedAt: null,
          wonAt: range,
          assignedToMembershipId: { not: null },
        },
        _count: { _all: true },
        _sum: { totalMinor: true },
      }),
      this.prisma.quotation.groupBy({
        by: ['assignedToMembershipId'],
        where: {
          tenantId,
          deletedAt: null,
          lostAt: range,
          assignedToMembershipId: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.target.findMany({
        where: {
          tenantId,
          deletedAt: null,
          scopeType: TargetScopeType.membership,
          metricCode: 'revenue',
          periodType: periodType as PeriodType,
          periodStart: ymdToUtcDate(bounds.start),
          periodEnd: ymdToUtcDate(bounds.end),
        },
        select: { scopeId: true, productId: true, targetValue: true },
      }),
    ]);

    const created = new Map<string, number>();
    for (const row of leadsCreated) {
      bump(created, row.ownerMembershipId, row._count._all);
    }
    const won = new Map<string, number>();
    const lost = new Map<string, number>();
    for (const row of stageChanges) {
      if (row.toLifecycleStatus === LeadLifecycleStatus.won) {
        bump(won, row.lead.ownerMembershipId, 1);
      } else {
        bump(lost, row.lead.ownerMembershipId, 1);
      }
    }
    const followDue = new Map<string, number>();
    const followDone = new Map<string, number>();
    for (const row of followUps) {
      bump(followDue, row.assignedToMembershipId, row._count._all);
      if (row.status === FollowUpStatus.completed) {
        bump(followDone, row.assignedToMembershipId, row._count._all);
      }
    }
    const sent = new Map<string, number>();
    for (const row of quotationsSent) {
      bump(sent, row.assignedToMembershipId, row._count._all);
    }
    const qWon = new Map<string, number>();
    const revenue = new Map<string, number>();
    for (const row of quotationsWon) {
      bump(qWon, row.assignedToMembershipId, row._count._all);
      bump(revenue, row.assignedToMembershipId, Number(row._sum.totalMinor ?? 0));
    }
    const qLost = new Map<string, number>();
    for (const row of quotationsLost) {
      bump(qLost, row.assignedToMembershipId, row._count._all);
    }
    const salesTarget = new Map<string, number>();
    const general = targets.filter((row) => row.productId == null);
    const source = general.length > 0 ? general : targets;
    for (const row of source) {
      bump(salesTarget, row.scopeId, Number(row.targetValue));
    }

    return {
      leadsCreated: created,
      leadsWon: won,
      leadsLost: lost,
      followUpsDue: followDue,
      followUpsCompleted: followDone,
      quotationsSent: sent,
      quotationsWon: qWon,
      quotationsLost: qLost,
      revenueMinor: revenue,
      salesTarget,
    };
  }

  private leaderboards(standings: StaffPerformanceView[]) {
    return {
      overall: standings.slice(0, LEADERBOARD_SIZE),
      leadConversion: topByKpi(standings, (row) => row.leadConversionBps, LEADERBOARD_SIZE),
      followUpCompletion: topByKpi(standings, (row) => row.followUpCompletionBps, LEADERBOARD_SIZE),
      salesAchievement: topByKpi(standings, (row) => row.salesAchievementBps, LEADERBOARD_SIZE),
      quotationConversion: topByKpi(standings, (row) => row.quotationConversionBps, LEADERBOARD_SIZE),
    };
  }

  private neighbors(standings: StaffPerformanceView[], membershipId: string) {
    const index = standings.findIndex((row) => row.membershipId === membershipId);
    if (index < 0) {
      return [];
    }
    const from = Math.max(0, index - 2);
    const to = Math.min(standings.length, index + 3);
    return standings.slice(from, to);
  }

  private async tenantZone(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { timezone: true },
    });
    return tenant?.timezone ?? 'Asia/Kolkata';
  }

  private requireTenant(actor: AuthUser): string {
    if (!actor.tenantId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Tenant required', {
        code: ErrorCodes.TENANT_REQUIRED,
      });
    }
    return actor.tenantId;
  }
}

function bump(map: Map<string, number>, key: string | null | undefined, amount: number) {
  if (!key || amount === 0) {
    return;
  }
  map.set(key, (map.get(key) ?? 0) + amount);
}
