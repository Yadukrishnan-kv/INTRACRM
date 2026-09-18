import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DEFAULT_LEAD_QUALITIES,
  DEFAULT_PRODUCT_CATEGORY,
  DEFAULT_TAX_RATES,
  DEFAULT_WARRANTY_PERIODS,
} from '../../catalog/domain/catalog';
import {
  DEFAULT_LOSS_REASONS,
  DEFAULT_PIPELINE_STAGES,
} from '../../pipeline/domain/default-pipeline';

const DEFAULT_SOURCES = [
  { code: 'website', name: 'Website', sortOrder: 10 },
  { code: 'walk_in', name: 'Walk-in', sortOrder: 20 },
  { code: 'referral', name: 'Referral', sortOrder: 30 },
  { code: 'campaign', name: 'Campaign', sortOrder: 40 },
] as const;

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class LeadCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaults(tenantId: string, actorUserId?: string, db: Db = this.prisma) {
    for (const source of DEFAULT_SOURCES) {
      const existing = await db.leadSource.findFirst({
        where: { tenantId, code: source.code, deletedAt: null },
      });
      if (!existing) {
        await db.leadSource.create({
          data: {
            tenantId,
            code: source.code,
            name: source.name,
            sortOrder: source.sortOrder,
            createdBy: actorUserId ?? null,
            updatedBy: actorUserId ?? null,
          },
        });
      }
    }

    for (const reason of DEFAULT_LOSS_REASONS) {
      const existing = await db.lossReason.findFirst({
        where: { tenantId, code: reason.code, deletedAt: null },
      });
      if (!existing) {
        await db.lossReason.create({
          data: {
            tenantId,
            code: reason.code,
            name: reason.name,
            createdBy: actorUserId ?? null,
            updatedBy: actorUserId ?? null,
          },
        });
      }
    }

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

    for (const quality of DEFAULT_LEAD_QUALITIES) {
      const existing = await db.leadQualityOption.findFirst({
        where: { tenantId, code: quality.code, deletedAt: null },
      });
      if (!existing) {
        await db.leadQualityOption.create({
          data: {
            tenantId,
            code: quality.code,
            name: quality.name,
            sortOrder: quality.sortOrder,
            createdBy: actorUserId ?? null,
            updatedBy: actorUserId ?? null,
          },
        });
      }
    }

    for (const period of DEFAULT_WARRANTY_PERIODS) {
      const existing = await db.warrantyPeriod.findFirst({
        where: { tenantId, code: period.code, deletedAt: null },
      });
      if (!existing) {
        await db.warrantyPeriod.create({
          data: {
            tenantId,
            code: period.code,
            name: period.name,
            months: period.months,
            sortOrder: period.sortOrder,
            createdBy: actorUserId ?? null,
            updatedBy: actorUserId ?? null,
          },
        });
      }
    }

    for (const tax of DEFAULT_TAX_RATES) {
      const existing = await db.taxRate.findFirst({
        where: { tenantId, code: tax.code, deletedAt: null },
      });
      if (!existing) {
        await db.taxRate.create({
          data: {
            tenantId,
            code: tax.code,
            name: tax.name,
            rateBps: tax.rateBps,
            sortOrder: tax.sortOrder,
            createdBy: actorUserId ?? null,
            updatedBy: actorUserId ?? null,
          },
        });
      }
    }

    const generalCategory = await db.productCategory.findFirst({
      where: { tenantId, code: DEFAULT_PRODUCT_CATEGORY.code, deletedAt: null },
    });
    if (!generalCategory) {
      await db.productCategory.create({
        data: {
          tenantId,
          code: DEFAULT_PRODUCT_CATEGORY.code,
          name: DEFAULT_PRODUCT_CATEGORY.name,
          sortOrder: DEFAULT_PRODUCT_CATEGORY.sortOrder,
          createdBy: actorUserId ?? null,
          updatedBy: actorUserId ?? null,
        },
      });
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
