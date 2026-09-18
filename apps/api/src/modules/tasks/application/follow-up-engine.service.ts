import { HttpStatus, Injectable } from '@nestjs/common';
import { FollowUpStatus, LeadLifecycleStatus, MembershipStatus, Prisma, TenantStatus } from '@prisma/client';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import { SYSTEM_ROLE } from '../../identity/domain/system-roles';
import { NotificationWriter } from '../../notifications/application/notification.writer';
import { toFollowUpView } from './follow-up.mapper';
import {
  classifyFollowUpBucket,
  DEFAULT_FOLLOW_UP_ENGINE_RULES,
  FOLLOW_UP_ENGINE_EVENT,
  FOLLOW_UP_ENGINE_RULES_CATALOG,
  FollowUpEngineBucket,
  hoursOverdue,
  reachedEscalationLevels,
  shouldNotifyUpcoming,
  titleForEngineEvent,
} from '../domain/follow-up-engine';
import { formatYmd, startOfNextZonedDay } from '../domain/zoned-day';

const pendingFollowUpInclude = {
  assignee: { include: { user: true } },
  lead: { select: { id: true, leadNumber: true, title: true, customerName: true } },
} satisfies Prisma.FollowUpInclude;

type PendingFollowUp = Prisma.FollowUpGetPayload<{ include: typeof pendingFollowUpInclude }>;

