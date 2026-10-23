import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { DEFAULT_PIPELINE_STAGES } from '../../pipeline/domain/default-pipeline';

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class LeadCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaults(tenantId: string, actorUserId?: string, db: Db = this.prisma) {
    let pipeline = await db.pipeline.findFirst({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (!pipeline) {
      pipeline = await db.pipeline.create({
        data: {
          tenantId,
          code: 'default',
          name: 'Default',
          isDefault: true,
          createdBy: actorUserId ?? null,
          updatedBy: actorUserId ?? null,
        },
      });
    }

    for (const stage of DEFAULT_PIPELINE_STAGES) {
      const existing = await db.pipelineStage.findFirst({
        where: { pipelineId: pipeline.id, code: stage.code, deletedAt: null },
      });
      if (!existing) {
        await db.pipelineStage.create({
          data: {
            tenantId,
            pipelineId: pipeline.id,
            code: stage.code,
            name: stage.name,
            sortOrder: stage.sortOrder,
            winProbabilityBps: stage.winProbabilityBps,
            isOpen: stage.isOpen,
            isWon: stage.isWon,
            isLost: stage.isLost,
            createdBy: actorUserId ?? null,
            updatedBy: actorUserId ?? null,
          },
        });
      }
    }

    const firstStage =
      (await db.pipelineStage.findFirst({
        where: { pipelineId: pipeline.id, deletedAt: null, code: 'new' },
      })) ??
      (await db.pipelineStage.findFirst({
        where: { pipelineId: pipeline.id, deletedAt: null, isOpen: true },
        orderBy: { sortOrder: 'asc' },
      }));
    if (!firstStage) {
      throw new Error('Default pipeline has no stages');
    }
    return { pipeline, firstStage };
  }
}
