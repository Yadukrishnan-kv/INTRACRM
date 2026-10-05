import { HttpStatus, Injectable } from '@nestjs/common';
import {
  IncentiveBasis,
  IncentivePayoutKind,
  IncentivePayoutStatus,
  IncentivePlanStatus,
  MembershipStatus,
  PeriodType,
  Prisma,
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
import { TargetsService } from '../../targets/application/targets.service';
import {
  PERIOD_CATALOG,
  SCOPE_CATALOG,
  dateToYmd,
  periodLabel,
  resolvePeriod,
  ymdToUtcDate,
} from '../../targets/domain/target-period';
import { formatYmd } from '../../tasks/domain/zoned-day';
import {
  BASIS_CATALOG,
  PAYOUT_KIND_CATALOG,
  PAYOUT_STATUSES,
  PLAN_STATUSES,
  Slab,
  computePayout,
  summarizeIncentives,
} from '../domain/incentive-engine';
import {
  ComputeIncentiveRequest,
  CreateIncentivePlanRequest,
  IncentivePlanListQuery,
  IncentiveReportQuery,
  MyIncentiveQuery,
  PayoutDecisionRequest,
  UpdateIncentivePlanRequest,
  UpsertSlabRequest,
} from '../interface/http/dto/incentive.dto';
import {
  PayoutView,
  PlanRow,
  PlanView,
  SlabView,
  toPayoutView,
  toPlanView,
  toSlabView,
} from './incentive.mapper';

const planInclude = {
  kpi: { select: { name: true, unit: true } },
  slabs: true,
} satisfies Prisma.IncentivePlanInclude;

const payoutInclude = {
  plan: { select: { name: true } },
  membership: { select: { user: { select: { fullName: true } } } },
  slab: { select: { label: true } },
} satisfies Prisma.IncentivePayoutInclude;

/** One tenant's sales force; far past any real headcount. */
const MEMBER_CAP = 2000;
const REPORT_CAP = 2000;

@Injectable()
export class IncentivesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: TargetsService,
  ) {}

  catalog() {
    return {
      bases: BASIS_CATALOG,
      payoutKinds: PAYOUT_KIND_CATALOG,
      planStatuses: PLAN_STATUSES,
      payoutStatuses: PAYOUT_STATUSES,
      periods: PERIOD_CATALOG,
      scopes: SCOPE_CATALOG,
    };
  }

  // ---------------------------------------------------------------------------
  // Plans
  // ---------------------------------------------------------------------------

  async listPlans(actor: AuthUser, query: IncentivePlanListQuery) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const where: Prisma.IncentivePlanWhereInput = { tenantId, deletedAt: null };
    if (query.status) {
      where.status = query.status as IncentivePlanStatus;
    }
    if (query.metricCode) {
      where.metricCode = query.metricCode;
    }
    if (query.cursor) {
      where.id = { lt: this.decodeId(query.cursor) };
    }
    const rows = await this.prisma.incentivePlan.findMany({
      where,
      include: planInclude,
      orderBy: [{ id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      data: pageRows.map((row) => toPlanView(row as PlanRow)),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor: hasMore && last ? encodeCursor({ id: last.id }) : null,
      }),
    };
  }

  async getPlan(actor: AuthUser, planId: string): Promise<PlanView> {
    const tenantId = this.requireTenant(actor);
    return toPlanView((await this.requirePlan(tenantId, planId)) as PlanRow);
  }

  async createPlan(actor: AuthUser, dto: CreateIncentivePlanRequest): Promise<PlanView> {
    const tenantId = this.requireTenant(actor);
    await this.assertMetric(dto.metricCode);
    this.assertWindow(dto.effectiveFrom, dto.effectiveTo);
    try {
      const created = await this.prisma.incentivePlan.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          description: dto.description?.trim() ?? null,
          metricCode: dto.metricCode,
          periodType: (dto.periodType ?? 'monthly') as PeriodType,
          scopeType: (dto.scopeType ?? 'membership') as TargetScopeType,
          basis: (dto.basis ?? 'revenue') as IncentiveBasis,
          status: (dto.status ?? 'draft') as IncentivePlanStatus,
          holdBps: dto.holdBps ?? 0,
          minAttainmentBps: dto.minAttainmentBps ?? 0,
          payoutCap: dto.payoutCap ?? null,
          effectiveFrom: ymdToUtcDate(dto.effectiveFrom),
          effectiveTo: dto.effectiveTo ? ymdToUtcDate(dto.effectiveTo) : null,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
        include: planInclude,
      });
      return toPlanView(created as PlanRow);
    } catch (error) {
      throw this.writeError(error, 'A plan with this name already exists');
    }
  }

  async updatePlan(
    actor: AuthUser,
    planId: string,
    dto: UpdateIncentivePlanRequest,
  ): Promise<PlanView> {
    const tenantId = this.requireTenant(actor);
    const current = await this.requirePlan(tenantId, planId);
    this.assertVersion(current.version, dto.version);
    this.assertWindow(dateToYmd(current.effectiveFrom) ?? '', dto.effectiveTo);
    try {
      const updated = await this.prisma.incentivePlan.update({
        where: { id: planId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || null }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status as IncentivePlanStatus } : {}),
          ...(dto.holdBps !== undefined ? { holdBps: dto.holdBps } : {}),
          ...(dto.minAttainmentBps !== undefined
            ? { minAttainmentBps: dto.minAttainmentBps }
            : {}),
          ...(dto.payoutCap !== undefined ? { payoutCap: dto.payoutCap } : {}),
          ...(dto.effectiveTo !== undefined
            ? { effectiveTo: ymdToUtcDate(dto.effectiveTo) }
            : {}),
          updatedBy: actor.userId,
        },
        include: planInclude,
      });
      return toPlanView(updated as PlanRow);
    } catch (error) {
      throw this.writeError(error, 'A plan with this name already exists');
    }
  }

  async removePlan(actor: AuthUser, planId: string): Promise<{ id: string }> {
    const tenantId = this.requireTenant(actor);
    await this.requirePlan(tenantId, planId);
    // A plan that has already paid someone is archived, not deleted: the
    // payout rows reference it and must stay explainable.
    const paid = await this.prisma.incentivePayout.count({
      where: { planId, status: { in: [IncentivePayoutStatus.approved, IncentivePayoutStatus.paid] } },
    });
    if (paid > 0) {
      throw new AppException(HttpStatus.CONFLICT, 'Plan has approved payouts', {
        code: ErrorCodes.CONFLICT,
        detail: 'Archive the plan instead of deleting it.',
      });
    }
    await this.prisma.incentivePlan.update({
      where: { id: planId },
      data: { deletedAt: new Date(), deletedBy: actor.userId },
    });
    return { id: planId };
  }

  // ---------------------------------------------------------------------------
  // Slabs
  // ---------------------------------------------------------------------------

  async addSlab(actor: AuthUser, planId: string, dto: UpsertSlabRequest): Promise<SlabView> {
    const tenantId = this.requireTenant(actor);
    await this.requirePlan(tenantId, planId);
    this.assertSlab(dto);
    try {
      const created = await this.prisma.incentiveSlab.create({
        data: {
          tenantId,
          planId,
          label: dto.label?.trim() ?? null,
          fromBps: dto.fromBps,
          toBps: dto.toBps ?? null,
          payoutKind: dto.payoutKind as IncentivePayoutKind,
          rateBps: dto.rateBps ?? null,
          amount: dto.amount ?? null,
          perUnitAmount: dto.perUnitAmount ?? null,
          bonusAmount: dto.bonusAmount ?? 0,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      return toSlabView(created);
    } catch (error) {
      throw this.writeError(error, 'This band overlaps an existing slab');
    }
  }

  async updateSlab(
    actor: AuthUser,
    planId: string,
    slabId: string,
    dto: UpsertSlabRequest,
  ): Promise<SlabView> {
    const tenantId = this.requireTenant(actor);
    await this.requirePlan(tenantId, planId);
    const current = await this.prisma.incentiveSlab.findFirst({
      where: { id: slabId, planId, tenantId },
      select: { id: true },
    });
    if (!current) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Slab not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    this.assertSlab(dto);
    try {
      const updated = await this.prisma.incentiveSlab.update({
        where: { id: slabId },
        data: {
          label: dto.label?.trim() ?? null,
          fromBps: dto.fromBps,
          toBps: dto.toBps ?? null,
          payoutKind: dto.payoutKind as IncentivePayoutKind,
          rateBps: dto.rateBps ?? null,
          amount: dto.amount ?? null,
          perUnitAmount: dto.perUnitAmount ?? null,
          bonusAmount: dto.bonusAmount ?? 0,
          updatedBy: actor.userId,
        },
      });
      return toSlabView(updated);
    } catch (error) {
      throw this.writeError(error, 'This band overlaps an existing slab');
    }
  }

  async removeSlab(actor: AuthUser, planId: string, slabId: string): Promise<{ id: string }> {
    const tenantId = this.requireTenant(actor);
    await this.requirePlan(tenantId, planId);
    const deleted = await this.prisma.incentiveSlab.deleteMany({
      where: { id: slabId, planId, tenantId },
    });
    if (deleted.count === 0) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Slab not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return { id: slabId };
  }

  // ---------------------------------------------------------------------------
  // Computation
  // ---------------------------------------------------------------------------

  /**
   * Recomputes one plan over one period for every active member in scope and
   * stores the result. Payouts already approved or paid are left alone — the
   * figure someone was told they had earned does not move under them.
   */
  async compute(actor: AuthUser, dto: ComputeIncentiveRequest) {
    const tenantId = this.requireTenant(actor);
    const plan = await this.requirePlan(tenantId, dto.planId);
    const timeZone = await this.targets.timeZoneFor(tenantId);
    const now = new Date();
    const period = resolvePeriod({
      periodType: plan.periodType,
      ...(dto.periodStart ? { periodStart: dto.periodStart } : {}),
      ...(dto.periodEnd ? { periodEnd: dto.periodEnd } : {}),
      now,
      timeZone,
    });

    const members = await this.prisma.membership.findMany({
      where: { tenantId, deletedAt: null, status: MembershipStatus.active },
      select: { id: true },
      take: MEMBER_CAP,
    });
    const membershipIds = members.map((member) => member.id);

    const [targets, achieved] = await Promise.all([
      this.prisma.target.findMany({
        where: {
          tenantId,
          deletedAt: null,
          metricCode: plan.metricCode,
          scopeType: TargetScopeType.membership,
          scopeId: { in: membershipIds },
          periodStart: { lte: ymdToUtcDate(period.end) },
          periodEnd: { gte: ymdToUtcDate(period.start) },
        },
        select: { id: true, scopeId: true, targetValue: true },
      }),
      this.targets.achievedForMembers({
        tenantId,
        metricCode: plan.metricCode,
        membershipIds,
        periodStart: period.start,
        periodEnd: period.end,
        timeZone,
      }),
    ]);

    const targetByMember = new Map<string, { id: string; value: number }>();
    for (const row of targets) {
      if (!row.scopeId) {
        continue;
      }
      const existing = targetByMember.get(row.scopeId);
      targetByMember.set(row.scopeId, {
        id: existing?.id ?? row.id,
        value: (existing?.value ?? 0) + Number(row.targetValue),
      });
    }

    const slabs: Slab[] = (plan.slabs ?? []).map(toSlabView);
    const locked = await this.prisma.incentivePayout.findMany({
      where: {
        tenantId,
        planId: plan.id,
        periodStart: ymdToUtcDate(period.start),
        periodEnd: ymdToUtcDate(period.end),
        status: { in: [IncentivePayoutStatus.approved, IncentivePayoutStatus.paid] },
      },
      select: { membershipId: true },
    });
    const lockedIds = new Set(locked.map((row) => row.membershipId));

    let written = 0;
    let skipped = 0;
    for (const membershipId of membershipIds) {
      if (lockedIds.has(membershipId)) {
        skipped += 1;
        continue;
      }
      const target = targetByMember.get(membershipId);
      const result = computePayout({
        plan: {
          id: plan.id,
          name: plan.name,
          basis: plan.basis,
          holdBps: plan.holdBps,
          minAttainmentBps: plan.minAttainmentBps,
          payoutCap: plan.payoutCap == null ? null : Number(plan.payoutCap),
        },
        slabs,
        targetValue: target?.value ?? 0,
        achievedValue: achieved.get(membershipId) ?? 0,
      });

      const data = {
        targetId: target?.id ?? null,
        targetValue: result.targetValue,
        achievedValue: result.achievedValue,
        attainmentBps: result.attainmentBps,
        slabId: result.slabId,
        earnedAmount: result.earnedAmount,
        holdAmount: result.holdAmount,
        payableAmount: result.payableAmount,
        computedAt: now,
        updatedBy: actor.userId,
      };
      // membershipId is nullable, so Prisma offers no compound unique input
      // for this key; the unique index still guards against a double write.
      const existing = await this.prisma.incentivePayout.findFirst({
        where: {
          tenantId,
          planId: plan.id,
          membershipId,
          periodStart: ymdToUtcDate(period.start),
          periodEnd: ymdToUtcDate(period.end),
        },
        select: { id: true },
      });
      if (existing) {
        await this.prisma.incentivePayout.update({ where: { id: existing.id }, data });
      } else {
        await this.prisma.incentivePayout.create({
          data: {
            tenantId,
            planId: plan.id,
            membershipId,
            periodStart: ymdToUtcDate(period.start),
            periodEnd: ymdToUtcDate(period.end),
            status: IncentivePayoutStatus.draft,
            createdBy: actor.userId,
            ...data,
          },
        });
      }
      written += 1;
    }

    return {
      planId: plan.id,
      periodStart: period.start,
      periodEnd: period.end,
      periodLabel: periodLabel(plan.periodType, period.start, period.end),
      computed: written,
      skipped,
      computedAt: now.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  /** The viewer's own incentive card for a period. */
  async mine(actor: AuthUser, query: MyIncentiveQuery) {
    const tenantId = this.requireTenant(actor);
    if (!actor.membershipId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Membership required', {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
    const timeZone = await this.targets.timeZoneFor(tenantId);
    const today = query.periodStart ?? formatYmd(new Date(), timeZone);
    const rows = await this.prisma.incentivePayout.findMany({
      where: {
        tenantId,
        membershipId: actor.membershipId,
        ...(query.planId ? { planId: query.planId } : {}),
        periodStart: { lte: ymdToUtcDate(today) },
        periodEnd: { gte: ymdToUtcDate(today) },
      },
      include: payoutInclude,
      orderBy: [{ periodStart: 'desc' }],
      take: 20,
    });
    const views = rows.map(toPayoutView);
    const wonOrders = await this.wonOrdersFor(tenantId, [actor.membershipId], views);
    return {
      generatedAt: new Date().toISOString(),
      timeZone,
      today,
      items: views,
      summary: summarizeIncentives(
        views.map((view) => ({
          attainmentBps: view.attainmentBps,
          targetValue: view.targetValue,
          achievedValue: view.achievedValue,
          earnedAmount: view.earnedAmount,
          holdAmount: view.holdAmount,
          payableAmount: view.payableAmount,
          paidAmount: view.paidAmount,
          status: view.status,
          wonOrders: wonOrders.get(view.membershipId ?? '') ?? 0,
        })),
      ),
    };
  }

  /** Reports → Incentive & Achievement. */
  async report(actor: AuthUser, query: IncentiveReportQuery) {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.targets.timeZoneFor(tenantId);
    const where: Prisma.IncentivePayoutWhereInput = { tenantId };
    if (query.planId) {
      where.planId = query.planId;
    }
    if (query.membershipId) {
      where.membershipId = query.membershipId;
    }
    if (query.status) {
      where.status = query.status as IncentivePayoutStatus;
    }
    if (query.from) {
      where.periodEnd = { gte: ymdToUtcDate(query.from) };
    }
    if (query.to) {
      where.periodStart = { lte: ymdToUtcDate(query.to) };
    }

    const rows = await this.prisma.incentivePayout.findMany({
      where,
      include: payoutInclude,
      orderBy: [{ periodStart: 'desc' }, { earnedAmount: 'desc' }],
      take: REPORT_CAP,
    });
    const views = rows.map(toPayoutView);
    const membershipIds = [
      ...new Set(views.map((view) => view.membershipId).filter((id): id is string => id != null)),
    ];
    const wonOrders = await this.wonOrdersFor(tenantId, membershipIds, views);

    const summary = summarizeIncentives(
      views.map((view) => ({
        attainmentBps: view.attainmentBps,
        targetValue: view.targetValue,
        achievedValue: view.achievedValue,
        earnedAmount: view.earnedAmount,
        holdAmount: view.holdAmount,
        payableAmount: view.payableAmount,
        paidAmount: view.paidAmount,
        status: view.status,
        wonOrders: wonOrders.get(view.membershipId ?? '') ?? 0,
      })),
    );

    // Per-person rows, highest earning first — the table under the cards.
    const byMember = new Map<string, {
      membershipId: string | null;
      membershipName: string | null;
      targetValue: number;
      achievedValue: number;
      earnedAmount: number;
      payableAmount: number;
      paidAmount: number;
      wonOrders: number;
      periods: number;
    }>();
    for (const view of views) {
      if (view.status === 'void') {
        continue;
      }
      const key = view.membershipId ?? 'unassigned';
      const bucket = byMember.get(key) ?? {
        membershipId: view.membershipId,
        membershipName: view.membershipName,
        targetValue: 0,
        achievedValue: 0,
        earnedAmount: 0,
        payableAmount: 0,
        paidAmount: 0,
        wonOrders: wonOrders.get(view.membershipId ?? '') ?? 0,
        periods: 0,
      };
      bucket.targetValue += view.targetValue;
      bucket.achievedValue += view.achievedValue;
      bucket.earnedAmount += view.earnedAmount;
      bucket.payableAmount += view.payableAmount;
      bucket.paidAmount += view.paidAmount;
      bucket.periods += 1;
      byMember.set(key, bucket);
    }

    return {
      generatedAt: summary.generatedAt,
      timeZone,
      totals: summary.totals,
      byStatus: summary.byStatus,
      byMember: [...byMember.values()].sort((a, b) => b.earnedAmount - a.earnedAmount),
      items: views,
    };
  }

  async approve(actor: AuthUser, payoutId: string, dto: PayoutDecisionRequest) {
    return this.decide(actor, payoutId, dto, 'approve');
  }

  async markPaid(actor: AuthUser, payoutId: string, dto: PayoutDecisionRequest) {
    return this.decide(actor, payoutId, dto, 'pay');
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async decide(
    actor: AuthUser,
    payoutId: string,
    dto: PayoutDecisionRequest,
    action: 'approve' | 'pay',
  ): Promise<PayoutView> {
    const tenantId = this.requireTenant(actor);
    const current = await this.prisma.incentivePayout.findFirst({
      where: { id: payoutId, tenantId },
      include: payoutInclude,
    });
    if (!current) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Payout not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    this.assertVersion(current.version, dto.version);

    const now = new Date();
    if (action === 'approve') {
      if (current.status !== IncentivePayoutStatus.draft) {
        throw new AppException(HttpStatus.CONFLICT, 'Payout is not a draft', {
          code: ErrorCodes.CONFLICT,
          detail: `Only a draft payout can be approved; this one is ${current.status}.`,
        });
      }
      const updated = await this.prisma.incentivePayout.update({
        where: { id: payoutId },
        data: {
          status: IncentivePayoutStatus.approved,
          approvedAt: now,
          approvedBy: actor.userId,
          ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
          updatedBy: actor.userId,
        },
        include: payoutInclude,
      });
      return toPayoutView(updated);
    }

    if (current.status !== IncentivePayoutStatus.approved) {
      throw new AppException(HttpStatus.CONFLICT, 'Payout is not approved', {
        code: ErrorCodes.CONFLICT,
        detail: `A payout must be approved before it is paid; this one is ${current.status}.`,
      });
    }
    const updated = await this.prisma.incentivePayout.update({
      where: { id: payoutId },
      data: {
        status: IncentivePayoutStatus.paid,
        paidAt: now,
        paidAmount: dto.paidAmount ?? current.payableAmount,
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
        updatedBy: actor.userId,
      },
      include: payoutInclude,
    });
    return toPayoutView(updated);
  }

  /**
   * Won orders per member over the widest period the rows cover. One query
   * for the whole report rather than one per row.
   */
  private async wonOrdersFor(
    tenantId: string,
    membershipIds: string[],
    views: PayoutView[],
  ): Promise<Map<string, number>> {
    if (membershipIds.length === 0 || views.length === 0) {
      return new Map();
    }
    const starts = views.map((view) => view.periodStart).filter(Boolean).sort();
    const ends = views.map((view) => view.periodEnd).filter(Boolean).sort();
    const from = starts[0];
    const to = ends[ends.length - 1];
    if (!from || !to) {
      return new Map();
    }
    const timeZone = await this.targets.timeZoneFor(tenantId);
    return this.targets.achievedForMembers({
      tenantId,
      metricCode: 'quotations_accepted',
      membershipIds,
      periodStart: from,
      periodEnd: to,
      timeZone,
    });
  }

  private async requirePlan(tenantId: string, planId: string) {
    const plan = await this.prisma.incentivePlan.findFirst({
      where: { id: planId, tenantId, deletedAt: null },
      include: planInclude,
    });
    if (!plan) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Incentive plan not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return plan;
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

  private assertWindow(from: string, to?: string) {
    if (to && from && to < from) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Invalid plan window', {
        code: ErrorCodes.BAD_REQUEST,
        detail: 'effectiveTo must be on or after effectiveFrom.',
      });
    }
  }

  /**
   * The database enforces the same rule, but a 400 naming the missing field
   * is a better answer than a check-constraint violation.
   */
  private assertSlab(dto: UpsertSlabRequest) {
    if (dto.toBps != null && dto.toBps <= dto.fromBps) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Invalid slab band', {
        code: ErrorCodes.BAD_REQUEST,
        detail: 'toBps must be greater than fromBps.',
      });
    }
    const missing =
      (dto.payoutKind === 'percent' && dto.rateBps == null) ||
      (dto.payoutKind === 'flat' && dto.amount == null) ||
      (dto.payoutKind === 'per_unit' && dto.perUnitAmount == null);
    if (missing) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Incomplete slab', {
        code: ErrorCodes.BAD_REQUEST,
        detail: `A ${dto.payoutKind} slab needs its matching rate or amount.`,
      });
    }
  }

  private assertVersion(current: number, incoming?: number) {
    if (incoming != null && incoming !== current) {
      throw new AppException(HttpStatus.CONFLICT, 'Stale version', {
        code: ErrorCodes.STALE_VERSION,
        detail: `Expected version ${current}.`,
      });
    }
  }

  private decodeId(cursor: string): string {
    try {
      const decoded = decodeCursor(cursor);
      if (!decoded.id) {
        throw new Error('Invalid cursor');
      }
      return decoded.id;
    } catch {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Invalid cursor', {
        code: ErrorCodes.BAD_REQUEST,
        detail: 'The pagination cursor is not valid.',
      });
    }
  }

  private writeError(error: unknown, conflictMessage: string): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2010')
    ) {
      return new AppException(HttpStatus.CONFLICT, conflictMessage, {
        code: ErrorCodes.CONFLICT,
      });
    }
    return error as Error;
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