@Injectable()
export class FollowUpEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationWriter,
  ) {}

  async dashboard(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    const tenant = await this.requireTenantRow(tenantId);
    const now = new Date();
    const timeZone = tenant.timezone;
    const nextDay = startOfNextZonedDay(now, timeZone);
    const pending = {
      tenantId,
      deletedAt: null,
      status: FollowUpStatus.pending,
    } satisfies Prisma.FollowUpWhereInput;

    const managerCutoff = new Date(
      now.getTime() - DEFAULT_FOLLOW_UP_ENGINE_RULES.managerEscalationHours * 3_600_000,
    );
    const adminCutoff = new Date(
      now.getTime() - DEFAULT_FOLLOW_UP_ENGINE_RULES.adminEscalationHours * 3_600_000,
    );
    const [overdue, today, upcoming, gaps, overdueRows, todayRows, upcomingRows, gapRows, level1, level2] =
      await Promise.all([
        this.prisma.followUp.count({ where: { ...pending, dueAt: { lt: now } } }),
        this.prisma.followUp.count({
          where: { ...pending, dueAt: { gte: now, lt: nextDay } },
        }),
        this.prisma.followUp.count({ where: { ...pending, dueAt: { gte: nextDay } } }),
        this.prisma.lead.count({ where: this.gapWhere(tenantId) }),
        this.prisma.followUp.findMany({
          where: { ...pending, dueAt: { lt: now } },
          include: pendingFollowUpInclude,
          orderBy: { dueAt: 'asc' },
          take: 5,
        }),
        this.prisma.followUp.findMany({
          where: { ...pending, dueAt: { gte: now, lt: nextDay } },
          include: pendingFollowUpInclude,
          orderBy: { dueAt: 'asc' },
          take: 5,
        }),
        this.prisma.followUp.findMany({
          where: { ...pending, dueAt: { gte: nextDay } },
          include: pendingFollowUpInclude,
          orderBy: { dueAt: 'asc' },
          take: 5,
        }),
        this.prisma.lead.findMany({
          where: this.gapWhere(tenantId),
          include: { owner: { include: { user: true } } },
          orderBy: { updatedAt: 'desc' },
          take: 5,
        }),
        this.prisma.followUp.count({ where: { ...pending, dueAt: { lt: managerCutoff } } }),
        this.prisma.followUp.count({ where: { ...pending, dueAt: { lt: adminCutoff } } }),
      ]);

    return {
      generatedAt: now.toISOString(),
      timezone: timeZone,
      widgets: [
        {
          code: 'overdue',
          title: 'Overdue',
          count: overdue,
          items: overdueRows.map((row) => ({ ...toFollowUpView(row), engineBucket: 'overdue' })),
        },
        {
          code: 'today',
          title: 'Today',
          count: today,
          items: todayRows.map((row) => ({ ...toFollowUpView(row), engineBucket: 'today' })),
        },
        {
          code: 'upcoming',
          title: 'Upcoming',
          count: upcoming,
          items: upcomingRows.map((row) => ({ ...toFollowUpView(row), engineBucket: 'upcoming' })),
        },
        {
          code: 'no_follow_up',
          title: 'No Follow-up',
          count: gaps,
          items: gapRows.map((row) => ({
            leadId: row.id,
            leadNumber: row.leadNumber,
            leadTitle: row.title,
            ownerName: row.owner?.user.fullName ?? null,
          })),
        },
      ],
      escalation: {
        overduePastManagerSla: level1,
        overduePastAdminSla: level2,
        rules: FOLLOW_UP_ENGINE_RULES_CATALOG,
      },
    };
  }

  async gaps(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    const rows = await this.prisma.lead.findMany({
      where: this.gapWhere(tenantId),
      include: { owner: { include: { user: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => ({
      leadId: row.id,
      leadNumber: row.leadNumber,
      leadTitle: row.title,
      ownerName: row.owner?.user.fullName ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }));
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
    const tenant = await this.requireTenantRow(tenantId);
    const notified = await this.tickTenant(tenantId, tenant.timezone);
    return { tenants: 1, notified };
  }

  bucketWhere(
    bucket: FollowUpEngineBucket,
    tenantId: string,
    now: Date,
    timeZone: string,
  ): Prisma.FollowUpWhereInput | null {
    if (bucket === 'no_follow_up') {
      return null;
    }
    const pending = {
      tenantId,
      deletedAt: null,
      status: FollowUpStatus.pending,
    };
    const nextDay = startOfNextZonedDay(now, timeZone);
    if (bucket === 'overdue') {
      return { ...pending, dueAt: { lt: now } };
    }
    if (bucket === 'today') {
      return { ...pending, dueAt: { gte: now, lt: nextDay } };
    }
    return { ...pending, dueAt: { gte: nextDay } };
  }

  private async tickTenant(tenantId: string, timeZone: string): Promise<number> {
    const now = new Date();
    const windowDate = new Date(`${formatYmd(now, timeZone)}T00:00:00.000Z`);
    const followUps = await this.prisma.followUp.findMany({
      where: { tenantId, deletedAt: null, status: FollowUpStatus.pending },
      include: pendingFollowUpInclude,
      take: 2000,
    });
    let notified = 0;
    for (const followUp of followUps) {
      const bucket = classifyFollowUpBucket({
        status: followUp.status,
        dueAt: followUp.dueAt,
        now,
        timeZone,
      });
      if (!bucket) {
        continue;
      }
      if (bucket === 'today') {
        notified += await this.emit({
          tenantId,
          resourceType: 'follow_up',
          resourceId: followUp.id,
          eventType: FOLLOW_UP_ENGINE_EVENT.dueToday,
          bucket,
          escalationLevel: 0,
          windowDate,
          recipientUserId: followUp.assignee.userId,
          title: titleForEngineEvent(FOLLOW_UP_ENGINE_EVENT.dueToday, followUp.title),
          body: this.followUpBody(followUp, 'is due today'),
        });
      } else if (
        shouldNotifyUpcoming({
          bucket,
          dueAt: followUp.dueAt,
          remindAt: followUp.remindAt,
          now,
        })
      ) {
        notified += await this.emit({
          tenantId,
          resourceType: 'follow_up',
          resourceId: followUp.id,
          eventType: FOLLOW_UP_ENGINE_EVENT.upcoming,
          bucket,
          escalationLevel: 0,
          windowDate,
          recipientUserId: followUp.assignee.userId,
          title: titleForEngineEvent(FOLLOW_UP_ENGINE_EVENT.upcoming, followUp.title),
          body: this.followUpBody(followUp, 'is coming up'),
        });
      } else if (bucket === 'overdue') {
        const hours = hoursOverdue(followUp.dueAt, now);
        const levels = reachedEscalationLevels(hours);
        if (levels.includes(0)) {
          notified += await this.emit({
            tenantId,
            resourceType: 'follow_up',
            resourceId: followUp.id,
            eventType: FOLLOW_UP_ENGINE_EVENT.overdue,
            bucket,
            escalationLevel: 0,
            windowDate,
            recipientUserId: followUp.assignee.userId,
            title: titleForEngineEvent(FOLLOW_UP_ENGINE_EVENT.overdue, followUp.title),
            body: this.followUpBody(followUp, 'is overdue'),
          });
        }
        if (levels.includes(1)) {
          const managers = await this.escalationRecipients(tenantId, followUp, 1);
          for (const userId of managers) {
            notified += await this.emit({
              tenantId,
              resourceType: 'follow_up',
              resourceId: followUp.id,
              eventType: FOLLOW_UP_ENGINE_EVENT.escalated,
              bucket,
              escalationLevel: 1,
              windowDate,
              recipientUserId: userId,
              title: titleForEngineEvent(FOLLOW_UP_ENGINE_EVENT.escalated, followUp.title),
              body: this.followUpBody(followUp, 'is overdue and needs a manager'),
            });
          }
        }
        if (levels.includes(2)) {
          const admins = await this.escalationRecipients(tenantId, followUp, 2);
          for (const userId of admins) {
            notified += await this.emit({
              tenantId,
              resourceType: 'follow_up',
              resourceId: followUp.id,
              eventType: FOLLOW_UP_ENGINE_EVENT.escalated,
              bucket,
              escalationLevel: 2,
              windowDate,
              recipientUserId: userId,
              title: titleForEngineEvent(FOLLOW_UP_ENGINE_EVENT.escalated, followUp.title),
              body: this.followUpBody(followUp, 'is overdue and needs an admin'),
            });
          }
        }
      }
    }

    const gapLeads = await this.prisma.lead.findMany({
      where: this.gapWhere(tenantId),
      include: { owner: true },
      take: 200,
    });
    for (const lead of gapLeads) {
      const ownerUserId = lead.owner?.userId;
      if (!ownerUserId) {
        continue;
      }
      notified += await this.emit({
        tenantId,
        resourceType: 'lead',
        resourceId: lead.id,
        eventType: FOLLOW_UP_ENGINE_EVENT.noFollowUp,
        bucket: 'no_follow_up',
        escalationLevel: 0,
        windowDate,
        recipientUserId: ownerUserId,
        title: titleForEngineEvent(FOLLOW_UP_ENGINE_EVENT.noFollowUp, lead.title),
        body: `${lead.leadNumber} ${lead.title} has no pending follow-up.`,
      });
    }
    return notified;
  }

  private async emit(input: {
    tenantId: string;
    resourceType: 'follow_up' | 'lead';
    resourceId: string;
    eventType: string;
    bucket: FollowUpEngineBucket;
    escalationLevel: number;
    windowDate: Date;
    recipientUserId: string;
    title: string;
    body: string;
  }): Promise<number> {
    try {
      await this.prisma.followUpEngineEvent.create({
        data: {
          tenantId: input.tenantId,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
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
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      payload: {
        bucket: input.bucket,
        escalationLevel: input.escalationLevel,
      },
    });
    return 1;
  }

  private async escalationRecipients(
    tenantId: string,
    followUp: PendingFollowUp,
    level: 1 | 2,
  ): Promise<string[]> {
    const roleCodes =
      level === 1
        ? [SYSTEM_ROLE.businessManager]
        : [SYSTEM_ROLE.admin, SYSTEM_ROLE.founder];
    const teamId = followUp.assignee.teamId;
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
    return [...new Set(rows.map((row) => row.userId))].filter(
      (userId) => userId !== followUp.assignee.userId,
    );
  }

  private followUpBody(followUp: PendingFollowUp, clause: string): string {
    const lead = followUp.lead.leadNumber;
    return `${followUp.title} for ${lead} ${clause}.`;
  }

  private gapWhere(tenantId: string): Prisma.LeadWhereInput {
    return {
      tenantId,
      deletedAt: null,
      lifecycleStatus: LeadLifecycleStatus.open,
      followUps: { none: { status: FollowUpStatus.pending, deletedAt: null } },
    };
  }

  private async requireTenantRow(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true, timezone: true },
    });
    if (!tenant) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Tenant not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return tenant;
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

