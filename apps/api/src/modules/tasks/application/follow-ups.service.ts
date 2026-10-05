import { HttpStatus, Injectable } from '@nestjs/common';
import { FollowUpStatus, FollowUpType, Prisma } from '@prisma/client';
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
import { TIMELINE_EVENT } from '../../activities/domain/timeline-events';
import { TimelineWriter } from '../../activities/application/timeline.writer';
import { AuditWriter, trackPayload } from '../../audit/application/audit.writer';
import { TRACK_ACTION, TRACK_RESOURCE } from '../../audit/domain/track-events';
import {
  CalendarMonth,
  buildCalendarMonth,
  gridRange,
  isMonthKey,
} from '../domain/follow-up-calendar';
import { summarizeFollowUps } from '../domain/follow-up-report';
import {
  defaultTitleForType,
  followUpCatalog,
  isPendingFollowUp,
} from '../domain/follow-up-types';
import { FollowUpView, toFollowUpView } from './follow-up.mapper';
import { FollowUpEngineService } from './follow-up-engine.service';
import { addDaysYmd } from '../../targets/domain/target-period';
import { formatYmd, zonedLocalToUtc } from '../domain/zoned-day';
import {
  CompleteFollowUpRequest,
  CreateFollowUpRequest,
  FollowUpCalendarQuery,
  FollowUpListQuery,
  FollowUpReportQuery,
  RescheduleFollowUpRequest,
  UpdateFollowUpRequest,
} from '../interface/http/dto/follow-up.dto';

const followUpInclude = {
  assignee: { include: { user: true } },
  lead: {
    select: {
      id: true,
      leadNumber: true,
      title: true,
      customerName: true,
      primaryPhone: true,
    },
  },
} satisfies Prisma.FollowUpInclude;

type FollowUpRow = Prisma.FollowUpGetPayload<{ include: typeof followUpInclude }>;

/** A six-week grid of one tenant's follow-ups; far past any real month. */
const CALENDAR_ENTRY_CAP = 5000;

export type NestedFollowUpInput = {
  type?: string;
  dueAt: string;
  remindAt?: string;
  title?: string;
  notes?: string;
  priority?: number;
  assignedToMembershipId?: string;
};

