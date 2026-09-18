import { HttpStatus, Injectable } from '@nestjs/common';
import { LeadLifecycleStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import { TimelineWriter } from '../../activities/application/timeline.writer';
import { TIMELINE_EVENT } from '../../activities/domain/timeline-events';
import { AuditWriter, trackPayload } from '../../audit/application/audit.writer';
import { TRACK_ACTION, TRACK_RESOURCE } from '../../audit/domain/track-events';
import { toMinorNumber } from '../../crm-leads/domain/lead-validation';
import { LeadCatalogService } from '../../crm-leads/application/lead-catalog.service';
import { summarizeConversion, type StageSnapshot } from '../domain/conversion-analytics';
import { lifecycleForStage } from '../domain/default-pipeline';
import { ChangeStageRequest, PipelineBoardQuery } from '../interface/http/dto/pipeline.dto';

const boardLeadInclude = {
  source: true,
  stage: true,
  owner: { include: { user: true } },
} satisfies Prisma.LeadInclude;

type BoardLeadRow = Prisma.LeadGetPayload<{ include: typeof boardLeadInclude }>;

export type PipelineCard = {
  id: string;
  leadNumber: string;
  title: string;
  customerName: string | null;
  primaryPhone: string | null;
  quality: string | null;
  estimatedValueMinor: number | null;
  currency: string;
  ownerMembershipId: string | null;
  ownerName: string | null;
  stageId: string;
  stageName: string;
  lifecycleStatus: string;
  version: number;
  updatedAt: string;
};

@Injectable()
export class PipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: LeadCatalogService,
    private readonly timeline: TimelineWriter,
    private readonly audit: AuditWriter,
  ) {}

  async board(actor: AuthUser, query: PipelineBoardQuery) {
    const tenantId = this.requireTenant(actor);
    const { pipeline } = await this.catalog.ensureDefaults(tenantId, actor.userId);
    const selected =
      query.pipelineId && query.pipelineId !== pipeline.id
        ? await this.requirePipeline(tenantId, query.pipelineId)
        : pipeline;
    const limit = query.limit ?? 50;
    const stages = await this.prisma.pipelineStage.findMany({
      where: { pipelineId: selected.id, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    const leads = await this.prisma.lead.findMany({
      where: { tenantId, pipelineId: selected.id, deletedAt: null },
      include: boardLeadInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    const lossReasons = await this.prisma.lossReason.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });

    const columns = stages.map((stage) => {
      const inStage = leads.filter((lead) => lead.stageId === stage.id);
      return {
        stage: this.toStageView(stage),
        count: inStage.length,
        valueMinor: inStage.reduce((sum, lead) => sum + (toMinorNumber(lead.estimatedValueMinor) ?? 0), 0),
        hasMore: inStage.length > limit,
        leads: inStage.slice(0, limit).map((lead) => this.toCard(lead)),
      };
    });

    const open = leads.filter((lead) => lead.lifecycleStatus === 'open').length;
    const won = leads.filter((lead) => lead.lifecycleStatus === 'won').length;
    const lost = leads.filter((lead) => lead.lifecycleStatus === 'lost').length;
    return {
      pipeline: { id: selected.id, name: selected.name, code: selected.code },
      columns,
      totals: {
        leads: leads.length,
        open,
        won,
        lost,
        pipelineValueMinor: leads.reduce(
          (sum, lead) => sum + (toMinorNumber(lead.estimatedValueMinor) ?? 0),
          0,
        ),
      },
      lossReasons: lossReasons.map((row) => ({ id: row.id, code: row.code, name: row.name })),
    };
  }

  async analytics(actor: AuthUser, pipelineId?: string) {
    const tenantId = this.requireTenant(actor);
    const { pipeline } = await this.catalog.ensureDefaults(tenantId, actor.userId);
    const selected =
      pipelineId && pipelineId !== pipeline.id
        ? await this.requirePipeline(tenantId, pipelineId)
        : pipeline;
    const stages = await this.prisma.pipelineStage.findMany({
      where: { pipelineId: selected.id, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    const leads = await this.prisma.lead.findMany({
      where: { tenantId, pipelineId: selected.id, deletedAt: null },
      select: {
        id: true,
        stageId: true,
        lifecycleStatus: true,
        estimatedValueMinor: true,
      },
    });
    const changes = await this.prisma.leadStageChange.findMany({
      where: { tenantId, lead: { pipelineId: selected.id, deletedAt: null } },
      select: { leadId: true, toStageId: true },
    });

    const reached = new Map<string, Set<string>>();
    for (const stage of stages) {
      reached.set(stage.id, new Set());
    }
    for (const change of changes) {
      reached.get(change.toStageId)?.add(change.leadId);
    }
    for (const lead of leads) {
      reached.get(lead.stageId)?.add(lead.id);
    }

    const snapshots: StageSnapshot[] = stages.map((stage) => {
      const inStage = leads.filter((lead) => lead.stageId === stage.id);
      return {
        id: stage.id,
        code: stage.code,
        name: stage.name,
        sortOrder: stage.sortOrder,
        winProbabilityBps: stage.winProbabilityBps,
        isWon: stage.isWon,
        isLost: stage.isLost,
        currentCount: inStage.length,
        currentValueMinor: inStage.reduce(
          (sum, lead) => sum + (toMinorNumber(lead.estimatedValueMinor) ?? 0),
          0,
        ),
        reachedCount: reached.get(stage.id)?.size ?? 0,
      };
    });

    const openLeads = leads.filter((lead) => lead.lifecycleStatus === 'open');
    const wonLeads = leads.filter((lead) => lead.lifecycleStatus === 'won');
    const lostLeads = leads.filter((lead) => lead.lifecycleStatus === 'lost');
    const summary = summarizeConversion(snapshots, {
      open: openLeads.length,
      won: wonLeads.length,
      lost: lostLeads.length,
      pipelineValueMinor: leads.reduce(
        (sum, lead) => sum + (toMinorNumber(lead.estimatedValueMinor) ?? 0),
        0,
      ),
      wonValueMinor: wonLeads.reduce(
        (sum, lead) => sum + (toMinorNumber(lead.estimatedValueMinor) ?? 0),
        0,
      ),
    });

    return {
      generatedAt: new Date().toISOString(),
      pipeline: { id: selected.id, name: selected.name },
      ...summary,
    };
  }

  async history(actor: AuthUser, leadId: string) {
    const tenantId = this.requireTenant(actor);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
    });
    if (!lead) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Lead not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    const rows = await this.prisma.leadStageChange.findMany({
      where: { tenantId, leadId },
      include: {
        fromStage: true,
        toStage: true,
        changedBy: { include: { user: true } },
      },
      orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      fromStageId: row.fromStageId,
      fromStageName: row.fromStage?.name ?? null,
      toStageId: row.toStageId,
      toStageName: row.toStage.name,
      fromLifecycleStatus: row.fromLifecycleStatus,
      toLifecycleStatus: row.toLifecycleStatus,
      reason: row.reason,
      changedByName: row.changedBy?.user.fullName ?? null,
      changedAt: row.changedAt.toISOString(),
    }));
  }

  async changeStage(actor: AuthUser, leadId: string, dto: ChangeStageRequest): Promise<PipelineCard> {
    const tenantId = this.requireTenant(actor);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
      include: boardLeadInclude,
    });
    if (!lead) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Lead not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    if (dto.version != null && dto.version !== lead.version) {
      throw new AppException(HttpStatus.CONFLICT, 'Lead was updated by someone else', {
        code: ErrorCodes.STALE_VERSION,
        detail: 'Refresh the board and try again.',
      });
    }
    if (lead.stageId === dto.stageId) {
      return this.toCard(lead);
    }

    const target = await this.prisma.pipelineStage.findFirst({
      where: {
        id: dto.stageId,
        tenantId,
        pipelineId: lead.pipelineId,
        deletedAt: null,
      },
    });
    if (!target) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Stage is not on this pipeline', {
        code: ErrorCodes.VALIDATION_ERROR,
        errors: [{ field: 'stageId', code: 'invalid', message: 'Choose a stage from the same pipeline.' }],
      });
    }

    const nextLifecycle = lifecycleForStage(target) as LeadLifecycleStatus;
    if (target.isLost && !dto.lostReasonId && !lead.lostReasonId) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'A loss reason is required', {
        code: ErrorCodes.VALIDATION_ERROR,
        errors: [{ field: 'lostReasonId', code: 'required', message: 'Select why the lead was lost.' }],
      });
    }
    if (dto.lostReasonId) {
      const reason = await this.prisma.lossReason.findFirst({
        where: { id: dto.lostReasonId, tenantId, deletedAt: null, isActive: true },
      });
      if (!reason) {
        throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Loss reason is not valid', {
          code: ErrorCodes.VALIDATION_ERROR,
          errors: [{ field: 'lostReasonId', code: 'invalid', message: 'Choose an active loss reason.' }],
        });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.leadStageChange.create({
        data: {
          tenantId,
          leadId: lead.id,
          fromStageId: lead.stageId,
          toStageId: target.id,
          fromLifecycleStatus: lead.lifecycleStatus,
          toLifecycleStatus: nextLifecycle,
          changedByMembershipId: actor.membershipId ?? null,
          reason: dto.reason?.trim() || null,
          createdBy: actor.userId,
        },
      });
      const next = await tx.lead.update({
        where: { id: lead.id },
        data: {
          stageId: target.id,
          lifecycleStatus: nextLifecycle,
          lostReasonId: target.isLost ? (dto.lostReasonId ?? lead.lostReasonId) : null,
          updatedBy: actor.userId,
          lastActivityAt: new Date(),
          version: { increment: 1 },
        },
        include: boardLeadInclude,
      });
      await this.timeline.record(
        {
          tenantId,
          leadId: lead.id,
          actor,
          eventCode: TIMELINE_EVENT.statusChanged,
          subject: 'Status Changed',
          body: `${lead.stage.name} → ${target.name}.`,
          metadata: { fromStageId: lead.stageId, toStageId: target.id },
        },
        tx,
      );
      await this.audit.record(
        {
          tenantId,
          actor,
          action: TRACK_ACTION.statusChange,
          resourceType: TRACK_RESOURCE.lead,
          resourceId: lead.id,
          after: trackPayload(`${lead.stage.name} → ${target.name}`, {
            number: lead.leadNumber,
            from: lead.stage.name,
            to: target.name,
          }),
        },
        tx,
      );
      return next;
    });
    return this.toCard(updated);
  }

  private async requirePipeline(tenantId: string, pipelineId: string) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, tenantId, deletedAt: null, isActive: true },
    });
    if (!pipeline) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Pipeline not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return pipeline;
  }

  private requireTenant(actor: AuthUser): string {
    if (!actor.tenantId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Tenant required', {
        code: ErrorCodes.TENANT_REQUIRED,
      });
    }
    return actor.tenantId;
  }

  private toStageView(stage: {
    id: string;
    code: string;
    name: string;
    sortOrder: number;
    winProbabilityBps: number;
    isOpen: boolean;
    isWon: boolean;
    isLost: boolean;
  }) {
    return {
      id: stage.id,
      code: stage.code,
      name: stage.name,
      sortOrder: stage.sortOrder,
      winProbabilityBps: stage.winProbabilityBps,
      isOpen: stage.isOpen,
      isWon: stage.isWon,
      isLost: stage.isLost,
    };
  }

  private toCard(lead: BoardLeadRow): PipelineCard {
    return {
      id: lead.id,
      leadNumber: lead.leadNumber,
      title: lead.title,
      customerName: lead.customerName,
      primaryPhone: lead.primaryPhone,
      quality: lead.quality,
      estimatedValueMinor: toMinorNumber(lead.estimatedValueMinor),
      currency: lead.currency,
      ownerMembershipId: lead.ownerMembershipId,
      ownerName: lead.owner?.user.fullName ?? null,
      stageId: lead.stageId,
      stageName: lead.stage.name,
      lifecycleStatus: lead.lifecycleStatus,
      version: lead.version,
      updatedAt: lead.updatedAt.toISOString(),
    };
  }
}
