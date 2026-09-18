import { HttpStatus, Injectable } from '@nestjs/common';
import { ActivityType, FollowUpStatus, Prisma } from '@prisma/client';
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
import {
  changedLeadFields,
  parseEstimatedValueMinor,
  parseLeadPhone,
  toMinorNumber,
} from '../domain/lead-validation';
import {
  AssignLeadRequest,
  CompleteFollowUpRequest,
  CreateActivityRequest,
  CreateFollowUpRequest,
  CreateLeadRequest,
  LeadListQuery,
  LeadReportQuery,
  UpdateLeadRequest,
} from '../interface/http/dto/lead.dto';
import { TIMELINE_EVENT } from '../../activities/domain/timeline-events';
import { AuditWriter, trackPayload } from '../../audit/application/audit.writer';
import { TracksService } from '../../audit/application/tracks.service';
import { TRACK_ACTION, TRACK_RESOURCE } from '../../audit/domain/track-events';
import { TrackListQuery } from '../../audit/interface/http/dto/track.dto';
import { NotificationWriter } from '../../notifications/application/notification.writer';
import { NOTIFICATION_EVENT, catalogEntry } from '../../notifications/domain/notification-events';
import { FollowUpView, toFollowUpView } from '../../tasks/application/follow-up.mapper';
import { FollowUpsService } from '../../tasks/application/follow-ups.service';
import { summarizeLeads } from '../domain/lead-report';
import { LeadCatalogService } from './lead-catalog.service';

export type { FollowUpView };

const leadInclude = {
  source: true,
  stage: true,
  owner: { include: { user: true } },
  followUps: {
    where: { deletedAt: null, status: FollowUpStatus.pending },
    orderBy: { dueAt: 'asc' },
    take: 1,
    include: { assignee: { include: { user: true } } },
  },
} satisfies Prisma.LeadInclude;

const detailInclude = {
  ...leadInclude,
  activities: {
    where: { deletedAt: null },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: 20,
    include: { actor: { include: { user: true } } },
  },
  followUps: {
    where: { deletedAt: null },
    orderBy: [{ dueAt: 'desc' }],
    include: { assignee: { include: { user: true } } },
  },
} satisfies Prisma.LeadInclude;

type LeadRow = Prisma.LeadGetPayload<{ include: typeof leadInclude }>;
type LeadDetailRow = Prisma.LeadGetPayload<{ include: typeof detailInclude }>;

export type StaffLookup = {
  id: string;
  fullName: string;
  designation: string | null;
};

export type LeadView = {
  id: string;
  leadNumber: string;
  title: string;
  customerName: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  city: string | null;
  requirement: string | null;
  sourceId: string | null;
  sourceName: string | null;
  quality: string | null;
  estimatedValueMinor: number | null;
  currency: string;
  ownerMembershipId: string | null;
  ownerName: string | null;
  lifecycleStatus: string;
  stageName: string;
  nextFollowUpAt: string | null;
  version: number;
  updatedAt: string;
};

export type ActivityView = {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  occurredAt: string;
  actorName: string | null;
};

