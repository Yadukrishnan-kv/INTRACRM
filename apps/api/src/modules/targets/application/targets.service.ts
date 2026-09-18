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
  PERIOD_CATALOG,
  PeriodTypeCode,
  SCOPE_CATALOG,
  ScopeTypeCode,
  dateToYmd,
  monthBoundsFromYmd,
  periodRangeUtc,
  resolvePeriod,
  ymdToUtcDate,
} from '../domain/target-period';
import { summarizeTargets } from '../domain/target-report';
import { TargetMappedRow, TargetView, toTargetView } from './target.mapper';
import {
  CreateTargetRequest,
  TargetListQuery,
  TargetReportQuery,
  UpdateTargetRequest,
} from '../interface/http/dto/target.dto';

const targetInclude = {
  kpi: { select: { name: true, unit: true } },
  product: { select: { name: true, sku: true } },
} satisfies Prisma.TargetInclude;

type TargetRow = Prisma.TargetGetPayload<{ include: typeof targetInclude }>;

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
