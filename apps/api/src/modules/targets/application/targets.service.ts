import { HttpStatus, Injectable } from '@nestjs/common';
import {
  FollowUpStatus,
  LeadLifecycleStatus,
  MembershipStatus,
  PeriodType,
  Prisma,
  QuotationStatus,
  SiteVisitStatus,
  TargetScopeType,
} from '@prisma/client';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import {
  buildPageMeta,
  decodeCursor,
  DEFAULT_PAGE_LIMIT,
  encodeCursor,
} from '../../../common/pagination/cursor-page';
import { PrismaService } from '../../../prisma/prisma.service';
import { formatYmd } from '../../tasks/domain/zoned-day';
import {
  BOARD_PERIOD_CATALOG,
  BOARD_SCOPE_CATALOG,
  BoardPeriodCode,
  BoardScopeCode,
  InsightRow,
  Standing,
  Suggestion,
  buildInsights,
  dailyAverage,
  paceNote,
  podium,
  rankStandings,
  suggestionsFor,
} from '../domain/sales-board';
import {
  PERIOD_CATALOG,
  PeriodTypeCode,
  SCOPE_CATALOG,
  ScopeTypeCode,
  TargetAchievement,
  addDaysYmd,
  computeAchievement,
  dateToYmd,
  daysInclusive,
  monthBoundsFromYmd,
  periodLabel,
  periodRangeUtc,
  quarterBoundsFromYmd,
  resolvePeriod,
  yearBoundsFromYmd,
  ymdToUtcDate,
} from '../domain/target-period';
import { summarizeTargets } from '../domain/target-report';
import { TargetMappedRow, TargetView, toTargetView } from './target.mapper';
import {
  CreateTargetRequest,
  SalesBoardQuery,
  TargetListQuery,
  TargetReportQuery,
  UpdateTargetRequest,
} from '../interface/http/dto/target.dto';

const targetInclude = {
  kpi: { select: { name: true, unit: true } },
  product: { select: { name: true, sku: true } },
} satisfies Prisma.TargetInclude;

type TargetRow = Prisma.TargetGetPayload<{ include: typeof targetInclude }>;

const SALES_BOARD_LIMIT = 20;
const SALES_BOARD_MEMBER_CAP = 500;
const SALES_BOARD_SERIES_CAP = 5000;
/** Enough rows to read the trail without shipping a whole year of days. */
const SALES_BOARD_TRAIL_DAYS = 31;

export type SalesBoardCard = TargetAchievement & {
  membershipId: string | null;
  name: string;
  targetValue: number;
  achievedValue: number;
  dailyAverage: number;
  rank: number | null;
  rankOf: number;
  pace: { status: 'on_track' | 'trailing'; title: string; detail: string };
  forecastDelta: number | null;
  achievement: TargetAchievement;
};

export type SalesBoardView = {
  generatedAt: string;
  timeZone: string;
  today: string;
  period: { code: BoardPeriodCode; title: string; start: string; end: string; label: string };
  periods: typeof BOARD_PERIOD_CATALOG;
  scopes: typeof BOARD_SCOPE_CATALOG;
  scope: BoardScopeCode;
  metric: { code: string; name: string; unit: string };
  /** The viewer's own card, when they have a membership on the board. */
  me: SalesBoardCard | null;
  /** The company or team roll-up, shown when "My Target" is off. */
  overall: SalesBoardCard;
  standings: Standing[];
  podium: Standing[];
  insights: InsightRow[];
  suggestions: Suggestion[];
};

/** Resolves a board period code against today in the tenant zone. */
export function boardPeriodBounds(
  code: BoardPeriodCode,
  today: string,
): { start: string; end: string; label: string } {
  switch (code) {
    case 'this_month': {
      const bounds = monthBoundsFromYmd(today);
      return { ...bounds, label: periodLabel('monthly', bounds.start, bounds.end) };
    }
    case 'last_month': {
      const thisMonth = monthBoundsFromYmd(today);
      const bounds = monthBoundsFromYmd(addDaysYmd(thisMonth.start, -1));
      return { ...bounds, label: periodLabel('monthly', bounds.start, bounds.end) };
    }
    case 'this_quarter': {
      const bounds = quarterBoundsFromYmd(today);
      return { ...bounds, label: periodLabel('quarterly', bounds.start, bounds.end) };
    }
    case 'this_year': {
      const bounds = yearBoundsFromYmd(today);
      return { ...bounds, label: today.slice(0, 4) };
    }
  }
}

/**
 * The days the Insights table covers: everything elapsed, trimmed to the most
 * recent window so a yearly board does not ship 365 rows. A period that has
 * not opened yet has no trail.
 */
export function boardDays(periodStart: string, periodEnd: string, today: string): string[] {
  if (today < periodStart) {
    return [];
  }
  const last = today > periodEnd ? periodEnd : today;
  const span = daysInclusive(periodStart, last);
  const count = Math.min(span, SALES_BOARD_TRAIL_DAYS);
  const first = addDaysYmd(last, -(count - 1));
  return Array.from({ length: count }, (_, index) => addDaysYmd(first, index));
}

@Injectable()
export class TargetsService {
  constructor(private readonly prisma: PrismaService) {}

