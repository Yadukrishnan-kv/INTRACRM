import { HttpStatus, Injectable } from '@nestjs/common';
import { MembershipStatus, Prisma, QuotationStatus } from '@prisma/client';
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
import { wholeQuantity } from '../../../common/whole-quantity';
import { DEFAULT_TAX_RATES } from '../../catalog/domain/catalog';
import { TIMELINE_EVENT } from '../../activities/domain/timeline-events';
import { TimelineWriter } from '../../activities/application/timeline.writer';
import { AuditWriter, trackPayload } from '../../audit/application/audit.writer';
import { TRACK_ACTION, TRACK_RESOURCE } from '../../audit/domain/track-events';
import { BillingService } from '../../billing/application/billing.service';
import { QuotationFollowUpService } from './quotation-follow-up.service';
import { formatYmd, startOfNextZonedDay } from '../../tasks/domain/zoned-day';
import { summarizeQuotations } from '../domain/quotation-report';
import { summarizeSales } from '../domain/sales-report';
import { computeQuotationTotals } from '../domain/quotation-totals';
import {
  addDaysYmd,
  dateToYmd,
  defaultReminderSchedule,
  isClosingOverdue,
  isClosingSoon,
  predictQuotationClose,
  reminderBucket,
} from '../domain/quotation-follow-up';
import {
  canSendQuotationStatus,
  canTransitionQuotation,
  isDraftQuotation,
  isPendingQuotation,
  isTerminalQuotation,
  PENDING_QUOTATION_STATUSES,
  quotationCatalog,
  QUOTATION_STATUS_LABELS,
  QuotationStatusCode,
  timestampFieldForStatus,
} from '../domain/quotation-types';
import { toQuotationView } from './quotation.mapper';
import {
  ChangeQuotationStatusRequest,
  CreateQuotationRequest,
  QuotationItemInput,
  QuotationListQuery,
  QuotationReportQuery,
  SalesReportQuery,
  ScheduleQuotationFollowUpRequest,
  SendQuotationBody,
  UpdateQuotationRequest,
} from '../interface/http/dto/quotation.dto';