export type LeadDetailView = LeadView & {
  pipelineId: string;
  stageId: string;
  createdAt: string;
  lastActivityAt: string | null;
  activities: ActivityView[];
  followUps: FollowUpView[];
};

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: LeadCatalogService,
    private readonly followUps: FollowUpsService,
    private readonly notifications: NotificationWriter,
    private readonly audit: AuditWriter,
    private readonly tracks: TracksService,
  ) {}

  async lookups(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    await this.catalog.ensureDefaults(tenantId, actor.userId);
    const [sources, pipelines, staff, qualities] = await Promise.all([
      this.prisma.leadSource.findMany({
        where: { tenantId, deletedAt: null, isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.pipeline.findMany({
        where: { tenantId, deletedAt: null, isActive: true },
        include: {
          stages: {
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.membership.findMany({
        where: { tenantId, deletedAt: null, status: 'active' },
        include: { user: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.leadQualityOption.findMany({
        where: { tenantId, deletedAt: null, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);
    return {
      qualities: qualities.map((row) => ({ code: row.code, name: row.name })),
      sources: sources.map((row) => ({ id: row.id, code: row.code, name: row.name })),
      pipelines: pipelines.map((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        isDefault: pipeline.isDefault,
        stages: pipeline.stages.map((stage) => ({
          id: stage.id,
          name: stage.name,
          sortOrder: stage.sortOrder,
        })),
      })),
      staff: staff.map((row): StaffLookup => ({
        id: row.id,
        fullName: row.user.fullName,
        designation: row.designation,
      })),
    };
  }

  async list(actor: AuthUser, query: LeadListQuery) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const where: Prisma.LeadWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.quality ? { quality: query.quality } : {}),
      ...(query.sourceId ? { sourceId: query.sourceId } : {}),
      ...(query.ownerMembershipId ? { ownerMembershipId: query.ownerMembershipId } : {}),
      ...(query.status ? { lifecycleStatus: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { customerName: { contains: query.q, mode: 'insensitive' } },
              { leadNumber: { contains: query.q, mode: 'insensitive' } },
              { primaryPhone: { contains: query.q } },
              { primaryEmail: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    if (query.cursor) {
      try {
        const cursor = decodeCursor(query.cursor);
        const createdAt = cursor.createdAt;
        const id = cursor.id;
        if (!createdAt || !id) {
          throw new Error('Invalid cursor');
        }
        where.AND = [
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
          detail: 'The pagination cursor is not valid.',
        });
      }
    }

    const rows = await this.prisma.lead.findMany({
      where,
      include: leadInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      data: pageRows.map((row) => this.toListView(row)),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor: hasMore && last
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
      }),
    };
  }

  async get(actor: AuthUser, leadId: string): Promise<LeadDetailView> {
    return this.toDetailView(await this.requireLead(this.requireTenant(actor), leadId));
  }

  async create(actor: AuthUser, dto: CreateLeadRequest): Promise<LeadDetailView> {
    const tenantId = this.requireTenant(actor);
    const phone = this.requirePhone(dto.primaryPhone);
    const ownerId = dto.ownerMembershipId ?? actor.membershipId;
    if (!ownerId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Assigned staff is required', {
        code: ErrorCodes.VALIDATION_ERROR,
        detail: 'A lead must be assigned to a staff membership.',
        errors: [{ field: 'ownerMembershipId', code: 'required', message: 'Assigned staff is required' }],
      });
    }
    await this.requireActiveStaff(tenantId, ownerId);
    if (dto.sourceId) {
      await this.requireSource(tenantId, dto.sourceId);
    }
    const quality = dto.quality ? await this.requireQuality(tenantId, dto.quality) : null;

    const createdId = await this.prisma.$transaction(async (tx) => {
      const { pipeline, firstStage } = await this.catalog.ensureDefaults(
        tenantId,
        actor.userId,
        tx,
      );
      const [numberRow] = await tx.$queryRaw<Array<{ number: string }>>(
        Prisma.sql`SELECT app.next_document_number(${tenantId}::uuid, 'lead') AS number`,
      );
      if (!numberRow?.number) {
        throw new AppException(HttpStatus.INTERNAL_SERVER_ERROR, 'Could not allocate lead number', {
          code: ErrorCodes.INTERNAL_ERROR,
        });
      }
      const lead = await tx.lead.create({
        data: {
          tenantId,
          leadNumber: numberRow.number,
          title: dto.title.trim(),
          customerName: emptyToNull(dto.customerName),
          requirement: emptyToNull(dto.requirement),
          primaryPhone: phone,
          primaryEmail: emptyToNull(dto.primaryEmail)?.toLowerCase() ?? null,
          city: emptyToNull(dto.city),
          sourceId: dto.sourceId ?? null,
          pipelineId: pipeline.id,
          stageId: firstStage.id,
          ownerMembershipId: ownerId,
          quality,
          estimatedValueMinor:
            dto.estimatedValueMinor == null
              ? null
              : BigInt(parseEstimatedValueMinor(dto.estimatedValueMinor) ?? 0),
          currency: (dto.currency ?? 'INR').toUpperCase(),
          firstAssignedAt: new Date(),
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      await tx.leadAssignment.create({
        data: {
          tenantId,
          leadId: lead.id,
          assignedToMembershipId: ownerId,
          assignedByMembershipId: actor.membershipId ?? ownerId,
          isCurrent: true,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      if (dto.followUp) {
        await this.followUps.createInTx(tx, {
          tenantId,
          leadId: lead.id,
          actor,
          dto: dto.followUp,
          defaultAssignee: ownerId,
          recordTimeline: false,
        });
      }
      await tx.leadStageChange.create({
        data: {
          tenantId,
          leadId: lead.id,
          fromStageId: null,
          toStageId: firstStage.id,
          fromLifecycleStatus: null,
          toLifecycleStatus: 'open',
          changedByMembershipId: actor.membershipId ?? null,
          reason: 'Lead created',
          createdBy: actor.userId,
        },
      });
      await this.insertActivity(tx, {
        tenantId,
        leadId: lead.id,
        actor,
        type: ActivityType.system,
        eventCode: TIMELINE_EVENT.leadCreated,
        subject: 'Lead Created',
        body: `Lead ${numberRow.number} created.`,
      });
      if (dto.followUp) {
        await this.insertActivity(tx, {
          tenantId,
          leadId: lead.id,
          actor,
          type: ActivityType.system,
          eventCode: TIMELINE_EVENT.followUpAdded,
          subject: 'Follow-up Added',
          body: `Follow-up due ${new Date(dto.followUp.dueAt).toISOString()}.`,
        });
      }
      await this.audit.record(
        {
          tenantId,
          actor,
          action: TRACK_ACTION.create,
          resourceType: TRACK_RESOURCE.lead,
          resourceId: lead.id,
          after: trackPayload(`Lead ${numberRow.number} created`, {
            number: numberRow.number,
          }),
        },
        tx,
      );
      return lead.id;
    });
    const created = await this.get(actor, createdId);
    if (created.ownerMembershipId) {
      await this.notifyLeadAssigned({
        tenantId,
        leadId: created.id,
        leadNumber: created.leadNumber,
        title: created.title,
        ownerMembershipId: created.ownerMembershipId,
        actorUserId: actor.userId,
      });
    }
    return created;
  }

  async update(actor: AuthUser, leadId: string, dto: UpdateLeadRequest): Promise<LeadDetailView> {
    const tenantId = this.requireTenant(actor);
    const current = await this.requireLead(tenantId, leadId);
    if (dto.version != null && dto.version !== current.version) {
      throw new AppException(HttpStatus.CONFLICT, 'Lead was updated by someone else', {
        code: ErrorCodes.STALE_VERSION,
        detail: `Current version is ${current.version}.`,
      });
    }
    const phone =
      dto.primaryPhone === undefined ? current.primaryPhone : this.requirePhone(dto.primaryPhone);
    if (dto.sourceId) {
      await this.requireSource(tenantId, dto.sourceId);
    }
    if (dto.quality) {
      await this.requireQuality(tenantId, dto.quality);
    }
    if (dto.ownerMembershipId && dto.ownerMembershipId !== current.ownerMembershipId) {
      await this.requireActiveStaff(tenantId, dto.ownerMembershipId);
    }

    const next = {
      title: dto.title?.trim() ?? current.title,
      customerName:
        dto.customerName === undefined ? current.customerName : emptyToNull(dto.customerName),
      requirement:
        dto.requirement === undefined ? current.requirement : emptyToNull(dto.requirement),
      primaryPhone: phone,
      primaryEmail:
        dto.primaryEmail === undefined
          ? current.primaryEmail
          : emptyToNull(dto.primaryEmail)?.toLowerCase() ?? null,
      city: dto.city === undefined ? current.city : emptyToNull(dto.city),
      sourceId: dto.sourceId === undefined ? current.sourceId : dto.sourceId,
      quality: dto.quality === undefined ? current.quality : dto.quality,
      estimatedValueMinor:
        dto.estimatedValueMinor === undefined
          ? toMinorNumber(current.estimatedValueMinor)
          : parseEstimatedValueMinor(dto.estimatedValueMinor),
    };
    const changed = changedLeadFields(
      {
        title: current.title,
        customerName: current.customerName,
        requirement: current.requirement,
        primaryPhone: current.primaryPhone,
        primaryEmail: current.primaryEmail,
        city: current.city,
        sourceId: current.sourceId,
        quality: current.quality,
        estimatedValueMinor: toMinorNumber(current.estimatedValueMinor),
      },
      next,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: current.id },
        data: {
          title: next.title,
          customerName: next.customerName,
          requirement: next.requirement,
          primaryPhone: next.primaryPhone,
          primaryEmail: next.primaryEmail,
          city: next.city,
          sourceId: next.sourceId,
          quality: next.quality ?? null,
          estimatedValueMinor:
            next.estimatedValueMinor == null ? null : BigInt(next.estimatedValueMinor),
          ...(dto.ownerMembershipId && dto.ownerMembershipId !== current.ownerMembershipId
            ? { ownerMembershipId: dto.ownerMembershipId }
            : {}),
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      if (dto.ownerMembershipId && dto.ownerMembershipId !== current.ownerMembershipId) {
        await this.reassign(tx, {
          tenantId,
          leadId: current.id,
          from: current.ownerMembershipId,
          to: dto.ownerMembershipId,
          actor,
          reason: 'Updated from lead form',
        });
      }
      if (changed.length > 0) {
        await this.insertActivity(tx, {
          tenantId,
          leadId: current.id,
          actor,
          type: ActivityType.system,
          eventCode: TIMELINE_EVENT.leadUpdated,
          subject: 'Lead Updated',
          body: `Updated: ${changed.join(', ')}.`,
        });
      }
      const ownerChanged =
        Boolean(dto.ownerMembershipId) && dto.ownerMembershipId !== current.ownerMembershipId;
      await this.audit.record(
        {
          tenantId,
          actor,
          action: ownerChanged ? TRACK_ACTION.assign : TRACK_ACTION.update,
          resourceType: TRACK_RESOURCE.lead,
          resourceId: current.id,
          after: ownerChanged
            ? trackPayload('Lead reassigned', {
                number: current.leadNumber,
                from: current.ownerMembershipId,
                to: dto.ownerMembershipId,
              })
            : trackPayload(
                changed.length > 0 ? `Updated: ${changed.join(', ')}` : 'Lead updated',
                { number: current.leadNumber, fields: changed },
              ),
        },
        tx,
      );
    });
    if (dto.ownerMembershipId && dto.ownerMembershipId !== current.ownerMembershipId) {
      const updated = await this.get(actor, leadId);
      await this.notifyLeadAssigned({
        tenantId,
        leadId: updated.id,
        leadNumber: updated.leadNumber,
        title: updated.title,
        ownerMembershipId: dto.ownerMembershipId,
        actorUserId: actor.userId,
      });
      return updated;
    }
    return this.get(actor, leadId);
  }

  async report(actor: AuthUser, query: LeadReportQuery) {
    const tenantId = this.requireTenant(actor);
    const where: Prisma.LeadWhereInput = { tenantId, deletedAt: null };
    if (query.ownerMembershipId) {
      where.ownerMembershipId = query.ownerMembershipId;
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      };
    }
    const rows = await this.prisma.lead.findMany({
      where,
      include: {
        source: { select: { id: true, name: true } },
        stage: { select: { name: true } },
        owner: { include: { user: { select: { fullName: true } } } },
      },
      take: 5000,
    });
    return summarizeLeads(
      rows.map((row) => ({
        lifecycleStatus: row.lifecycleStatus,
        quality: row.quality,
        sourceId: row.sourceId,
        sourceName: row.source?.name ?? null,
        ownerMembershipId: row.ownerMembershipId,
        ownerName: row.owner?.user.fullName ?? null,
        stageName: row.stage.name,
        city: row.city,
        estimatedValueMinor: toMinorNumber(row.estimatedValueMinor),
      })),
    );
  }

  async assign(actor: AuthUser, leadId: string, dto: AssignLeadRequest): Promise<LeadDetailView> {
    const tenantId = this.requireTenant(actor);
    const current = await this.requireLead(tenantId, leadId);
    await this.requireActiveStaff(tenantId, dto.ownerMembershipId);
    if (current.ownerMembershipId === dto.ownerMembershipId) {
      return this.toDetailView(current);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: current.id },
        data: {
          ownerMembershipId: dto.ownerMembershipId,
          firstAssignedAt: current.firstAssignedAt ?? new Date(),
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await this.reassign(tx, {
        tenantId,
        leadId: current.id,
        from: current.ownerMembershipId,
        to: dto.ownerMembershipId,
        actor,
        reason: dto.reason,
      });
      await this.audit.record(
        {
          tenantId,
          actor,
          action: TRACK_ACTION.assign,
          resourceType: TRACK_RESOURCE.lead,
          resourceId: current.id,
          after: trackPayload('Lead assigned', {
            number: current.leadNumber,
            from: current.ownerMembershipId,
            to: dto.ownerMembershipId,
          }),
        },
        tx,
      );
    });
    const assigned = await this.get(actor, leadId);
    await this.notifyLeadAssigned({
      tenantId,
      leadId: assigned.id,
      leadNumber: assigned.leadNumber,
      title: assigned.title,
      ownerMembershipId: dto.ownerMembershipId,
      actorUserId: actor.userId,
    });
    return assigned;
  }

  async remove(actor: AuthUser, leadId: string) {
    const tenantId = this.requireTenant(actor);
    const current = await this.requireLead(tenantId, leadId);
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: current.id },
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
          resourceType: TRACK_RESOURCE.lead,
          resourceId: current.id,
          before: trackPayload(`Lead ${current.leadNumber} deleted`, {
            number: current.leadNumber,
          }),
        },
        tx,
      );
    });
    return { id: current.id, deleted: true };
  }

  async listAssignments(actor: AuthUser, leadId: string) {
    const tenantId = this.requireTenant(actor);
    await this.requireLead(tenantId, leadId);
    const rows = await this.prisma.leadAssignment.findMany({
      where: { tenantId, leadId, deletedAt: null },
      include: {
        from: { include: { user: { select: { fullName: true } } } },
        to: { include: { user: { select: { fullName: true } } } },
        by: { include: { user: { select: { fullName: true } } } },
      },
      orderBy: { assignedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      fromMembershipId: row.assignedFromMembershipId,
      fromName: row.from?.user.fullName ?? null,
      toMembershipId: row.assignedToMembershipId,
      toName: row.to?.user.fullName ?? null,
      byMembershipId: row.assignedByMembershipId,
      byName: row.by?.user.fullName ?? null,
      reason: row.reason,
      isCurrent: row.isCurrent,
      assignedAt: row.assignedAt.toISOString(),
    }));
  }

  async listTracks(actor: AuthUser, leadId: string, query: TrackListQuery) {
    const tenantId = this.requireTenant(actor);
    await this.requireLead(tenantId, leadId);
    return this.tracks.list(actor, {
      ...query,
      resourceType: TRACK_RESOURCE.lead,
      resourceId: leadId,
    });
  }

  async listActivities(actor: AuthUser, leadId: string, query: { cursor?: string; limit?: number }) {
    const tenantId = this.requireTenant(actor);
    await this.requireLead(tenantId, leadId);
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const where: Prisma.LeadActivityWhereInput = {
      tenantId,
      leadId,
      deletedAt: null,
    };
    if (query.cursor) {
      try {
        const cursor = decodeCursor(query.cursor);
        const occurredAt = cursor.occurredAt;
        const id = cursor.id;
        if (!occurredAt || !id) {
          throw new Error('Invalid cursor');
        }
        where.AND = [
          {
            OR: [
              { occurredAt: { lt: new Date(occurredAt) } },
              { occurredAt: new Date(occurredAt), id: { lt: id } },
            ],
          },
        ];
      } catch {
        throw new AppException(HttpStatus.BAD_REQUEST, 'Invalid cursor', {
          code: ErrorCodes.BAD_REQUEST,
        });
      }
    }
    const rows = await this.prisma.leadActivity.findMany({
      where,
      include: { actor: { include: { user: true } } },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      data: pageRows.map((row) => this.toActivityView(row)),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor: hasMore && last
          ? encodeCursor({ occurredAt: last.occurredAt.toISOString(), id: last.id })
          : null,
      }),
    };
  }

  async addActivity(
    actor: AuthUser,
    leadId: string,
    dto: CreateActivityRequest,
  ): Promise<ActivityView> {
    const tenantId = this.requireTenant(actor);
    await this.requireLead(tenantId, leadId);
    const created = await this.prisma.$transaction(async (tx) => {
      const activity = await this.insertActivity(tx, {
        tenantId,
        leadId,
        actor,
        type: dto.type,
        eventCode: dto.type,
        subject: dto.subject?.trim() || dto.type,
        body: emptyToNull(dto.body),
      });
      return activity;
    });
    return this.toActivityView({
      ...created,
      actor: actor.membershipId
        ? await this.prisma.membership.findUnique({
            where: { id: actor.membershipId },
            include: { user: true },
          })
        : null,
    });
  }

  async listFollowUps(actor: AuthUser, leadId: string): Promise<FollowUpView[]> {
    return this.followUps.listForLead(actor, leadId);
  }

  async addFollowUp(
    actor: AuthUser,
    leadId: string,
    dto: CreateFollowUpRequest,
  ): Promise<FollowUpView> {
    return this.followUps.create(actor, {
      leadId,
      type: dto.type ?? 'call',
      dueAt: dto.dueAt,
      ...(dto.title === undefined ? {} : { title: dto.title }),
      ...(dto.notes === undefined ? {} : { notes: dto.notes }),
      ...(dto.priority === undefined ? {} : { priority: dto.priority }),
      ...(dto.assignedToMembershipId === undefined
        ? {}
        : { assignedToMembershipId: dto.assignedToMembershipId }),
    });
  }

  async completeFollowUp(
    actor: AuthUser,
    leadId: string,
    followUpId: string,
    dto: CompleteFollowUpRequest,
  ): Promise<FollowUpView> {
    return this.followUps.complete(actor, followUpId, dto, { leadId });
  }

  private async insertActivity(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      leadId: string;
      actor: AuthUser;
      type: ActivityType | CreateActivityRequest['type'];
      eventCode: string;
      subject: string;
      body: string | null;
    },
  ) {
    const now = new Date();
    const activity = await tx.leadActivity.create({
      data: {
        tenantId: params.tenantId,
        leadId: params.leadId,
        type: params.type,
        eventCode: params.eventCode,
        subject: params.subject,
        body: params.body,
        performedByMembershipId: params.actor.membershipId ?? null,
        createdBy: params.actor.userId,
        updatedBy: params.actor.userId,
      },
    });
    await tx.lead.update({
      where: { id: params.leadId },
      data: { lastActivityAt: now },
    });
    return activity;
  }

  private async reassign(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      leadId: string;
      from: string | null;
      to: string;
      actor: AuthUser;
      reason?: string | undefined;
    },
  ) {
    await tx.leadAssignment.updateMany({
      where: { leadId: params.leadId, isCurrent: true, deletedAt: null },
      data: { isCurrent: false, updatedBy: params.actor.userId, version: { increment: 1 } },
    });
    await tx.leadAssignment.create({
      data: {
        tenantId: params.tenantId,
        leadId: params.leadId,
        assignedFromMembershipId: params.from,
        assignedToMembershipId: params.to,
        assignedByMembershipId: params.actor.membershipId ?? params.to,
        reason: emptyToNull(params.reason),
        isCurrent: true,
        createdBy: params.actor.userId,
        updatedBy: params.actor.userId,
      },
    });
    const assignee = await tx.membership.findFirst({
      where: { id: params.to },
      include: { user: true },
    });
    await this.insertActivity(tx, {
      tenantId: params.tenantId,
      leadId: params.leadId,
      actor: params.actor,
      type: ActivityType.system,
      eventCode: 'system',
      subject: 'Lead assigned',
      body: `Assigned to ${assignee?.user.fullName ?? params.to}.`,
    });
  }

  private async requireLead(tenantId: string, leadId: string): Promise<LeadDetailRow> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
      include: detailInclude,
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
      where: { id: membershipId, tenantId, deletedAt: null, status: 'active' },
    });
    if (!staff) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Assigned staff is not active', {
        code: ErrorCodes.VALIDATION_ERROR,
        errors: [
          {
            field: 'ownerMembershipId',
            code: 'invalid',
            message: 'Staff must be an active member of this tenant.',
          },
        ],
      });
    }
    return staff;
  }

  private async notifyLeadAssigned(params: {
    tenantId: string;
    leadId: string;
    leadNumber: string;
    title: string;
    ownerMembershipId: string;
    actorUserId: string;
  }) {
    const owner = await this.prisma.membership.findFirst({
      where: {
        id: params.ownerMembershipId,
        tenantId: params.tenantId,
        deletedAt: null,
      },
      select: { userId: true },
    });
    if (!owner || owner.userId === params.actorUserId) {
      return;
    }
    const event = catalogEntry(NOTIFICATION_EVENT.leadAssigned);
    await this.notifications.notify({
      tenantId: params.tenantId,
      userId: owner.userId,
      eventType: NOTIFICATION_EVENT.leadAssigned,
      title: event?.defaultTitle ?? 'Lead Assigned',
      body: `${params.leadNumber} · ${params.title}`,
      resourceType: 'lead',
      resourceId: params.leadId,
    });
  }

  private async requireQuality(tenantId: string, code: string) {
    const quality = await this.prisma.leadQualityOption.findFirst({
      where: { tenantId, code, deletedAt: null, isActive: true },
    });
    if (!quality) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Lead quality is not valid', {
        code: ErrorCodes.VALIDATION_ERROR,
        errors: [{ field: 'quality', code: 'invalid', message: 'Choose an active lead quality.' }],
      });
    }
    return quality.code;
  }

  private async requireSource(tenantId: string, sourceId: string) {
    const source = await this.prisma.leadSource.findFirst({
      where: { id: sourceId, tenantId, deletedAt: null, isActive: true },
    });
    if (!source) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Lead source is not valid', {
        code: ErrorCodes.VALIDATION_ERROR,
        errors: [{ field: 'sourceId', code: 'invalid', message: 'Choose an active lead source.' }],
      });
    }
    return source;
  }

  private requirePhone(input?: string | null): string | null {
    const parsed = parseLeadPhone(input);
    if (!parsed.ok) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Phone number is not valid', {
        code: ErrorCodes.VALIDATION_ERROR,
        errors: [
          {
            field: 'primaryPhone',
            code: 'invalid',
            message: 'Use E.164 or a 10-digit Indian mobile number.',
          },
        ],
      });
    }
    return parsed.value;
  }

  private requireTenant(actor: AuthUser): string {
    if (!actor.tenantId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Tenant required', {
        code: ErrorCodes.TENANT_REQUIRED,
      });
    }
    return actor.tenantId;
  }

  private toListView(row: LeadRow | LeadDetailRow): LeadView {
    return {
      id: row.id,
      leadNumber: row.leadNumber,
      title: row.title,
      customerName: row.customerName,
      primaryPhone: row.primaryPhone,
      primaryEmail: row.primaryEmail,
      city: row.city,
      requirement: row.requirement,
      sourceId: row.sourceId,
      sourceName: row.source?.name ?? null,
      quality: row.quality,
      estimatedValueMinor: toMinorNumber(row.estimatedValueMinor),
      currency: row.currency,
      ownerMembershipId: row.ownerMembershipId,
      ownerName: row.owner?.user.fullName ?? null,
      lifecycleStatus: row.lifecycleStatus,
      stageName: row.stage.name,
      nextFollowUpAt: nextPendingFollowUp(row.followUps),
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetailView(row: LeadDetailRow): LeadDetailView {
    return {
      ...this.toListView(row),
      pipelineId: row.pipelineId,
      stageId: row.stageId,
      createdAt: row.createdAt.toISOString(),
      lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
      activities: row.activities.map((item) => this.toActivityView(item)),
      followUps: row.followUps.map((item) =>
        toFollowUpView({ ...item, leadId: row.id }, row),
      ),
    };
  }

  private toActivityView(row: {
    id: string;
    type: string;
    subject: string | null;
    body: string | null;
    occurredAt: Date;
    actor?: { user: { fullName: string } } | null;
  }): ActivityView {
    return {
      id: row.id,
      type: row.type,
      subject: row.subject,
      body: row.body,
      occurredAt: row.occurredAt.toISOString(),
      actorName: row.actor?.user.fullName ?? null,
    };
  }
}

function emptyToNull(value?: string | null): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function nextPendingFollowUp(
  followUps: Array<{ status: FollowUpStatus | string; dueAt: Date }>,
): string | null {
  const pending = followUps
    .filter((item) => item.status === FollowUpStatus.pending)
    .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime());
  return pending[0]?.dueAt.toISOString() ?? null;
}
