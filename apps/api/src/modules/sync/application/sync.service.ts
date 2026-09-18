import { HttpStatus, Injectable } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccessPolicy } from '../../identity/domain/access.policy';
import { PERMISSION } from '../../identity/domain/system-roles';
import { toMinorNumber } from '../../crm-leads/domain/lead-validation';
import { toFollowUpView } from '../../tasks/application/follow-up.mapper';
import { NOTE_ACTIVITY_TYPES } from '../domain/sync-conflict';
import { SYNC_LIMITS } from '../interface/http/dto/sync.dto';

export type SyncLeadView = {
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
  pipelineId: string;
  stageId: string;
  stageName: string;
  version: number;
  updatedAt: string;
  createdAt: string;
  lastActivityAt: string | null;
};

export type SyncNoteView = {
  id: string;
  leadId: string;
  type: string;
  subject: string | null;
  body: string | null;
  occurredAt: string;
  actorName: string | null;
  version: number;
  updatedAt: string;
};

export type SyncDelta = {
  cursor: string | null;
  updatedSince: string | null;
  hasMore: boolean;
  leads: SyncLeadView[];
  notes: SyncNoteView[];
  followUps: Array<ReturnType<typeof toFollowUpView> & { updatedAt: string }>;
};

const NOTE_TYPES = [...NOTE_ACTIVITY_TYPES] as ActivityType[];

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async pull(actor: AuthUser, query: { updatedSince?: string; limit?: number }): Promise<SyncDelta> {
    const tenantId = this.requireTenant(actor);
    const limit = Math.min(query.limit ?? SYNC_LIMITS.defaultLimit, SYNC_LIMITS.maxLimit);
    const since = this.parseSince(query.updatedSince);
    const seed = since == null;

    const [leads, notes, followUps] = await Promise.all([
      this.can(actor, PERMISSION.leadRead)
        ? this.pullLeads(tenantId, since, limit, seed)
        : Promise.resolve([] as SyncLeadView[]),
      this.can(actor, PERMISSION.activityRead) || this.can(actor, PERMISSION.leadRead)
        ? this.pullNotes(tenantId, since, limit, seed)
        : Promise.resolve([] as SyncNoteView[]),
      this.can(actor, PERMISSION.followUpRead)
        ? this.pullFollowUps(tenantId, since, limit, seed)
        : Promise.resolve([] as SyncDelta['followUps']),
    ]);

    const timestamps = [
      ...leads.map((row) => row.updatedAt),
      ...notes.map((row) => row.updatedAt),
      ...followUps.map((row) => row.updatedAt),
    ];
    const cursor = timestamps.length === 0 ? (query.updatedSince ?? null) : timestamps.sort().at(-1)!;
    return {
      cursor,
      updatedSince: query.updatedSince ?? null,
      hasMore: leads.length === limit || notes.length === limit || followUps.length === limit,
      leads,
      notes,
      followUps,
    };
  }

  private async pullLeads(
    tenantId: string,
    since: Date | null,
    limit: number,
    seed: boolean,
  ): Promise<SyncLeadView[]> {
    const rows = await this.prisma.lead.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(since ? { updatedAt: { gt: since } } : {}),
      },
      include: {
        source: true,
        stage: true,
        owner: { include: { user: true } },
      },
      orderBy: seed
        ? [{ updatedAt: 'desc' }, { id: 'desc' }]
        : [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((row) => ({
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
      pipelineId: row.pipelineId,
      stageId: row.stageId,
      stageName: row.stage.name,
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
    }));
  }

  private async pullNotes(
    tenantId: string,
    since: Date | null,
    limit: number,
    seed: boolean,
  ): Promise<SyncNoteView[]> {
    const rows = await this.prisma.leadActivity.findMany({
      where: {
        tenantId,
        deletedAt: null,
        type: { in: NOTE_TYPES },
        ...(since ? { updatedAt: { gt: since } } : {}),
      },
      include: { actor: { include: { user: true } } },
      orderBy: seed
        ? [{ updatedAt: 'desc' }, { id: 'desc' }]
        : [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      leadId: row.leadId,
      type: row.type,
      subject: row.subject,
      body: row.body,
      occurredAt: row.occurredAt.toISOString(),
      actorName: row.actor?.user.fullName ?? null,
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private async pullFollowUps(
    tenantId: string,
    since: Date | null,
    limit: number,
    seed: boolean,
  ): Promise<SyncDelta['followUps']> {
    const rows = await this.prisma.followUp.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(since ? { updatedAt: { gt: since } } : {}),
      },
      include: {
        assignee: { include: { user: true } },
        lead: { select: { id: true, leadNumber: true, title: true, customerName: true } },
      },
      orderBy: seed
        ? [{ updatedAt: 'desc' }, { id: 'desc' }]
        : [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((row) => ({
      ...toFollowUpView(row),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private parseSince(value?: string): Date | null {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Invalid updatedSince', {
        code: ErrorCodes.BAD_REQUEST,
        detail: 'updatedSince must be an ISO-8601 timestamp.',
      });
    }
    return parsed;
  }

  private can(actor: AuthUser, permission: string): boolean {
    return AccessPolicy.has(actor.permissions ?? [], permission);
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