const quotationInclude = {
  assignee: { include: { user: true } },
  lead: { select: { id: true, leadNumber: true, title: true, customerName: true } },
  items: {
    where: { deletedAt: null },
    include: { product: { select: { name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.QuotationInclude;

type QuotationRow = Prisma.QuotationGetPayload<{ include: typeof quotationInclude }>;

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineWriter,
    private readonly quotationFollowUps: QuotationFollowUpService,
    private readonly audit: AuditWriter,
    private readonly billing: BillingService,
  ) {}

  async catalog(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    const products = await this.prisma.product.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      take: 200,
      select: {
        id: true,
        sku: true,
        name: true,
        unitPriceMinor: true,
        currency: true,
      },
    });
    return {
      ...quotationCatalog(),
      products: products.map((product) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        unitPriceMinor: product.unitPriceMinor == null ? null : Number(product.unitPriceMinor),
        currency: product.currency,
      })),
      taxes: await this.listTaxes(tenantId),
    };
  }

  private async listTaxes(tenantId: string) {
    let taxes = await this.prisma.taxRate.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (!taxes.length) {
      for (const tax of DEFAULT_TAX_RATES) {
        const existing = await this.prisma.taxRate.findFirst({
          where: { tenantId, code: tax.code, deletedAt: null },
        });
        if (!existing) {
          await this.prisma.taxRate.create({
            data: {
              tenantId,
              code: tax.code,
              name: tax.name,
              rateBps: tax.rateBps,
              sortOrder: tax.sortOrder,
            },
          });
        }
      }
      taxes = await this.prisma.taxRate.findMany({
        where: { tenantId, deletedAt: null, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    }
    return taxes.map((tax) => ({
      id: tax.id,
      code: tax.code,
      name: tax.name,
      rateBps: tax.rateBps,
      ratePercent: Math.round(tax.rateBps) / 100,
    }));
  }

  async list(actor: AuthUser, query: QuotationListQuery) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const where: Prisma.QuotationWhereInput = { tenantId, deletedAt: null };
    if (query.leadId) {
      where.leadId = query.leadId;
    }
    if (query.assignedToMembershipId) {
      where.assignedToMembershipId = query.assignedToMembershipId;
    }
    if (query.bucket) {
      Object.assign(where, this.bucketWhere(query.bucket, now, timeZone));
    } else if (query.status) {
      where.status = query.status;
    } else if (query.pending) {
      where.status = { in: [...PENDING_QUOTATION_STATUSES] };
    }
    if (query.cursor) {
      try {
        const cursor = decodeCursor(query.cursor);
        const createdAt = cursor.createdAt;
        const id = cursor.id;
        if (!createdAt || !id) {
          throw new Error('Invalid cursor');
        }
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          {
            OR: [
              { createdAt: { lt: new Date(createdAt) } },
              { createdAt: new Date(createdAt), id: { lt: id } },
            ],
          },
        ];
      } catch {
        throw new AppException(HttpStatus.BAD_REQUEST, 'Invalid cursor', {
          code: ErrorCodes.BAD_REQUEST,
        });
      }
    }
    const rows = await this.prisma.quotation.findMany({
      where,
      include: quotationInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const ctx = { now, timeZone };
    return {
      data: pageRows.map((row) => toQuotationView(row, ctx)),
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

  async get(actor: AuthUser, quotationId: string) {
    const tenantId = this.requireTenant(actor);
    return toQuotationView(await this.requireQuotation(tenantId, quotationId), {
      now: new Date(),
      timeZone: await this.tenantZone(tenantId),
    });
  }

  async listForLead(actor: AuthUser, leadId: string) {
    const tenantId = this.requireTenant(actor);
    await this.requireLead(tenantId, leadId);
    const timeZone = await this.tenantZone(tenantId);
    const rows = await this.prisma.quotation.findMany({
      where: { tenantId, leadId, deletedAt: null },
      include: quotationInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    const ctx = { now: new Date(), timeZone };
    return rows.map((row) => toQuotationView(row, ctx));
  }

  async create(actor: AuthUser, dto: CreateQuotationRequest) {
    const tenantId = this.requireTenant(actor);
    const lead = await this.requireLead(tenantId, dto.leadId);
    const assignee = dto.assignedToMembershipId ?? lead.ownerMembershipId ?? actor.membershipId ?? null;
    if (assignee) {
      await this.requireActiveStaff(tenantId, assignee);
    }
    const items = await this.hydrateTaxes(tenantId, dto.items);
    const totals = computeQuotationTotals(this.lineInputs(items));
    const created = await this.prisma.$transaction(async (tx) => {
      const quotationNumber = await this.nextNumber(tx, tenantId);
      const quotation = await tx.quotation.create({
        data: {
          tenantId,
          leadId: lead.id,
          quotationNumber,
          title: emptyToNull(dto.title) ?? lead.title,
          currency: (dto.currency ?? 'INR').toUpperCase(),
          subtotalMinor: BigInt(totals.subtotalMinor),
          discountMinor: BigInt(totals.discountMinor),
          taxMinor: BigInt(totals.taxMinor),
          totalMinor: BigInt(totals.totalMinor),
          createdBy: actor.userId,
          updatedBy: actor.userId,
          ...(assignee ? { assignedToMembershipId: assignee } : {}),
          ...(emptyToNull(dto.notes) ? { notes: emptyToNull(dto.notes) } : {}),
          ...(emptyToNull(dto.terms) ? { terms: emptyToNull(dto.terms) } : {}),
          ...(dto.validUntilOn ? { validUntilOn: new Date(dto.validUntilOn) } : {}),
          ...(dto.expectedCloseOn ? { expectedCloseOn: dateFromYmd(dto.expectedCloseOn) } : {}),
        },
      });
      await this.writeItems(tx, {
        tenantId,
        quotationId: quotation.id,
        actorUserId: actor.userId,
        items: items,
        lines: totals.lines,
      });
      await this.timeline.record(
        {
          tenantId,
          leadId: lead.id,
          actor,
          eventCode: 'system',
          subject: 'Quotation drafted',
          body: `${quotationNumber} · INR ${(totals.totalMinor / 100).toFixed(0)}`,
          metadata: { quotationId: quotation.id, quotationNumber },
        },
        tx,
      );
      await this.audit.record(
        {
          tenantId,
          actor,
          action: TRACK_ACTION.create,
          resourceType: TRACK_RESOURCE.quotation,
          resourceId: quotation.id,
          after: trackPayload(`Quotation ${quotationNumber} created`, {
            number: quotationNumber,
          }),
        },
        tx,
      );
      return quotation;
    });
    return this.get(actor, created.id);
  }

  async update(actor: AuthUser, quotationId: string, dto: UpdateQuotationRequest) {
    const tenantId = this.requireTenant(actor);
    const quotation = await this.requireQuotation(tenantId, quotationId);
    if (!isDraftQuotation(quotation.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Only a draft quotation can be edited', {
        code: ErrorCodes.CONFLICT,
      });
    }
    this.assertVersion(quotation.version, dto.version);
    if (dto.assignedToMembershipId) {
      await this.requireActiveStaff(tenantId, dto.assignedToMembershipId);
    }
    const items = dto.items ? await this.hydrateTaxes(tenantId, dto.items) : null;
    const totals = items ? computeQuotationTotals(this.lineInputs(items)) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          title: dto.title !== undefined ? emptyToNull(dto.title) : quotation.title,
          notes: dto.notes !== undefined ? emptyToNull(dto.notes) : quotation.notes,
          terms: dto.terms !== undefined ? emptyToNull(dto.terms) : quotation.terms,
          validUntilOn:
            dto.validUntilOn !== undefined
              ? dto.validUntilOn
                ? new Date(dto.validUntilOn)
                : null
              : quotation.validUntilOn,
          ...(dto.expectedCloseOn !== undefined
            ? { expectedCloseOn: dto.expectedCloseOn ? dateFromYmd(dto.expectedCloseOn) : null }
            : {}),
          assignedToMembershipId: dto.assignedToMembershipId ?? quotation.assignedToMembershipId,
          ...(totals
            ? {
                subtotalMinor: BigInt(totals.subtotalMinor),
                discountMinor: BigInt(totals.discountMinor),
                taxMinor: BigInt(totals.taxMinor),
                totalMinor: BigInt(totals.totalMinor),
              }
            : {}),
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      if (items && totals) {
        await tx.quotationItem.updateMany({
          where: { quotationId: quotation.id, deletedAt: null },
          data: { deletedAt: new Date(), deletedBy: actor.userId, updatedBy: actor.userId },
        });
        await this.writeItems(tx, {
          tenantId,
          quotationId: quotation.id,
          actorUserId: actor.userId,
          items,
          lines: totals.lines,
        });
      }
      const assigneeChanged =
        Boolean(dto.assignedToMembershipId) &&
        dto.assignedToMembershipId !== quotation.assignedToMembershipId;
      await this.audit.record(
        {
          tenantId,
          actor,
          action: assigneeChanged ? TRACK_ACTION.assign : TRACK_ACTION.update,
          resourceType: TRACK_RESOURCE.quotation,
          resourceId: quotation.id,
          after: assigneeChanged
            ? trackPayload('Quotation reassigned', {
                number: quotation.quotationNumber,
                from: quotation.assignedToMembershipId,
                to: dto.assignedToMembershipId,
              })
            : trackPayload(`Quotation ${quotation.quotationNumber} updated`, {
                number: quotation.quotationNumber,
              }),
        },
        tx,
      );
    });
    return this.get(actor, quotation.id);
  }

  async send(actor: AuthUser, quotationId: string, dto: SendQuotationBody) {
    const tenantId = this.requireTenant(actor);
    const quotation = await this.requireQuotation(tenantId, quotationId);
    if (!canSendQuotationStatus(quotation.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Only a draft quotation can be sent', {
        code: ErrorCodes.CONFLICT,
      });
    }
    this.assertVersion(quotation.version, dto.version);
    const now = new Date();
    const timeZone = await this.tenantZone(tenantId);
    const schedule = defaultReminderSchedule({
      now,
      timeZone,
      validUntilOn: quotation.validUntilOn,
      expectedCloseOn: dto.expectedCloseOn ?? quotation.expectedCloseOn,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          status: QuotationStatus.sent,
          sentAt: now,
          notes: dto.notes !== undefined ? emptyToNull(dto.notes) : quotation.notes,
          nextFollowUpAt: dto.nextFollowUpAt
            ? new Date(dto.nextFollowUpAt)
            : (quotation.nextFollowUpAt ?? schedule.nextFollowUpAt),
          remindAt: quotation.remindAt ?? schedule.remindAt,
          expectedCloseOn: quotation.expectedCloseOn ?? dateFromYmd(schedule.expectedCloseOn),
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await this.timeline.record(
        {
          tenantId,
          leadId: quotation.leadId,
          actor,
          eventCode: TIMELINE_EVENT.quotationSent,
          subject: 'Quotation Sent',
          body: `${quotation.quotationNumber} · ${quotation.currency} ${(Number(quotation.totalMinor) / 100).toFixed(0)}`,
          metadata: { quotationId: quotation.id, quotationNumber: quotation.quotationNumber },
        },
        tx,
      );
      await this.audit.record(
        {
          tenantId,
          actor,
          action: TRACK_ACTION.statusChange,
          resourceType: TRACK_RESOURCE.quotation,
          resourceId: quotation.id,
          after: trackPayload(`${quotation.quotationNumber} sent`, {
            number: quotation.quotationNumber,
            from: quotation.status,
            to: QuotationStatus.sent,
          }),
        },
        tx,
      );
    });
    await this.quotationFollowUps.notifyPendingQuotation(tenantId, quotation.id);
    return this.get(actor, quotation.id);
  }

  async changeStatus(actor: AuthUser, quotationId: string, dto: ChangeQuotationStatusRequest) {
    const tenantId = this.requireTenant(actor);
    const quotation = await this.requireQuotation(tenantId, quotationId);
    if (dto.status === 'sent' || dto.status === 'draft') {
      throw new AppException(HttpStatus.CONFLICT, 'Use send to move a draft quotation to Sent', {
        code: ErrorCodes.CONFLICT,
      });
    }
    if (!canTransitionQuotation(quotation.status, dto.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'That status change is not allowed', {
        code: ErrorCodes.CONFLICT,
        detail: `Cannot move from ${quotation.status} to ${dto.status}.`,
      });
    }
    if (dto.status === 'lost' && !emptyToNull(dto.reason) && !quotation.lostReason) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Lost reason is required', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }
    this.assertVersion(quotation.version, dto.version);
    const now = new Date();
    const stamp = timestampFieldForStatus(dto.status);
    await this.prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          status: dto.status as QuotationStatus,
          ...(stamp ? { [stamp]: now } : {}),
          ...(dto.status === 'approved' ? { acceptedAt: now } : {}),
          ...(dto.status === 'lost'
            ? { rejectedAt: now, lostReason: emptyToNull(dto.reason) ?? quotation.lostReason }
            : {}),
          ...(dto.status === 'won' || dto.status === 'lost'
            ? { nextFollowUpAt: null, remindAt: null }
            : {}),
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await this.timeline.record(
        {
          tenantId,
          leadId: quotation.leadId,
          actor,
          eventCode: 'system',
          subject: `Quotation ${QUOTATION_STATUS_LABELS[dto.status as QuotationStatusCode]}`,
          body: dto.reason?.trim() || quotation.quotationNumber,
          metadata: { quotationId: quotation.id, status: dto.status },
        },
        tx,
      );
      await this.audit.record(
        {
          tenantId,
          actor,
          action: TRACK_ACTION.statusChange,
          resourceType: TRACK_RESOURCE.quotation,
          resourceId: quotation.id,
          after: trackPayload(
            `Quotation ${quotation.quotationNumber} ${dto.status}`,
            {
              number: quotation.quotationNumber,
              from: quotation.status,
              to: dto.status,
            },
          ),
        },
        tx,
      );
    });
    if (dto.status === 'won') {
      await this.billing.syncWonQuotation(actor, quotation.id);
    }
    return this.get(actor, quotation.id);
  }

  async scheduleFollowUp(actor: AuthUser, quotationId: string, dto: ScheduleQuotationFollowUpRequest) {
    const tenantId = this.requireTenant(actor);
    const quotation = await this.requireQuotation(tenantId, quotationId);
    const logged = dto.logged === true;
    if (!dto.nextFollowUpAt && !dto.remindAt && !dto.expectedCloseOn && !logged && !dto.note) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Set a reminder, expected close date, or log a follow-up', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }
    if (isTerminalQuotation(quotation.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'A closed quotation cannot be followed up', {
        code: ErrorCodes.CONFLICT,
      });
    }
    if ((dto.nextFollowUpAt || logged) && isDraftQuotation(quotation.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Send the quotation before scheduling a reminder', {
        code: ErrorCodes.CONFLICT,
      });
    }
    this.assertVersion(quotation.version, dto.version);
    const now = new Date();
    const timeZone = await this.tenantZone(tenantId);
    const schedule = defaultReminderSchedule({
      now,
      timeZone,
      validUntilOn: quotation.validUntilOn,
      expectedCloseOn: dto.expectedCloseOn ?? quotation.expectedCloseOn,
    });
    const nextFollowUpAt = dto.nextFollowUpAt
      ? new Date(dto.nextFollowUpAt)
      : logged
        ? schedule.nextFollowUpAt
        : quotation.nextFollowUpAt;
    const remindAt = dto.remindAt
      ? new Date(dto.remindAt)
      : dto.nextFollowUpAt || logged
        ? schedule.remindAt
        : quotation.remindAt;
    await this.prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          ...(nextFollowUpAt ? { nextFollowUpAt } : {}),
          ...(remindAt ? { remindAt } : {}),
          ...(dto.expectedCloseOn
            ? { expectedCloseOn: dateFromYmd(dto.expectedCloseOn) }
            : !quotation.expectedCloseOn
              ? { expectedCloseOn: dateFromYmd(schedule.expectedCloseOn) }
              : {}),
          ...(logged ? { lastFollowedUpAt: now } : {}),
          ...(emptyToNull(dto.note) ? { followUpNote: emptyToNull(dto.note) } : {}),
          ...(logged && quotation.status === QuotationStatus.sent
            ? { status: QuotationStatus.follow_up, followUpAt: quotation.followUpAt ?? now }
            : {}),
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await this.timeline.record(
        {
          tenantId,
          leadId: quotation.leadId,
          actor,
          eventCode: 'system',
          subject: logged ? 'Quotation follow-up logged' : 'Quotation reminder scheduled',
          body:
            emptyToNull(dto.note) ??
            `${quotation.quotationNumber} · close ${dto.expectedCloseOn ?? dateToYmd(quotation.expectedCloseOn) ?? schedule.expectedCloseOn}`,
          metadata: { quotationId: quotation.id, logged },
        },
        tx,
      );
      const movedToFollowUp = logged && quotation.status === QuotationStatus.sent;
      await this.audit.record(
        {
          tenantId,
          actor,
          action: movedToFollowUp ? TRACK_ACTION.statusChange : TRACK_ACTION.update,
          resourceType: TRACK_RESOURCE.quotation,
          resourceId: quotation.id,
          after: movedToFollowUp
            ? trackPayload(`${quotation.quotationNumber} follow-up`, {
                number: quotation.quotationNumber,
                from: quotation.status,
                to: QuotationStatus.follow_up,
              })
            : trackPayload(`Quotation ${quotation.quotationNumber} reminder updated`, {
                number: quotation.quotationNumber,
              }),
        },
        tx,
      );
    });
    return this.get(actor, quotation.id);
  }

  async remove(actor: AuthUser, quotationId: string) {
    const tenantId = this.requireTenant(actor);
    const quotation = await this.requireQuotation(tenantId, quotationId);
    if (!isDraftQuotation(quotation.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Only a draft quotation can be deleted', {
        code: ErrorCodes.CONFLICT,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          deletedAt: new Date(),
          deletedBy: actor.userId,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await this.audit.record(
        {
          tenantId,
          actor,
          action: TRACK_ACTION.delete,
          resourceType: TRACK_RESOURCE.quotation,
          resourceId: quotation.id,
          before: trackPayload(`Quotation ${quotation.quotationNumber} deleted`, {
            number: quotation.quotationNumber,
          }),
        },
        tx,
      );
    });
    return { id: quotation.id, deleted: true };
  }

  async report(actor: AuthUser, query: QuotationReportQuery) {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const where: Prisma.QuotationWhereInput = { tenantId, deletedAt: null };
    if (query.assignedToMembershipId) {
      where.assignedToMembershipId = query.assignedToMembershipId;
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      };
    }
    const rows = await this.prisma.quotation.findMany({
      where,
      include: { assignee: { include: { user: true } } },
      take: 5000,
    });
    return summarizeQuotations(
      rows.map((row) => {
        const expectedCloseOn = dateToYmd(row.expectedCloseOn);
        const bucket = reminderBucket({
          status: row.status,
          nextFollowUpAt: row.nextFollowUpAt,
          now,
          timeZone,
        });
        return {
          status: row.status,
          assignedToMembershipId: row.assignedToMembershipId,
          assigneeName: row.assignee?.user.fullName ?? null,
          totalMinor: Number(row.totalMinor),
          reminderOverdue: bucket === 'overdue',
          closingSoon: isClosingSoon({ status: row.status, expectedCloseOn, now, timeZone }),
          closingOverdue: isClosingOverdue({ status: row.status, expectedCloseOn, now, timeZone }),
          noFollowUp: bucket === 'no_follow_up',
          predictionBps: isPendingQuotation(row.status)
            ? predictQuotationClose(
                {
                  status: row.status,
                  nextFollowUpAt: row.nextFollowUpAt,
                  remindAt: row.remindAt,
                  expectedCloseOn: row.expectedCloseOn,
                  validUntilOn: row.validUntilOn,
                  lastFollowedUpAt: row.lastFollowedUpAt,
                  sentAt: row.sentAt,
                  createdAt: row.createdAt,
                },
                now,
                timeZone,
              ).probabilityBps
            : null,
        };
      }),
    );
  }

  async salesReport(actor: AuthUser, query: SalesReportQuery) {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const where: Prisma.QuotationWhereInput = {
      tenantId,
      deletedAt: null,
      status: { in: [QuotationStatus.won, QuotationStatus.lost] },
    };
    if (query.assignedToMembershipId) {
      where.assignedToMembershipId = query.assignedToMembershipId;
    }
    if (query.from || query.to) {
      const range = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      };
      where.OR = [{ wonAt: range }, { lostAt: range }];
    }
    const rows = await this.prisma.quotation.findMany({
      where,
      include: { assignee: { include: { user: { select: { fullName: true } } } } },
      take: 5000,
    });
    return summarizeSales(
      rows.map((row) => {
        const closedAt = row.status === 'won' ? row.wonAt : row.lostAt;
        return {
          status: row.status,
          assignedToMembershipId: row.assignedToMembershipId,
          assigneeName: row.assignee?.user.fullName ?? null,
          totalMinor: Number(row.totalMinor),
          month: closedAt && row.status === 'won' ? formatYmd(closedAt, timeZone).slice(0, 7) : null,
        };
      }),
    );
  }

  private async hydrateTaxes(tenantId: string, items: QuotationItemInput[]): Promise<QuotationItemInput[]> {
    const requested = [...new Set(items.flatMap((item) => item.taxRateIds ?? []))];
    const rows = requested.length
      ? await this.prisma.taxRate.findMany({
          where: { tenantId, id: { in: requested }, deletedAt: null, isActive: true },
        })
      : [];
    const byId = new Map(rows.map((row) => [row.id, row.rateBps]));
    if (requested.some((id) => !byId.has(id))) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Unknown or inactive tax', {
        code: ErrorCodes.VALIDATION_ERROR,
        errors: [
          {
            field: 'taxRateIds',
            code: 'invalid',
            message: 'Choose taxes from General settings.',
          },
        ],
      });
    }
    return items.map((item) => {
      const selected = item.taxRateIds ?? [];
      const taxBps = selected.length
        ? Math.min(
            10000,
            selected.reduce((sum, id) => sum + (byId.get(id) ?? 0), 0),
          )
        : (item.taxBps ?? 0);
      return { ...item, taxBps, taxRateIds: selected };
    });
  }

  private lineInputs(items: QuotationItemInput[]) {
    return items.map((item) => ({
      quantity: wholeQuantity(item.quantity),
      unitPriceMinor: item.unitPriceMinor,
      discountMinor: item.discountMinor ?? 0,
      taxBps: item.taxBps ?? 0,
    }));
  }

  private async writeItems(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      quotationId: string;
      actorUserId: string;
      items: QuotationItemInput[];
      lines: ReturnType<typeof computeQuotationTotals>['lines'];
    },
  ) {
    for (let index = 0; index < params.items.length; index += 1) {
      const item = params.items[index];
      const line = params.lines[index];
      if (!item || !line) {
        continue;
      }
      await tx.quotationItem.create({
        data: {
          tenantId: params.tenantId,
          quotationId: params.quotationId,
          description: item.description.trim(),
          quantity: wholeQuantity(item.quantity),
          unitPriceMinor: BigInt(item.unitPriceMinor),
          discountMinor: BigInt(item.discountMinor ?? 0),
          taxBps: item.taxBps ?? 0,
          taxRateIds: item.taxRateIds ?? [],
          lineTotalMinor: BigInt(line.lineTotalMinor),
          sortOrder: index,
          createdBy: params.actorUserId,
          updatedBy: params.actorUserId,
          ...(item.productId ? { productId: item.productId } : {}),
        },
      });
    }
  }

  private async nextNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    const [row] = await tx.$queryRaw<Array<{ number: string }>>(
      Prisma.sql`SELECT app.next_document_number(${tenantId}::uuid, 'quotation') AS number`,
    );
    if (!row?.number) {
      throw new AppException(HttpStatus.INTERNAL_SERVER_ERROR, 'Could not allocate quotation number', {
        code: ErrorCodes.INTERNAL_ERROR,
      });
    }
    return row.number;
  }

  private async requireQuotation(tenantId: string, quotationId: string): Promise<QuotationRow> {
    const row = await this.prisma.quotation.findFirst({
      where: { id: quotationId, tenantId, deletedAt: null },
      include: quotationInclude,
    });
    if (!row) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Quotation not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return row;
  }

  private async requireLead(tenantId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
      select: { id: true, ownerMembershipId: true, title: true, leadNumber: true },
    });
    if (!lead) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Lead not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return lead;
  }

  private async requireActiveStaff(tenantId: string, membershipId: string) {
    const staff = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        tenantId,
        deletedAt: null,
        status: MembershipStatus.active,
      },
    });
    if (!staff) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Assigned staff is not active', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }
  }

  private assertVersion(current: number, incoming?: number) {
    if (incoming != null && incoming !== current) {
      throw new AppException(HttpStatus.CONFLICT, 'Quotation was updated by someone else', {
        code: ErrorCodes.STALE_VERSION,
      });
    }
  }

  private bucketWhere(
    bucket: (typeof PENDING_QUOTATION_STATUSES)[number] | string,
    now: Date,
    timeZone: string,
  ): Prisma.QuotationWhereInput {
    const pending: Prisma.QuotationWhereInput = {
      status: { in: [...PENDING_QUOTATION_STATUSES] },
    };
    const nextDay = startOfNextZonedDay(now, timeZone);
    const today = formatYmd(now, timeZone);
    if (bucket === 'pending') {
      return pending;
    }
    if (bucket === 'overdue') {
      return { ...pending, nextFollowUpAt: { lt: now } };
    }
    if (bucket === 'today') {
      return { ...pending, nextFollowUpAt: { gte: now, lt: nextDay } };
    }
    if (bucket === 'upcoming') {
      return { ...pending, nextFollowUpAt: { gte: nextDay } };
    }
    if (bucket === 'no_follow_up') {
      return { ...pending, nextFollowUpAt: null };
    }
    if (bucket === 'closing_soon') {
      return {
        ...pending,
        expectedCloseOn: { gte: dateFromYmd(today), lte: dateFromYmd(addDaysYmd(today, 7)) },
      };
    }
    if (bucket === 'closing_overdue') {
      return { ...pending, expectedCloseOn: { lt: dateFromYmd(today) } };
    }
    return pending;
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

function dateFromYmd(ymd: string): Date {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`);
}

function emptyToNull(value?: string | null): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
