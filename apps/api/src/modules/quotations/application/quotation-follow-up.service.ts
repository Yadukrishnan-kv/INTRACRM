import { HttpStatus, Injectable } from '@nestjs/common';
import { MembershipStatus, Prisma, TenantStatus } from '@prisma/client';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import { SYSTEM_ROLE } from '../../identity/domain/system-roles';
import { NotificationWriter } from '../../notifications/application/notification.writer';
import { formatYmd, startOfNextZonedDay } from '../../tasks/domain/zoned-day';
import { toQuotationView } from './quotation.mapper';
import {
  DEFAULT_QUOTATION_FOLLOW_UP_RULES,
  dateToYmd,
  hoursOverdue,
  isClosingOverdue,
  isClosingSoon,
  QUOTATION_FOLLOW_UP_EVENT,
  QUOTATION_FOLLOW_UP_RULES_CATALOG,
  reachedEscalationLevels,
  reminderBucket,
  shouldNotifyUpcomingReminder,
  titleForQuotationFollowUpEvent,
} from '../domain/quotation-follow-up';
import { PENDING_QUOTATION_STATUSES, isPendingQuotation } from '../domain/quotation-types';

const pendingQuotationInclude = {
  assignee: { include: { user: true } },
  lead: {
    select: {
      id: true,
      leadNumber: true,
      title: true,
      customerName: true,
      owner: { include: { user: true } },
    },
  },
  items: {
    where: { deletedAt: null },
    include: { product: { select: { name: true } } },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.QuotationInclude;

type PendingQuotation = Prisma.QuotationGetPayload<{ include: typeof pendingQuotationInclude }>;

@Injectable()
export class QuotationFollowUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationWriter,
  ) {}

  async dashboard(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const pending = this.pendingWhere(tenantId);
    const nextDay = startOfNextZonedDay(now, timeZone);
    const today = formatYmd(now, timeZone);
    const soonEnd = addDays(today, 7);
    const managerCutoff = new Date(
      now.getTime() - DEFAULT_QUOTATION_FOLLOW_UP_RULES.managerEscalationHours * 3_600_000,
    );

    const [
      pendingCount,
      overdue,
      todayCount,
      upcoming,
      closingSoon,
      closingOverdue,
      gaps,
      pendingValue,
      overdueRows,
      todayRows,
      soonRows,
      overdueCloseRows,
      gapRows,
      level1,
    ] = await Promise.all([
      this.prisma.quotation.count({ where: pending }),
      this.prisma.quotation.count({ where: { ...pending, nextFollowUpAt: { lt: now } } }),
      this.prisma.quotation.count({
        where: { ...pending, nextFollowUpAt: { gte: now, lt: nextDay } },
      }),
      this.prisma.quotation.count({ where: { ...pending, nextFollowUpAt: { gte: nextDay } } }),
      this.prisma.quotation.count({
        where: {
          ...pending,
          expectedCloseOn: { gte: dateFromYmd(today), lte: dateFromYmd(soonEnd) },
        },
      }),
      this.prisma.quotation.count({
        where: { ...pending, expectedCloseOn: { lt: dateFromYmd(today) } },
      }),
      this.prisma.quotation.count({ where: { ...pending, nextFollowUpAt: null } }),
      this.prisma.quotation.aggregate({ where: pending, _sum: { totalMinor: true } }),
      this.preview({ ...pending, nextFollowUpAt: { lt: now } }),
      this.preview({ ...pending, nextFollowUpAt: { gte: now, lt: nextDay } }),
      this.preview({
        ...pending,
        expectedCloseOn: { gte: dateFromYmd(today), lte: dateFromYmd(soonEnd) },
      }),
      this.preview({ ...pending, expectedCloseOn: { lt: dateFromYmd(today) } }),
      this.preview({ ...pending, nextFollowUpAt: null }),
      this.prisma.quotation.count({ where: { ...pending, nextFollowUpAt: { lt: managerCutoff } } }),
    ]);

    const ctx = { now, timeZone };
    return {
      generatedAt: now.toISOString(),
      timezone: timeZone,
      pendingValueMinor: Number(pendingValue._sum.totalMinor ?? 0),
      widgets: [
        {
          code: 'pending',
          title: 'Pending',
          count: pendingCount,
          items: [],
        },
        {
          code: 'overdue',
          title: 'Overdue reminder',
          count: overdue,
          items: overdueRows.map((row) => toQuotationView(row, ctx)),
        },
        {
          code: 'today',
          title: 'Due today',
          count: todayCount,
          items: todayRows.map((row) => toQuotationView(row, ctx)),
        },
        {
          code: 'upcoming',
          title: 'Upcoming',
          count: upcoming,
          items: [],
        },
        {
          code: 'closing_soon',
          title: 'Closing soon',
          count: closingSoon,
          items: soonRows.map((row) => toQuotationView(row, ctx)),
        },
        {
          code: 'closing_overdue',
          title: 'Closing overdue',
          count: closingOverdue,
          items: overdueCloseRows.map((row) => toQuotationView(row, ctx)),
        },
        {
          code: 'no_follow_up',
          title: 'No reminder',
          count: gaps,
          items: gapRows.map((row) => toQuotationView(row, ctx)),
        },
      ],
      escalation: {
        overduePastManagerSla: level1,
        rules: QUOTATION_FOLLOW_UP_RULES_CATALOG,
      },
    };
  }

  async tick(scope?: { tenantId?: string }) {
    const tenants = await this.prisma.tenant.findMany({
      where: {
        status: TenantStatus.active,
        deletedAt: null,
        ...(scope?.tenantId ? { id: scope.tenantId } : {}),
      },
      select: { id: true, timezone: true },
    });
    let notified = 0;
    for (const tenant of tenants) {
      notified += await this.tickTenant(tenant.id, tenant.timezone);
    }
    return { tenants: tenants.length, notified };
  }

  async tickForActor(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const notified = await this.tickTenant(tenantId, timeZone);
    return { tenants: 1, notified };
  }

  async notifyPendingQuotation(tenantId: string, quotationId: string) {
    const quotation = await this.prisma.quotation.findFirst({
      where: { id: quotationId, tenantId, deletedAt: null },
      include: pendingQuotationInclude,
    });
    if (!quotation || !isPendingQuotation(quotation.status)) {
      return 0;
    }
    const recipientUserId = quotation.assignee?.userId ?? quotation.lead.owner?.userId;
    if (!recipientUserId) {
      return 0;
    }
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const windowDate = new Date(`${formatYmd(now, timeZone)}T00:00:00.000Z`);
    return this.emitPending(tenantId, quotation, recipientUserId, windowDate);
  }

  private async tickTenant(tenantId: string, timeZone: string): Promise<number> {
    const now = new Date();
    const windowDate = new Date(`${formatYmd(now, timeZone)}T00:00:00.000Z`);
    const rows = await this.prisma.quotation.findMany({
      where: this.pendingWhere(tenantId),
      include: pendingQuotationInclude,
      take: 2000,
    });
    let notified = 0;
    for (const quotation of rows) {
      const recipientUserId = quotation.assignee?.userId ?? quotation.lead.owner?.userId;
      if (!recipientUserId) {
        continue;
      }
      notified += await this.emitPending(tenantId, quotation, recipientUserId, windowDate);
      const expectedCloseOn = dateToYmd(quotation.expectedCloseOn);
      const bucket = reminderBucket({
        status: quotation.status,
        nextFollowUpAt: quotation.nextFollowUpAt,
        now,
        timeZone,
      });
      if (bucket === 'today') {
        notified += await this.emit({
          tenantId,
          quotationId: quotation.id,
          eventType: QUOTATION_FOLLOW_UP_EVENT.due,
          bucket: 'today',
          escalationLevel: 0,
          windowDate,
          recipientUserId,
          title: titleForQuotationFollowUpEvent(QUOTATION_FOLLOW_UP_EVENT.due, quotation.quotationNumber),
          body: this.body(quotation, 'follow-up is due today'),
        });
      } else if (
        bucket === 'upcoming' &&
        quotation.nextFollowUpAt &&
        shouldNotifyUpcomingReminder({
          bucket,
          nextFollowUpAt: quotation.nextFollowUpAt,
          remindAt: quotation.remindAt,
          now,
        })
      ) {
        notified += await this.emit({
          tenantId,
          quotationId: quotation.id,
          eventType: QUOTATION_FOLLOW_UP_EVENT.upcoming,
          bucket: 'upcoming',
          escalationLevel: 0,
          windowDate,
          recipientUserId,
          title: titleForQuotationFollowUpEvent(
            QUOTATION_FOLLOW_UP_EVENT.upcoming,
            quotation.quotationNumber,
          ),
          body: this.body(quotation, 'follow-up is coming up'),
        });
      } else if (bucket === 'overdue' && quotation.nextFollowUpAt) {
        const levels = reachedEscalationLevels(hoursOverdue(quotation.nextFollowUpAt, now));
        if (levels.includes(0)) {
          notified += await this.emit({
            tenantId,
            quotationId: quotation.id,
            eventType: QUOTATION_FOLLOW_UP_EVENT.overdue,
            bucket: 'overdue',
            escalationLevel: 0,
            windowDate,
            recipientUserId,
            title: titleForQuotationFollowUpEvent(
              QUOTATION_FOLLOW_UP_EVENT.overdue,
              quotation.quotationNumber,
            ),
            body: this.body(quotation, 'reminder is overdue'),
          });
        }
        if (levels.includes(1)) {
          for (const userId of await this.escalationRecipients(tenantId, quotation, 1)) {
            notified += await this.emit({
              tenantId,
              quotationId: quotation.id,
              eventType: QUOTATION_FOLLOW_UP_EVENT.escalated,
              bucket: 'overdue',
              escalationLevel: 1,
              windowDate,
              recipientUserId: userId,
              title: titleForQuotationFollowUpEvent(
                QUOTATION_FOLLOW_UP_EVENT.escalated,
                quotation.quotationNumber,
              ),
              body: this.body(quotation, 'reminder is overdue and needs a manager'),
            });
          }
        }
        if (levels.includes(2)) {
          for (const userId of await this.escalationRecipients(tenantId, quotation, 2)) {
            notified += await this.emit({
              tenantId,
              quotationId: quotation.id,
              eventType: QUOTATION_FOLLOW_UP_EVENT.escalated,
              bucket: 'overdue',
              escalationLevel: 2,
              windowDate,
              recipientUserId: userId,
              title: titleForQuotationFollowUpEvent(
                QUOTATION_FOLLOW_UP_EVENT.escalated,
                quotation.quotationNumber,
              ),
              body: this.body(quotation, 'reminder is overdue and needs an admin'),
            });
          }
        }
      } else if (bucket === 'no_follow_up') {
        notified += await this.emit({
          tenantId,
          quotationId: quotation.id,
          eventType: QUOTATION_FOLLOW_UP_EVENT.noFollowUp,
          bucket: 'no_follow_up',
          escalationLevel: 0,
          windowDate,
          recipientUserId,
          title: titleForQuotationFollowUpEvent(
            QUOTATION_FOLLOW_UP_EVENT.noFollowUp,
            quotation.quotationNumber,
          ),
          body: this.body(quotation, 'has no follow-up reminder'),
        });
      }

      if (isClosingSoon({ status: quotation.status, expectedCloseOn, now, timeZone })) {
        notified += await this.emit({
          tenantId,
          quotationId: quotation.id,
          eventType: QUOTATION_FOLLOW_UP_EVENT.closingSoon,
          bucket: 'closing_soon',
          escalationLevel: 0,
          windowDate,
          recipientUserId,
          title: titleForQuotationFollowUpEvent(
            QUOTATION_FOLLOW_UP_EVENT.closingSoon,
            quotation.quotationNumber,
          ),
          body: this.body(quotation, `is expected to close by ${expectedCloseOn}`),
        });
      }
      if (isClosingOverdue({ status: quotation.status, expectedCloseOn, now, timeZone })) {
        notified += await this.emit({
          tenantId,
          quotationId: quotation.id,
          eventType: QUOTATION_FOLLOW_UP_EVENT.closingOverdue,
          bucket: 'closing_overdue',
          escalationLevel: 0,
          windowDate,
          recipientUserId,
          title: titleForQuotationFollowUpEvent(
            QUOTATION_FOLLOW_UP_EVENT.closingOverdue,
            quotation.quotationNumber,
          ),
          body: this.body(quotation, 'expected close date has passed'),
        });
      }
    }
    return notified;
  }

  private emitPending(
    tenantId: string,
    quotation: PendingQuotation,
    recipientUserId: string,
    windowDate: Date,
  ) {
    return this.emit({
      tenantId,
      quotationId: quotation.id,
      eventType: QUOTATION_FOLLOW_UP_EVENT.pending,
      bucket: 'pending',
      escalationLevel: 0,
      windowDate,
      recipientUserId,
      title: titleForQuotationFollowUpEvent(
        QUOTATION_FOLLOW_UP_EVENT.pending,
        quotation.quotationNumber,
      ),
      body: this.body(quotation, 'is still pending a decision'),
    });
  }

  private async emit(input: {
    tenantId: string;
    quotationId: string;
    eventType: string;
    bucket: string;
    escalationLevel: number;
    windowDate: Date;
    recipientUserId: string;
    title: string;
    body: string;
  }): Promise<number> {
    try {
      await this.prisma.quotationFollowUpEvent.create({
        data: {
          tenantId: input.tenantId,
          quotationId: input.quotationId,
          eventType: input.eventType,
          bucket: input.bucket,
          escalationLevel: input.escalationLevel,
          windowDate: input.windowDate,
          recipientUserId: input.recipientUserId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return 0;
      }
      throw error;
    }
    await this.notifications.notifyInApp({
      tenantId: input.tenantId,
      userId: input.recipientUserId,
      eventType: input.eventType,
      title: input.title,
      body: input.body,
      resourceType: 'quotation',
      resourceId: input.quotationId,
      payload: {
        bucket: input.bucket,
        escalationLevel: input.escalationLevel,
      },
    });
    return 1;
  }

  private async escalationRecipients(
    tenantId: string,
    quotation: PendingQuotation,
    level: 1 | 2,
  ): Promise<string[]> {
    const roleCodes =
      level === 1 ? [SYSTEM_ROLE.businessManager] : [SYSTEM_ROLE.admin, SYSTEM_ROLE.founder];
    const teamId = quotation.assignee?.teamId;
    let rows = await this.prisma.membership.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: MembershipStatus.active,
        ...(level === 1 && teamId ? { teamId } : {}),
        roles: { some: { role: { code: { in: roleCodes } } } },
      },
      select: { userId: true },
    });
    if (level === 1 && teamId && rows.length === 0) {
      rows = await this.prisma.membership.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: MembershipStatus.active,
          roles: { some: { role: { code: { in: roleCodes } } } },
        },
        select: { userId: true },
      });
    }
    const skip = quotation.assignee?.userId;
    return [...new Set(rows.map((row) => row.userId))].filter((userId) => userId !== skip);
  }

  private preview(where: Prisma.QuotationWhereInput) {
    return this.prisma.quotation.findMany({
      where,
      include: pendingQuotationInclude,
      orderBy: [{ nextFollowUpAt: 'asc' }, { expectedCloseOn: 'asc' }],
      take: 5,
    });
  }

  private pendingWhere(tenantId: string): Prisma.QuotationWhereInput {
    return {
      tenantId,
      deletedAt: null,
      status: { in: [...PENDING_QUOTATION_STATUSES] },
    };
  }

  private body(quotation: PendingQuotation, clause: string): string {
    return `${quotation.quotationNumber} ${clause}.`;
  }

  private async tenantZone(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { timezone: true },
    });
    if (!tenant) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Tenant not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return tenant.timezone;
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
  return new Date(`${ymd}T00:00:00.000Z`);
}

function addDays(ymd: string, days: number): string {
  const [yearRaw, monthRaw, dayRaw] = ymd.split('-').map(Number);
  if (yearRaw === undefined || monthRaw === undefined || dayRaw === undefined) {
    throw new Error(`Invalid date: ${ymd}`);
  }
  return new Date(Date.UTC(yearRaw, monthRaw - 1, dayRaw + days)).toISOString().slice(0, 10);
}