  async catalog(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    const [metrics, teams, products, staff] = await Promise.all([
      this.prisma.kpiDefinition.findMany({
        orderBy: { name: 'asc' },
        select: { code: true, name: true, description: true, unit: true },
      }),
      this.prisma.team.findMany({
        where: { tenantId, deletedAt: null, isActive: true },
        orderBy: { name: 'asc' },
        take: 200,
        select: { id: true, code: true, name: true },
      }),
      this.prisma.product.findMany({
        where: { tenantId, deletedAt: null, isActive: true },
        orderBy: { name: 'asc' },
        take: 200,
        select: { id: true, sku: true, name: true },
      }),
      this.prisma.membership.findMany({
        where: { tenantId, deletedAt: null, status: MembershipStatus.active },
        orderBy: { createdAt: 'asc' },
        take: 200,
        select: {
          id: true,
          teamId: true,
          user: { select: { fullName: true } },
        },
      }),
    ]);
    return {
      periods: PERIOD_CATALOG,
      scopes: SCOPE_CATALOG,
      metrics,
      teams,
      products,
      staff: staff.map((member) => ({
        membershipId: member.id,
        name: member.user.fullName,
        teamId: member.teamId,
      })),
    };
  }

  async currentForStaff(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    if (!actor.membershipId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Membership required', {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
    const membershipId = actor.membershipId;
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const today = formatYmd(now, timeZone);
    const member = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId, deletedAt: null },
      select: { teamId: true },
    });
    const scopeFilter: Prisma.TargetWhereInput[] = [
      { scopeType: TargetScopeType.membership, scopeId: membershipId },
    ];
    if (member?.teamId) {
      scopeFilter.push({ scopeType: TargetScopeType.team, scopeId: member.teamId });
    }
    const rows = await this.prisma.target.findMany({
      where: {
        tenantId,
        deletedAt: null,
        periodStart: { lte: ymdToUtcDate(today) },
        periodEnd: { gte: ymdToUtcDate(today) },
        OR: scopeFilter,
      },
      include: targetInclude,
      orderBy: [{ periodType: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });
    const session = this.newProgressSession(tenantId, timeZone, now, today);
    return this.toViews(rows, session);
  }

  async progress(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const today = formatYmd(now, timeZone);
    const month = monthBoundsFromYmd(today);
    const [monthlyRows, dailyRows] = await Promise.all([
      this.prisma.target.findMany({
        where: {
          tenantId,
          deletedAt: null,
          periodType: PeriodType.monthly,
          periodStart: ymdToUtcDate(month.start),
          periodEnd: ymdToUtcDate(month.end),
        },
        include: targetInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      }),
      this.prisma.target.findMany({
        where: {
          tenantId,
          deletedAt: null,
          periodType: PeriodType.daily,
          periodStart: ymdToUtcDate(today),
          periodEnd: ymdToUtcDate(today),
        },
        include: targetInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      }),
    ]);
    const session = this.newProgressSession(tenantId, timeZone, now, today);
    const monthly = await this.toViews(monthlyRows, session);
    const daily = await this.toViews(dailyRows, session);
    const products = monthly.filter((item) => item.productId);
    const teams = monthly.filter((item) => item.scopeType === 'team');
    const all = [...monthly, ...daily];
    const onTrack = all.filter((item) => item.onTrack).length;
    const attainment = all
      .map((item) => item.achievementBps)
      .filter((value): value is number => value != null);
    const forecasts = all
      .map((item) => item.forecastBps)
      .filter((value): value is number => value != null);
    return {
      generatedAt: now.toISOString(),
      timeZone,
      month: { periodStart: month.start, periodEnd: month.end, items: monthly },
      today: { periodStart: today, periodEnd: today, items: daily },
      products,
      teams,
      totals: {
        count: all.length,
        onTrack,
        behind: all.length - onTrack,
        hit: all.filter((item) => item.forecastBand === 'hit').length,
        ahead: all.filter((item) => item.forecastBand === 'ahead').length,
        atRisk: all.filter((item) => item.forecastBand === 'at_risk').length,
        missed: all.filter((item) => item.forecastBand === 'missed').length,
        averageAttainmentBps:
          attainment.length === 0
            ? null
            : Math.round(attainment.reduce((sum, value) => sum + value, 0) / attainment.length),
        averageForecastBps:
          forecasts.length === 0
            ? null
            : Math.round(forecasts.reduce((sum, value) => sum + value, 0) / forecasts.length),
        balance: all.reduce((sum, item) => sum + item.balance, 0),
      },
    };
  }

  async list(actor: AuthUser, query: TargetListQuery) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const today = formatYmd(now, timeZone);
    const where: Prisma.TargetWhereInput = { tenantId, deletedAt: null };
    if (query.periodType) {
      where.periodType = query.periodType;
    }
    if (query.scopeType) {
      where.scopeType = query.scopeType;
    }
    if (query.teamId) {
      where.scopeType = TargetScopeType.team;
      where.scopeId = query.teamId;
    }
    if (query.scopeId) {
      where.scopeId = query.scopeId;
    }
    if (query.productId) {
      where.productId = query.productId;
    }
    if (query.hasProduct) {
      where.productId = { not: null };
    }
    if (query.metricCode) {
      where.metricCode = query.metricCode;
    }
    if (query.current) {
      where.periodStart = { lte: ymdToUtcDate(today) };
      where.periodEnd = { gte: ymdToUtcDate(today) };
    }
    if (query.cursor) {
      try {
        const cursor = decodeCursor(query.cursor);
        const createdAt = cursor.createdAt;
        const id = cursor.id;
        if (!createdAt || !id) {
          throw new Error('missing cursor fields');
        }
        where.OR = [
          { createdAt: { lt: new Date(createdAt) } },
          { createdAt: new Date(createdAt), id: { lt: id } },
        ];
      } catch {
        throw new AppException(HttpStatus.BAD_REQUEST, 'Invalid cursor', {
          code: ErrorCodes.BAD_REQUEST,
        });
      }
    }
    const rows = await this.prisma.target.findMany({
      where,
      include: targetInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const session = this.newProgressSession(tenantId, timeZone, now, today);
    const data = await this.toViews(pageRows, session);
    const last = pageRows[pageRows.length - 1];
    return {
      data,
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
            : null,
      }),
    };
  }

  async get(actor: AuthUser, targetId: string): Promise<TargetView> {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const today = formatYmd(now, timeZone);
    const row = await this.prisma.target.findFirst({
      where: { id: targetId, tenantId, deletedAt: null },
      include: targetInclude,
    });
    if (!row) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Target not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    const session = this.newProgressSession(tenantId, timeZone, now, today);
    const [view] = await this.toViews([row], session);
    if (!view) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Target not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return view;
  }

  async create(actor: AuthUser, dto: CreateTargetRequest): Promise<TargetView> {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    await this.assertMetric(dto.metricCode);
    await this.assertScope(tenantId, dto.scopeType, dto.scopeId);
    await this.assertProduct(tenantId, dto.productId);
    let period: { start: string; end: string };
    try {
      period = resolvePeriod({
        periodType: dto.periodType,
        ...(dto.periodStart ? { periodStart: dto.periodStart.slice(0, 10) } : {}),
        ...(dto.periodEnd ? { periodEnd: dto.periodEnd.slice(0, 10) } : {}),
        now,
        timeZone,
      });
    } catch (error) {
      throw new AppException(HttpStatus.BAD_REQUEST, (error as Error).message, {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
    try {
      const created = await this.prisma.target.create({
        data: {
          tenantId,
          scopeType: dto.scopeType,
          scopeId: dto.scopeType === 'tenant' ? null : (dto.scopeId ?? null),
          productId: dto.productId ?? null,
          metricCode: dto.metricCode,
          periodType: dto.periodType,
          periodStart: ymdToUtcDate(period.start),
          periodEnd: ymdToUtcDate(period.end),
          targetValue: dto.targetValue,
          notes: emptyToNull(dto.notes),
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
        include: targetInclude,
      });
      return this.get(actor, created.id);
    } catch (error) {
      this.throwWriteError(error);
    }
  }

  async update(actor: AuthUser, targetId: string, dto: UpdateTargetRequest): Promise<TargetView> {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const existing = await this.prisma.target.findFirst({
      where: { id: targetId, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Target not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    if (dto.version != null && dto.version !== existing.version) {
      throw new AppException(HttpStatus.CONFLICT, 'Target was updated by someone else', {
        code: ErrorCodes.STALE_VERSION,
      });
    }
    const periodType = (dto.periodType ?? existing.periodType) as PeriodTypeCode;
    const scopeType = (dto.scopeType ?? existing.scopeType) as ScopeTypeCode;
    const scopeId = dto.scopeId ?? existing.scopeId ?? undefined;
    const productId = dto.productId ?? existing.productId ?? undefined;
    const metricCode = dto.metricCode ?? existing.metricCode;
    await this.assertMetric(metricCode);
    await this.assertScope(tenantId, scopeType, scopeId);
    await this.assertProduct(tenantId, productId);
    const nextStart = (dto.periodStart ?? dateToYmd(existing.periodStart))?.slice(0, 10);
    const nextEnd = (dto.periodEnd ?? dateToYmd(existing.periodEnd))?.slice(0, 10);
    let period: { start: string; end: string };
    try {
      period = resolvePeriod({
        periodType,
        ...(nextStart ? { periodStart: nextStart } : {}),
        ...(nextEnd ? { periodEnd: nextEnd } : {}),
        now,
        timeZone,
      });
    } catch (error) {
      throw new AppException(HttpStatus.BAD_REQUEST, (error as Error).message, {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
    const data: Prisma.TargetUpdateInput = {
      version: { increment: 1 },
      updatedBy: actor.userId,
      scopeType,
      periodType,
      kpi: { connect: { code: metricCode } },
      periodStart: ymdToUtcDate(period.start),
      periodEnd: ymdToUtcDate(period.end),
      scopeId: scopeType === 'tenant' ? null : (scopeId ?? null),
      product: productId ? { connect: { id: productId } } : { disconnect: true },
    };
    if (dto.targetValue !== undefined) {
      data.targetValue = dto.targetValue;
    }
    if (dto.notes !== undefined) {
      data.notes = emptyToNull(dto.notes);
    }
    try {
      await this.prisma.target.update({
        where: { id: existing.id },
        data,
      });
      return this.get(actor, existing.id);
    } catch (error) {
      this.throwWriteError(error);
    }
  }

  async remove(actor: AuthUser, targetId: string): Promise<{ id: string }> {
    const tenantId = this.requireTenant(actor);
    const existing = await this.prisma.target.findFirst({
      where: { id: targetId, tenantId, deletedAt: null },
      select: { id: true, version: true },
    });
    if (!existing) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Target not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    await this.prisma.target.update({
      where: { id: existing.id },
      data: {
        deletedAt: new Date(),
        deletedBy: actor.userId,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
    return { id: existing.id };
  }

  async report(actor: AuthUser, query: TargetReportQuery) {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const today = formatYmd(now, timeZone);
    const where: Prisma.TargetWhereInput = { tenantId, deletedAt: null };
    if (query.periodType) {
      where.periodType = query.periodType;
    }
    if (query.scopeType) {
      where.scopeType = query.scopeType;
    }
    if (query.from || query.to) {
      where.AND = [
        query.from ? { periodEnd: { gte: ymdToUtcDate(query.from.slice(0, 10)) } } : {},
        query.to ? { periodStart: { lte: ymdToUtcDate(query.to.slice(0, 10)) } } : {},
      ];
    }
    const rows = await this.prisma.target.findMany({
      where,
      include: targetInclude,
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
      take: 2000,
    });
    const session = this.newProgressSession(tenantId, timeZone, now, today);
    const views = await this.toViews(rows, session);
    return summarizeTargets(
      views.map((item) => ({
        periodType: item.periodType,
        scopeType: item.scopeType,
        productId: item.productId,
        metricCode: item.metricCode,
        metricName: item.metricName,
        targetValue: item.targetValue,
        achievedValue: item.achievedValue,
        achievementBps: item.achievementBps,
        attainmentBps: item.attainmentBps,
        balance: item.balance,
        dailyRequired: item.dailyRequired,
        forecastValue: item.forecastValue,
        forecastBps: item.forecastBps,
        forecastBand: item.forecastBand,
        onTrack: item.onTrack,
        scopeName: item.scopeName,
        productName: item.productName,
      })),
      now,
    );
  }

  /**
   * The monthly sales-target board: the viewer's gauge, the company or team
   * roll-up behind the "My Target" toggle, the ranking everyone is measured
   * on, the day-by-day trail, and the nudges that close the gap.
   *
   * Both cards come back in one response so flipping the toggle is free.
   */
  async salesBoard(actor: AuthUser, query: SalesBoardQuery): Promise<SalesBoardView> {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const today = formatYmd(now, timeZone);
    const periodCode: BoardPeriodCode = query.period ?? 'this_month';
    const scopeCode: BoardScopeCode = query.scope ?? 'tenant';
    const metricCode = query.metricCode ?? 'revenue';
    const limit = query.limit ?? SALES_BOARD_LIMIT;
    const period = boardPeriodBounds(periodCode, today);
    const range = periodRangeUtc(period.start, period.end, timeZone);

    const kpi = await this.prisma.kpiDefinition.findUnique({
      where: { code: metricCode },
      select: { code: true, name: true, unit: true },
    });
    if (!kpi) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Unknown metric', {
        code: ErrorCodes.BAD_REQUEST,
      });
    }

    const viewerMembershipId = actor.membershipId ?? null;
    const viewer = viewerMembershipId
      ? await this.prisma.membership.findFirst({
          where: { id: viewerMembershipId, tenantId, deletedAt: null },
          select: { id: true, teamId: true },
        })
      : null;

    // 'team' narrows the board to the viewer's team; without a team it is the
    // same board as 'tenant' rather than an empty one.
    const teamId = scopeCode === 'team' ? (viewer?.teamId ?? null) : null;
    const members = await this.prisma.membership.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: MembershipStatus.active,
        ...(teamId ? { OR: [{ teamId }, { teamLinks: { some: { teamId } } }] } : {}),
      },
      select: {
        id: true,
        designation: true,
        user: { select: { fullName: true } },
        team: { select: { name: true } },
      },
      take: SALES_BOARD_MEMBER_CAP,
    });
    const memberIds = members.map((member) => member.id);

    const [memberTargets, scopeTargets, achievedByMember] = await Promise.all([
      this.prisma.target.findMany({
        where: {
          tenantId,
          deletedAt: null,
          metricCode,
          scopeType: TargetScopeType.membership,
          scopeId: { in: memberIds },
          periodStart: { lte: ymdToUtcDate(period.end) },
          periodEnd: { gte: ymdToUtcDate(period.start) },
        },
        select: { scopeId: true, targetValue: true },
      }),
      this.prisma.target.findMany({
        where: {
          tenantId,
          deletedAt: null,
          metricCode,
          scopeType: teamId ? TargetScopeType.team : TargetScopeType.tenant,
          ...(teamId ? { scopeId: teamId } : {}),
          periodStart: { lte: ymdToUtcDate(period.end) },
          periodEnd: { gte: ymdToUtcDate(period.start) },
        },
        select: { id: true, targetValue: true },
      }),
      this.achievedByMember({
        tenantId,
        metricCode,
        membershipIds: memberIds,
        from: range.from,
        toExclusive: range.toExclusive,
      }),
    ]);

    const targetByMember = new Map<string, number>();
    for (const row of memberTargets) {
      if (!row.scopeId) {
        continue;
      }
      targetByMember.set(
        row.scopeId,
        (targetByMember.get(row.scopeId) ?? 0) + Number(row.targetValue),
      );
    }

    const standings = rankStandings(
      members.map((member) => {
        const targetValue = targetByMember.get(member.id) ?? 0;
        const achievedValue = achievedByMember.get(member.id) ?? 0;
        const achievement = computeAchievement({
          achievedValue,
          targetValue,
          periodStart: period.start,
          periodEnd: period.end,
          today,
        });
        return {
          membershipId: member.id,
          name: member.user.fullName,
          designation: member.designation,
          teamName: member.team?.name ?? null,
          targetValue,
          achievedValue,
          achievementBps: achievement.achievementBps,
          onTrack: achievement.onTrack,
        };
      }),
    );

    // A scope-level target is authoritative when one is set; otherwise the
    // roll-up is the sum of the individual quotas, which is what the ranking
    // already adds up to.
    const scopeTargetValue = scopeTargets.reduce((sum, row) => sum + Number(row.targetValue), 0);
    const overallTarget =
      scopeTargetValue > 0
        ? scopeTargetValue
        : standings.reduce((sum, row) => sum + row.targetValue, 0);
    const overallAchieved = standings.reduce((sum, row) => sum + row.achievedValue, 0);

    const mine = viewerMembershipId
      ? (standings.find((row) => row.membershipId === viewerMembershipId) ?? null)
      : null;

    // The insights trail and the suggestions follow whichever card the viewer
    // is looking at: their own row when they have one, the roll-up otherwise.
    const focusMemberIds = mine ? [mine.membershipId] : memberIds;
    const [points, rates] = await Promise.all([
      this.dailyPoints({
        tenantId,
        metricCode,
        membershipIds: focusMemberIds,
        from: range.from,
        toExclusive: range.toExclusive,
        timeZone,
        days: boardDays(period.start, period.end, today),
      }),
      this.activityRates({
        tenantId,
        membershipIds: focusMemberIds,
        from: range.from,
        toExclusive: range.toExclusive,
      }),
    ]);

    const focusCard = mine
      ? this.boardCard({
          membershipId: mine.membershipId,
          name: mine.name,
          targetValue: mine.targetValue,
          achievedValue: mine.achievedValue,
          period,
          today,
          rank: mine.rank,
          rankOf: standings.length,
        })
      : null;
    const overallCard = this.boardCard({
      membershipId: null,
      name: teamId ? (members[0]?.team?.name ?? 'Team') : 'Company',
      targetValue: overallTarget,
      achievedValue: overallAchieved,
      period,
      today,
      rank: null,
      rankOf: standings.length,
    });

    const focus = focusCard ?? overallCard;
    return {
      generatedAt: now.toISOString(),
      timeZone,
      today,
      period: {
        code: periodCode,
        title: BOARD_PERIOD_CATALOG.find((entry) => entry.code === periodCode)?.title ?? periodCode,
        start: period.start,
        end: period.end,
        label: period.label,
      },
      periods: BOARD_PERIOD_CATALOG,
      scopes: BOARD_SCOPE_CATALOG,
      scope: scopeCode,
      metric: { code: kpi.code, name: kpi.name, unit: kpi.unit },
      me: focusCard,
      overall: overallCard,
      standings: standings.slice(0, limit),
      podium: podium(standings),
      insights: buildInsights(points),
      suggestions: suggestionsFor({
        achievement: focus.achievement,
        dailyAverage: focus.dailyAverage,
        followUpCompletionBps: rates.followUpCompletionBps,
        visitCompletionBps: rates.visitCompletionBps,
      }),
    };
  }

  /**
   * Achieved value per membership over a calendar period, in the tenant zone.
   * Public because the incentive engine measures the same thing the board
   * does, and both must agree to the rupee.
   */
  async achievedForMembers(params: {
    tenantId: string;
    metricCode: string;
    membershipIds: string[];
    periodStart: string;
    periodEnd: string;
    timeZone: string;
  }): Promise<Map<string, number>> {
    const range = periodRangeUtc(params.periodStart, params.periodEnd, params.timeZone);
    return this.achievedByMember({
      tenantId: params.tenantId,
      metricCode: params.metricCode,
      membershipIds: params.membershipIds,
      from: range.from,
      toExclusive: range.toExclusive,
    });
  }

  /** The tenant's configured time zone; shared with modules that report on periods. */
  async timeZoneFor(tenantId: string): Promise<string> {
    return this.tenantZone(tenantId);
  }

  private boardCard(input: {
    membershipId: string | null;
    name: string;
    targetValue: number;
    achievedValue: number;
    period: { start: string; end: string; label: string };
    today: string;
    rank: number | null;
    rankOf: number;
  }): SalesBoardCard {
    const achievement = computeAchievement({
      achievedValue: input.achievedValue,
      targetValue: input.targetValue,
      periodStart: input.period.start,
      periodEnd: input.period.end,
      today: input.today,
    });
    return {
      membershipId: input.membershipId,
      name: input.name,
      targetValue: input.targetValue,
      achievedValue: input.achievedValue,
      dailyAverage: dailyAverage(input.achievedValue, achievement.daysElapsed),
      rank: input.rank,
      rankOf: input.rankOf,
      pace: paceNote(achievement),
      // The forecast card shows the gap to target, signed: +10K over, -10K under.
      forecastDelta:
        achievement.forecastValue == null
          ? null
          : Math.round((achievement.forecastValue - input.targetValue) * 100) / 100,
      achievement,
      ...achievement,
    };
  }

  /**
   * Achieved value per membership in one pass. Metrics that hang off a
   * membership column group in the database; the rest fall back to the
   * per-target path, which is correct but one query per member.
   */
  private async achievedByMember(params: {
    tenantId: string;
    metricCode: string;
    membershipIds: string[];
    from: Date;
    toExclusive: Date;
  }): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (params.membershipIds.length === 0) {
      return out;
    }
    const ids = { in: params.membershipIds };
    const window = { gte: params.from, lt: params.toExclusive };

    switch (params.metricCode) {
      case 'revenue': {
        const rows = await this.prisma.quotation.groupBy({
          by: ['assignedToMembershipId'],
          _sum: { totalMinor: true },
          where: {
            tenantId: params.tenantId,
            deletedAt: null,
            status: QuotationStatus.won,
            wonAt: window,
            assignedToMembershipId: ids,
          },
        });
        for (const row of rows) {
          if (row.assignedToMembershipId) {
            out.set(row.assignedToMembershipId, Number(row._sum.totalMinor ?? 0));
          }
        }
        return out;
      }
      case 'quotations_accepted': {
        const rows = await this.prisma.quotation.groupBy({
          by: ['assignedToMembershipId'],
          _count: { _all: true },
          where: {
            tenantId: params.tenantId,
            deletedAt: null,
            status: QuotationStatus.won,
            wonAt: window,
            assignedToMembershipId: ids,
          },
        });
        for (const row of rows) {
          if (row.assignedToMembershipId) {
            out.set(row.assignedToMembershipId, row._count._all);
          }
        }
        return out;
      }
      case 'follow_ups_completed': {
        const rows = await this.prisma.followUp.groupBy({
          by: ['assignedToMembershipId'],
          _count: { _all: true },
          where: {
            tenantId: params.tenantId,
            deletedAt: null,
            status: FollowUpStatus.completed,
            completedAt: window,
            assignedToMembershipId: ids,
          },
        });
        for (const row of rows) {
          out.set(row.assignedToMembershipId, row._count._all);
        }
        return out;
      }
      case 'leads_created': {
        const rows = await this.prisma.lead.groupBy({
          by: ['ownerMembershipId'],
          _count: { _all: true },
          where: {
            tenantId: params.tenantId,
            deletedAt: null,
            createdAt: window,
            ownerMembershipId: ids,
          },
        });
        for (const row of rows) {
          if (row.ownerMembershipId) {
            out.set(row.ownerMembershipId, row._count._all);
          }
        }
        return out;
      }
      default: {
        for (const membershipId of params.membershipIds) {
          out.set(
            membershipId,
            await this.achievedValue({
              tenantId: params.tenantId,
              metricCode: params.metricCode,
              productId: null,
              from: params.from,
              toExclusive: params.toExclusive,
              membershipIds: [membershipId],
            }),
          );
        }
        return out;
      }
    }
  }

  /**
   * The Insights trail: one point per elapsed day. Days that booked nothing
   * still appear, so the running average divides by the right denominator.
   */
  private async dailyPoints(params: {
    tenantId: string;
    metricCode: string;
    membershipIds: string[];
    from: Date;
    toExclusive: Date;
    timeZone: string;
    days: string[];
  }): Promise<Array<{ date: string; value: number }>> {
    const totals = new Map(params.days.map((day) => [day, 0]));
    if (params.membershipIds.length === 0 || params.days.length === 0) {
      return params.days.map((date) => ({ date, value: 0 }));
    }
    const ids = { in: params.membershipIds };
    const window = { gte: params.from, lt: params.toExclusive };

    const add = (at: Date | null, value: number) => {
      if (at == null) {
        return;
      }
      const day = formatYmd(at, params.timeZone);
      if (totals.has(day)) {
        totals.set(day, (totals.get(day) ?? 0) + value);
      }
    };

    if (params.metricCode === 'revenue' || params.metricCode === 'quotations_accepted') {
      const rows = await this.prisma.quotation.findMany({
        where: {
          tenantId: params.tenantId,
          deletedAt: null,
          status: QuotationStatus.won,
          wonAt: window,
          assignedToMembershipId: ids,
        },
        select: { wonAt: true, totalMinor: true },
        take: SALES_BOARD_SERIES_CAP,
      });
      for (const row of rows) {
        add(row.wonAt, params.metricCode === 'revenue' ? Number(row.totalMinor) : 1);
      }
    } else if (params.metricCode === 'follow_ups_completed') {
      const rows = await this.prisma.followUp.findMany({
        where: {
          tenantId: params.tenantId,
          deletedAt: null,
          status: FollowUpStatus.completed,
          completedAt: window,
          assignedToMembershipId: ids,
        },
        select: { completedAt: true },
        take: SALES_BOARD_SERIES_CAP,
      });
      for (const row of rows) {
        add(row.completedAt, 1);
      }
    } else if (params.metricCode === 'leads_created') {
      const rows = await this.prisma.lead.findMany({
        where: {
          tenantId: params.tenantId,
          deletedAt: null,
          createdAt: window,
          ownerMembershipId: ids,
        },
        select: { createdAt: true },
        take: SALES_BOARD_SERIES_CAP,
      });
      for (const row of rows) {
        add(row.createdAt, 1);
      }
    }

    return params.days.map((date) => ({ date, value: totals.get(date) ?? 0 }));
  }

  /**
   * Completion rates behind the suggestions: how much of the scheduled work
   * in the period actually closed. Null when nothing was scheduled — there is
   * no rate to improve and no suggestion to make.
   */
  private async activityRates(params: {
    tenantId: string;
    membershipIds: string[];
    from: Date;
    toExclusive: Date;
  }): Promise<{ followUpCompletionBps: number | null; visitCompletionBps: number | null }> {
    if (params.membershipIds.length === 0) {
      return { followUpCompletionBps: null, visitCompletionBps: null };
    }
    const ids = { in: params.membershipIds };
    const window = { gte: params.from, lt: params.toExclusive };
    const [followUpsDue, followUpsDone, visitsDue, visitsDone] = await Promise.all([
      this.prisma.followUp.count({
        where: {
          tenantId: params.tenantId,
          deletedAt: null,
          dueAt: window,
          assignedToMembershipId: ids,
        },
      }),
      this.prisma.followUp.count({
        where: {
          tenantId: params.tenantId,
          deletedAt: null,
          dueAt: window,
          status: FollowUpStatus.completed,
          assignedToMembershipId: ids,
        },
      }),
      this.prisma.siteVisit.count({
        where: {
          tenantId: params.tenantId,
          deletedAt: null,
          scheduledAt: window,
          assignedToMembershipId: ids,
        },
      }),
      this.prisma.siteVisit.count({
        where: {
          tenantId: params.tenantId,
          deletedAt: null,
          scheduledAt: window,
          status: SiteVisitStatus.completed,
          assignedToMembershipId: ids,
        },
      }),
    ]);
    const rate = (done: number, due: number) =>
      due <= 0 ? null : Math.round((Math.min(done, due) / due) * 10000);
    return {
      followUpCompletionBps: rate(followUpsDone, followUpsDue),
      visitCompletionBps: rate(visitsDone, visitsDue),
    };
  }

  private newProgressSession(tenantId: string, timeZone: string, now: Date, today: string) {
    return {
      tenantId,
      timeZone,
      now,
      today,
      membershipCache: new Map<string, string[] | null>(),
      scopeNameCache: new Map<string, string | null>(),
    };
  }

  private async toViews(
    rows: TargetRow[],
    session: {
      tenantId: string;
      timeZone: string;
      now: Date;
      today: string;
      membershipCache: Map<string, string[] | null>;
      scopeNameCache: Map<string, string | null>;
    },
  ): Promise<TargetView[]> {
    const views: TargetView[] = [];
    for (const row of rows) {
      const membershipIds = await this.membershipIdsForScope(row, session);
      const range = periodRangeUtc(
        dateToYmd(row.periodStart) ?? session.today,
        dateToYmd(row.periodEnd) ?? session.today,
        session.timeZone,
      );
      const achievedValue = await this.achievedValue({
        tenantId: session.tenantId,
        metricCode: row.metricCode,
        productId: row.productId,
        from: range.from,
        toExclusive: range.toExclusive,
        membershipIds,
      });
      const scopeName = await this.scopeName(row, session);
      views.push(
        toTargetView({
          row: row as TargetMappedRow,
          achievedValue,
          today: session.today,
          scopeName,
        }),
      );
    }
    return views;
  }

  private async membershipIdsForScope(
    row: Pick<TargetRow, 'scopeType' | 'scopeId'>,
    session: { tenantId: string; membershipCache: Map<string, string[] | null> },
  ): Promise<string[] | null> {
    if (row.scopeType === 'tenant') {
      return null;
    }
    const key = `${row.scopeType}:${row.scopeId ?? ''}`;
    const cached = session.membershipCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    if (!row.scopeId) {
      session.membershipCache.set(key, []);
      return [];
    }
    let ids: string[] = [];
    if (row.scopeType === 'membership') {
      ids = [row.scopeId];
    } else if (row.scopeType === 'team') {
      const members = await this.prisma.membership.findMany({
        where: {
          tenantId: session.tenantId,
          deletedAt: null,
          OR: [{ teamId: row.scopeId }, { teamLinks: { some: { teamId: row.scopeId } } }],
        },
        select: { id: true },
      });
      ids = members.map((member) => member.id);
    } else if (row.scopeType === 'branch') {
      const members = await this.prisma.membership.findMany({
        where: { tenantId: session.tenantId, deletedAt: null, branchId: row.scopeId },
        select: { id: true },
      });
      ids = members.map((member) => member.id);
    }
    session.membershipCache.set(key, ids);
    return ids;
  }

  private async scopeName(
    row: Pick<TargetRow, 'scopeType' | 'scopeId'>,
    session: { tenantId: string; scopeNameCache: Map<string, string | null> },
  ): Promise<string | null> {
    if (row.scopeType === 'tenant') {
      return 'Company';
    }
    if (!row.scopeId) {
      return null;
    }
    const key = `${row.scopeType}:${row.scopeId}`;
    const cached = session.scopeNameCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    let name: string | null = null;
    if (row.scopeType === 'team') {
      const team = await this.prisma.team.findFirst({
        where: { id: row.scopeId, tenantId: session.tenantId },
        select: { name: true },
      });
      name = team?.name ?? null;
    } else if (row.scopeType === 'membership') {
      const member = await this.prisma.membership.findFirst({
        where: { id: row.scopeId, tenantId: session.tenantId },
        select: { user: { select: { fullName: true } } },
      });
      name = member?.user.fullName ?? null;
    } else if (row.scopeType === 'branch') {
      name = 'Branch';
    }
    session.scopeNameCache.set(key, name);
    return name;
  }

  private async achievedValue(params: {
    tenantId: string;
    metricCode: string;
    productId: string | null;
    from: Date;
    toExclusive: Date;
    membershipIds: string[] | null;
  }): Promise<number> {
    if (params.membershipIds && params.membershipIds.length === 0) {
      return 0;
    }
    const memberFilter = params.membershipIds
      ? { in: params.membershipIds }
      : undefined;
    switch (params.metricCode) {
      case 'revenue':
        return this.sumRevenue(params, memberFilter);
      case 'units_sold':
        return this.sumUnitsSold(params, memberFilter);
      case 'leads_created':
        return this.prisma.lead.count({
          where: {
            tenantId: params.tenantId,
            deletedAt: null,
            createdAt: { gte: params.from, lt: params.toExclusive },
            ...(memberFilter ? { ownerMembershipId: memberFilter } : {}),
          },
        });
      case 'leads_won':
        return this.prisma.leadStageChange.count({
          where: {
            tenantId: params.tenantId,
            toLifecycleStatus: LeadLifecycleStatus.won,
            changedAt: { gte: params.from, lt: params.toExclusive },
            lead: {
              deletedAt: null,
              ...(memberFilter ? { ownerMembershipId: memberFilter } : {}),
            },
          },
        });
      case 'visits_completed':
        return this.prisma.siteVisit.count({
          where: {
            tenantId: params.tenantId,
            deletedAt: null,
            status: SiteVisitStatus.completed,
            ...(memberFilter ? { assignedToMembershipId: memberFilter } : {}),
            OR: [
              { checkedOutAt: { gte: params.from, lt: params.toExclusive } },
              { checkedOutAt: null, updatedAt: { gte: params.from, lt: params.toExclusive } },
            ],
          },
        });
      case 'follow_ups_completed':
        return this.prisma.followUp.count({
          where: {
            tenantId: params.tenantId,
            deletedAt: null,
            status: FollowUpStatus.completed,
            completedAt: { gte: params.from, lt: params.toExclusive },
            ...(memberFilter ? { assignedToMembershipId: memberFilter } : {}),
          },
        });
      case 'quotations_accepted':
        return this.prisma.quotation.count({
          where: {
            tenantId: params.tenantId,
            deletedAt: null,
            ...(memberFilter ? { assignedToMembershipId: memberFilter } : {}),
            ...(params.productId
              ? { items: { some: { deletedAt: null, productId: params.productId } } }
              : {}),
            OR: [
              { status: QuotationStatus.won, wonAt: { gte: params.from, lt: params.toExclusive } },
              {
                status: QuotationStatus.approved,
                approvedAt: { gte: params.from, lt: params.toExclusive },
              },
            ],
          },
        });
      default:
        return 0;
    }
  }

  private async sumRevenue(
    params: {
      tenantId: string;
      productId: string | null;
      from: Date;
      toExclusive: Date;
    },
    memberFilter: { in: string[] } | undefined,
  ): Promise<number> {
    if (params.productId) {
      const agg = await this.prisma.quotationItem.aggregate({
        _sum: { lineTotalMinor: true },
        where: {
          tenantId: params.tenantId,
          deletedAt: null,
          productId: params.productId,
          quotation: {
            deletedAt: null,
            status: QuotationStatus.won,
            wonAt: { gte: params.from, lt: params.toExclusive },
            ...(memberFilter ? { assignedToMembershipId: memberFilter } : {}),
          },
        },
      });
      return Number(agg._sum.lineTotalMinor ?? 0);
    }
    const agg = await this.prisma.quotation.aggregate({
      _sum: { totalMinor: true },
      where: {
        tenantId: params.tenantId,
        deletedAt: null,
        status: QuotationStatus.won,
        wonAt: { gte: params.from, lt: params.toExclusive },
        ...(memberFilter ? { assignedToMembershipId: memberFilter } : {}),
      },
    });
    return Number(agg._sum.totalMinor ?? 0);
  }

  private async sumUnitsSold(
    params: {
      tenantId: string;
      productId: string | null;
      from: Date;
      toExclusive: Date;
    },
    memberFilter: { in: string[] } | undefined,
  ): Promise<number> {
    const agg = await this.prisma.quotationItem.aggregate({
      _sum: { quantity: true },
      where: {
        tenantId: params.tenantId,
        deletedAt: null,
        ...(params.productId ? { productId: params.productId } : {}),
        quotation: {
          deletedAt: null,
          status: QuotationStatus.won,
          wonAt: { gte: params.from, lt: params.toExclusive },
          ...(memberFilter ? { assignedToMembershipId: memberFilter } : {}),
        },
      },
    });
    return Number(agg._sum.quantity ?? 0);
  }

  private async assertMetric(code: string) {
    const kpi = await this.prisma.kpiDefinition.findUnique({
      where: { code },
      select: { code: true },
    });
    if (!kpi) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Unknown metric', {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
  }

  private async assertProduct(tenantId: string, productId?: string) {
    if (!productId) {
      return;
    }
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!product) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Product not found', {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
  }

  private async assertScope(tenantId: string, scopeType: ScopeTypeCode, scopeId?: string) {
    if (scopeType === 'tenant') {
      if (scopeId) {
        throw new AppException(HttpStatus.BAD_REQUEST, 'Company targets must not set a scope id', {
          code: ErrorCodes.BAD_REQUEST,
        });
      }
      return;
    }
    if (!scopeId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Scope is required', {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
    if (scopeType === 'team') {
      const team = await this.prisma.team.findFirst({
        where: { id: scopeId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!team) {
        throw new AppException(HttpStatus.BAD_REQUEST, 'Team not found', {
          code: ErrorCodes.BAD_REQUEST,
        });
      }
      return;
    }
    if (scopeType === 'membership') {
      const member = await this.prisma.membership.findFirst({
        where: { id: scopeId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!member) {
        throw new AppException(HttpStatus.BAD_REQUEST, 'Staff member not found', {
          code: ErrorCodes.BAD_REQUEST,
        });
      }
    }
  }

  private throwWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'A target already exists for this scope, product, metric, and period',
        { code: ErrorCodes.CONFLICT },
      );
    }
    throw error;
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

function emptyToNull(value?: string | null): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