@Injectable()
export class FollowUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineWriter,
    private readonly engine: FollowUpEngineService,
    private readonly audit: AuditWriter,
  ) {}

  catalog() {
    return { types: followUpCatalog() };
  }

  async list(actor: AuthUser, query: FollowUpListQuery) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const where: Prisma.FollowUpWhereInput = {
      tenantId,
      deletedAt: null,
    };
    if (query.leadId) {
      where.leadId = query.leadId;
    }
    if (query.assignedToMembershipId) {
      where.assignedToMembershipId = query.assignedToMembershipId;
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.bucket) {
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: tenantId },
        select: { timezone: true },
      });
      const extra = this.engine.bucketWhere(
        query.bucket,
        tenantId,
        new Date(),
        tenant?.timezone ?? 'Asia/Kolkata',
      );
      if (extra) {
        Object.assign(where, extra);
      }
    } else if (query.overdue === true) {
      where.status = FollowUpStatus.pending;
      where.dueAt = { lt: new Date() };
    } else if (query.status) {
      where.status = query.status;
    }
    // Composed with AND rather than assigned, so a calendar day narrows a
    // bucket filter instead of replacing the window the bucket set.
    const dueWindow = await this.dueWindow(tenantId, query);
    if (dueWindow) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { dueAt: dueWindow },
      ];
    }
    if (query.cursor) {
      try {
        const cursor = decodeCursor(query.cursor);
        const dueAt = cursor.dueAt;
        const id = cursor.id;
        if (!dueAt || !id) {
          throw new Error('Invalid cursor');
        }
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          {
            OR: [
              { dueAt: { gt: new Date(dueAt) } },
              { dueAt: new Date(dueAt), id: { gt: id } },
            ],
          },
        ];
      } catch {
        throw new AppException(HttpStatus.BAD_REQUEST, 'Invalid cursor', {
          code: ErrorCodes.BAD_REQUEST,
          detail: 'The pagination cursor is not valid.',
        });
      }
    }
    const rows = await this.prisma.followUp.findMany({
      where,
      include: followUpInclude,
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      data: pageRows.map((row) => toFollowUpView(row)),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({ dueAt: last.dueAt.toISOString(), id: last.id })
            : null,
      }),
    };
  }

  async get(actor: AuthUser, followUpId: string): Promise<FollowUpView> {
    const row = await this.requireFollowUp(this.requireTenant(actor), followUpId);
    return toFollowUpView(row);
  }

  async listForLead(actor: AuthUser, leadId: string): Promise<FollowUpView[]> {
    const tenantId = this.requireTenant(actor);
    await this.requireLead(tenantId, leadId);
    const rows = await this.prisma.followUp.findMany({
      where: { tenantId, leadId, deletedAt: null },
      include: followUpInclude,
      orderBy: [{ dueAt: 'desc' }],
    });
    return rows.map((row) => toFollowUpView(row));
  }

  async create(actor: AuthUser, dto: CreateFollowUpRequest): Promise<FollowUpView> {
    const tenantId = this.requireTenant(actor);
    const lead = await this.requireLead(tenantId, dto.leadId);
    const created = await this.prisma.$transaction(async (tx) => {
      return this.createInTx(tx, {
        tenantId,
        leadId: lead.id,
        actor,
        dto,
        defaultAssignee: lead.ownerMembershipId ?? actor.membershipId ?? null,
        recordTimeline: true,
      });
    });
    return this.get(actor, created.id);
  }

  async createInTx(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      leadId: string;
      actor: AuthUser;
      dto: NestedFollowUpInput;
      defaultAssignee: string | null;
      recordTimeline: boolean;
    },
  ) {
    const assignee = params.dto.assignedToMembershipId ?? params.defaultAssignee;
    if (!assignee) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Follow-up assignee is required', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }
    await this.requireActiveStaff(params.tenantId, assignee, tx);
    const type = (params.dto.type as FollowUpType | undefined) ?? FollowUpType.call;
    const followUp = await tx.followUp.create({
      data: {
        tenantId: params.tenantId,
        leadId: params.leadId,
        assignedToMembershipId: assignee,
        type,
        title: defaultTitleForType(type, params.dto.title),
        notes: emptyToNull(params.dto.notes),
        dueAt: new Date(params.dto.dueAt),
        remindAt: params.dto.remindAt ? new Date(params.dto.remindAt) : null,
        priority: params.dto.priority ?? 2,
        createdBy: params.actor.userId,
        updatedBy: params.actor.userId,
      },
    });
    if (params.recordTimeline) {
      await this.timeline.record(
        {
          tenantId: params.tenantId,
          leadId: params.leadId,
          actor: params.actor,
          eventCode: TIMELINE_EVENT.followUpAdded,
          subject: 'Follow-up Added',
          body: `${defaultTitleForType(type)} due ${followUp.dueAt.toISOString()}.`,
        },
        tx,
      );
    }
    await this.audit.record(
      {
        tenantId: params.tenantId,
        actor: params.actor,
        action: TRACK_ACTION.create,
        resourceType: TRACK_RESOURCE.followUp,
        resourceId: followUp.id,
        after: trackPayload('Follow-up created', {
          from: null,
          to: followUp.status,
        }),
      },
      tx,
    );
    return followUp;
  }

  async update(
    actor: AuthUser,
    followUpId: string,
    dto: UpdateFollowUpRequest,
  ): Promise<FollowUpView> {
    const tenantId = this.requireTenant(actor);
    const followUp = await this.requireFollowUp(tenantId, followUpId);
    this.assertPending(followUp.status);
    this.assertVersion(followUp.version, dto.version);
    if (dto.assignedToMembershipId) {
      await this.requireActiveStaff(tenantId, dto.assignedToMembershipId);
    }
    const type = dto.type ?? followUp.type;
    const assigneeChanged =
      Boolean(dto.assignedToMembershipId) &&
      dto.assignedToMembershipId !== followUp.assignedToMembershipId;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.followUp.update({
        where: { id: followUp.id },
        data: {
          type,
          title: dto.title !== undefined ? defaultTitleForType(type, dto.title) : followUp.title,
          notes: dto.notes !== undefined ? emptyToNull(dto.notes) : followUp.notes,
          priority: dto.priority ?? followUp.priority,
          assignedToMembershipId: dto.assignedToMembershipId ?? followUp.assignedToMembershipId,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
        include: followUpInclude,
      });
      await this.audit.record(
        {
          tenantId,
          actor,
          action: assigneeChanged ? TRACK_ACTION.assign : TRACK_ACTION.update,
          resourceType: TRACK_RESOURCE.followUp,
          resourceId: followUp.id,
          after: assigneeChanged
            ? trackPayload('Follow-up reassigned', {
                from: followUp.assignedToMembershipId,
                to: dto.assignedToMembershipId,
              })
            : trackPayload('Follow-up updated'),
        },
        tx,
      );
      return row;
    });
    return toFollowUpView(updated);
  }

  async reschedule(
    actor: AuthUser,
    followUpId: string,
    dto: RescheduleFollowUpRequest,
  ): Promise<FollowUpView> {
    const tenantId = this.requireTenant(actor);
    const followUp = await this.requireFollowUp(tenantId, followUpId);
    this.assertPending(followUp.status);
    this.assertVersion(followUp.version, dto.version);
    const dueAt = new Date(dto.dueAt);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.followUp.update({
        where: { id: followUp.id },
        data: {
          dueAt,
          remindAt: dto.remindAt ? new Date(dto.remindAt) : followUp.remindAt,
          rescheduleCount: { increment: 1 },
          lastRescheduledAt: new Date(),
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
        include: followUpInclude,
      });
      await this.timeline.record(
        {
          tenantId,
          leadId: followUp.leadId,
          actor,
          eventCode: 'system',
          subject: 'Follow-up rescheduled',
          body:
            dto.reason?.trim() ||
            `Moved from ${followUp.dueAt.toISOString()} to ${dueAt.toISOString()}.`,
        },
        tx,
      );
      await this.audit.record(
        {
          tenantId,
          actor,
          action: TRACK_ACTION.update,
          resourceType: TRACK_RESOURCE.followUp,
          resourceId: followUp.id,
          after: trackPayload('Follow-up rescheduled', {
            from: followUp.dueAt.toISOString(),
            to: dueAt.toISOString(),
          }),
        },
        tx,
      );
      return row;
    });
    return toFollowUpView(updated);
  }

  async complete(
    actor: AuthUser,
    followUpId: string,
    dto: CompleteFollowUpRequest,
    options?: { leadId?: string },
  ): Promise<FollowUpView> {
    const tenantId = this.requireTenant(actor);
    const followUp = await this.requireFollowUp(tenantId, followUpId, options?.leadId);
    if (followUp.status === FollowUpStatus.completed) {
      return toFollowUpView(followUp);
    }
    this.assertPending(followUp.status);
    this.assertVersion(followUp.version, dto.version);
    const updated = await this.prisma.$transaction(async (tx) => {
      const activity = await this.timeline.record(
        {
          tenantId,
          leadId: followUp.leadId,
          actor,
          eventCode: 'system',
          subject: 'Follow-up completed',
          body: dto.notes?.trim() || followUp.title,
        },
        tx,
      );
      const row = await tx.followUp.update({
        where: { id: followUp.id },
        data: {
          status: FollowUpStatus.completed,
          completedAt: new Date(),
          completedActivityId: activity.id,
          notes: dto.notes?.trim() || followUp.notes,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
        include: followUpInclude,
      });
      await this.audit.record(
        {
          tenantId,
          actor,
          action: TRACK_ACTION.statusChange,
          resourceType: TRACK_RESOURCE.followUp,
          resourceId: followUp.id,
          after: trackPayload('Follow-up completed', {
            from: followUp.status,
            to: FollowUpStatus.completed,
          }),
        },
        tx,
      );
      return row;
    });
    return toFollowUpView(updated);
  }

  async report(actor: AuthUser, query: FollowUpReportQuery) {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const where: Prisma.FollowUpWhereInput = { tenantId, deletedAt: null };
    if (query.assignedToMembershipId) {
      where.assignedToMembershipId = query.assignedToMembershipId;
    }
    if (query.from || query.to) {
      where.dueAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      };
    }
    const rows = await this.prisma.followUp.findMany({
      where,
      include: { assignee: { include: { user: { select: { fullName: true } } } } },
      take: 5000,
    });
    return summarizeFollowUps(
      rows.map((row) => ({
        status: row.status,
        type: row.type,
        assignedToMembershipId: row.assignedToMembershipId,
        assigneeName: row.assignee.user.fullName,
        dueAt: row.dueAt,
        rescheduleCount: row.rescheduleCount,
      })),
      { now: new Date(), timeZone },
    );
  }

  /**
   * Per-day counts for one month of the follow-up calendar. The six-week grid
   * the client paints reaches into the neighbouring months, so the query
   * covers the grid rather than the month.
   */
  async calendar(actor: AuthUser, query: FollowUpCalendarQuery): Promise<CalendarMonth> {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.tenantZone(tenantId);
    const now = new Date();
    const month = query.month ?? formatYmd(now, timeZone).slice(0, 7);
    if (!isMonthKey(month)) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Invalid month', {
        code: ErrorCodes.BAD_REQUEST,
        detail: 'month must be YYYY-MM.',
      });
    }
    const grid = gridRange(month);
    const entries = await this.prisma.followUp.findMany({
      where: {
        tenantId,
        deletedAt: null,
        dueAt: {
          gte: zonedLocalToUtc(grid.start, 0, 0, 0, timeZone),
          lt: zonedLocalToUtc(addDaysYmd(grid.end, 1), 0, 0, 0, timeZone),
        },
        ...(query.assignedToMembershipId
          ? { assignedToMembershipId: query.assignedToMembershipId }
          : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      select: { dueAt: true, status: true },
      take: CALENDAR_ENTRY_CAP,
    });
    return buildCalendarMonth({ month, entries, timeZone, now });
  }

  /**
   * Turns the `dueOn` / `dueFrom` / `dueTo` query into a UTC instant range.
   * The bounds are tenant-local calendar days, and the upper bound is
   * exclusive of the day after, so a whole day is covered without relying on
   * end-of-day arithmetic.
   */
  private async dueWindow(
    tenantId: string,
    query: FollowUpListQuery,
  ): Promise<{ gte?: Date; lt?: Date } | null> {
    const from = query.dueOn ?? query.dueFrom;
    const to = query.dueOn ?? query.dueTo;
    if (!from && !to) {
      return null;
    }
    if (from && to && to < from) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Invalid date range', {
        code: ErrorCodes.BAD_REQUEST,
        detail: 'dueTo must be on or after dueFrom.',
      });
    }
    const timeZone = await this.tenantZone(tenantId);
    return {
      ...(from ? { gte: zonedLocalToUtc(from, 0, 0, 0, timeZone) } : {}),
      ...(to ? { lt: zonedLocalToUtc(addDaysYmd(to, 1), 0, 0, 0, timeZone) } : {}),
    };
  }

  private async requireFollowUp(
    tenantId: string,
    followUpId: string,
    leadId?: string,
  ): Promise<FollowUpRow> {
    const row = await this.prisma.followUp.findFirst({
      where: {
        id: followUpId,
        tenantId,
        deletedAt: null,
        ...(leadId === undefined ? {} : { leadId }),
      },
      include: followUpInclude,
    });
    if (!row) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Follow-up not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return row;
  }

  private async requireLead(tenantId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
      select: { id: true, ownerMembershipId: true, leadNumber: true, title: true },
    });
    if (!lead) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Lead not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return lead;
  }

  private async requireActiveStaff(
    tenantId: string,
    membershipId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const staff = await db.membership.findFirst({
      where: { id: membershipId, tenantId, deletedAt: null, status: 'active' },
    });
    if (!staff) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Assigned staff is not active', {
        code: ErrorCodes.VALIDATION_ERROR,
        errors: [
          {
            field: 'assignedToMembershipId',
            code: 'invalid',
            message: 'Staff must be an active member of this tenant.',
          },
        ],
      });
    }
    return staff;
  }

  private assertPending(status: string) {
    if (!isPendingFollowUp(status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Follow-up is no longer pending', {
        code: ErrorCodes.CONFLICT,
        detail: 'Only pending follow-ups can be edited, rescheduled, or completed.',
      });
    }
  }

  private assertVersion(current: number, incoming?: number) {
    if (incoming != null && incoming !== current) {
      throw new AppException(HttpStatus.CONFLICT, 'Follow-up was updated by someone else', {
        code: ErrorCodes.STALE_VERSION,
      });
    }
  }

  private requireTenant(actor: AuthUser): string {
    if (!actor.tenantId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Tenant required', {
        code: ErrorCodes.TENANT_REQUIRED,
      });
    }
    return actor.tenantId;
  }

  private async tenantZone(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { timezone: true },
    });
    return tenant?.timezone ?? 'Asia/Kolkata';
  }
}

function emptyToNull(value?: string | null): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
