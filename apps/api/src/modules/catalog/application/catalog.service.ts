import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import { LeadCatalogService } from '../../crm-leads/application/lead-catalog.service';
import { toMinorNumber } from '../../crm-leads/domain/lead-validation';
import {
  assertStageFlags,
  CATALOG_KIND,
  catalogKindLabel,
  CATALOG_KINDS,
  isCatalogCode,
  normalizeCatalogCode,
  percentToBps,
  bpsToPercent,
} from '../domain/catalog';
import {
  CreateCategoryRequest,
  CreateLeadStatusRequest,
  CreateProductRequest,
  CreateWarrantyPeriodRequest,
  CatalogNamedRequest,
  UpdateCatalogNamedRequest,
  UpdateCategoryRequest,
  UpdateLeadStatusRequest,
  UpdateProductRequest,
  UpdateWarrantyPeriodRequest,
  CreateTaxRequest,
  UpdateTaxRequest,
  TaxBatchRequest,
} from '../interface/http/dto/catalog.dto';

export type NamedCatalogView = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  version: number;
  updatedAt: string;
};

export type CategoryView = NamedCatalogView & {
  parentId: string | null;
  parentName: string | null;
};

export type WarrantyPeriodView = NamedCatalogView & { months: number };

export type TaxRateView = NamedCatalogView & {
  rateBps: number;
  ratePercent: number;
};

export type LeadStatusView = NamedCatalogView & {
  pipelineId: string;
  isOpen: boolean;
  isWon: boolean;
  isLost: boolean;
  winProbabilityBps: number;
};

export type ProductView = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  warrantyPeriodId: string | null;
  warrantyPeriodName: string | null;
  unitPriceMinor: number | null;
  currency: string;
  warrantyMonths: number | null;
  isActive: boolean;
  version: number;
  updatedAt: string;
};

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly defaults: LeadCatalogService,
  ) {}

  async overview(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    await this.defaults.ensureDefaults(tenantId, actor.userId);
    const [products, categories, sources, statuses, qualities, periods, taxes] = await Promise.all([
      this.prisma.product.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.productCategory.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.leadSource.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.pipelineStage.count({
        where: { tenantId, deletedAt: null, pipeline: { deletedAt: null } },
      }),
      this.prisma.leadQualityOption.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.warrantyPeriod.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.taxRate.count({ where: { tenantId, deletedAt: null } }),
    ]);
    const counts: Record<string, number> = {
      [CATALOG_KIND.products]: products,
      [CATALOG_KIND.categories]: categories,
      [CATALOG_KIND.sources]: sources,
      [CATALOG_KIND.leadStatuses]: statuses,
      [CATALOG_KIND.leadQualities]: qualities,
      [CATALOG_KIND.warrantyPeriods]: periods,
      [CATALOG_KIND.taxes]: taxes,
    };
    return {
      kinds: CATALOG_KINDS.map((code) => ({
        code,
        name: catalogKindLabel(code),
        count: counts[code] ?? 0,
      })),
    };
  }

  async lookups(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    await this.defaults.ensureDefaults(tenantId, actor.userId);
    const active = { tenantId, deletedAt: null, isActive: true };
    const [sources, qualities, categories, periods, products, taxes] = await Promise.all([
      this.prisma.leadSource.findMany({
        where: active,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.leadQualityOption.findMany({
        where: active,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.productCategory.findMany({
        where: active,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.warrantyPeriod.findMany({
        where: active,
        orderBy: [{ sortOrder: 'asc' }, { months: 'asc' }],
      }),
      this.prisma.product.findMany({
        where: active,
        orderBy: { name: 'asc' },
        take: 200,
        include: { category: true, warrantyPeriod: true },
      }),
      this.prisma.taxRate.findMany({
        where: active,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);
    const { pipeline } = await this.defaults.ensureDefaults(tenantId, actor.userId);
    const statuses = await this.prisma.pipelineStage.findMany({
      where: { pipelineId: pipeline.id, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      sources: sources.map((row) => this.toNamed(row)),
      qualities: qualities.map((row) => this.toNamed(row)),
      categories: categories.map((row) => this.toCategory(row)),
      warrantyPeriods: periods.map((row) => this.toPeriod(row)),
      leadStatuses: statuses.map((row) => this.toStatus(row)),
      products: products.map((row) => this.toProduct(row)),
      taxes: taxes.map((row) => this.toTax(row)),
    };
  }

  listSources(actor: AuthUser, includeInactive?: boolean) {
    return this.listNamed(actor, 'leadSource', includeInactive);
  }

  createSource(actor: AuthUser, dto: CatalogNamedRequest) {
    return this.createNamed(actor, 'leadSource', dto);
  }

  updateSource(actor: AuthUser, id: string, dto: UpdateCatalogNamedRequest) {
    return this.updateNamed(actor, 'leadSource', id, dto);
  }

  deleteSource(actor: AuthUser, id: string) {
    return this.deleteNamed(actor, 'leadSource', id, async (tenantId) => {
      const used = await this.prisma.lead.count({
        where: { tenantId, sourceId: id, deletedAt: null },
      });
      return used > 0 ? 'This source is used by live leads.' : null;
    });
  }

  listQualities(actor: AuthUser, includeInactive?: boolean) {
    return this.listNamed(actor, 'leadQualityOption', includeInactive);
  }

  createQuality(actor: AuthUser, dto: CatalogNamedRequest) {
    return this.createNamed(actor, 'leadQualityOption', dto);
  }

  updateQuality(actor: AuthUser, id: string, dto: UpdateCatalogNamedRequest) {
    return this.updateNamed(actor, 'leadQualityOption', id, dto);
  }

  deleteQuality(actor: AuthUser, id: string) {
    return this.deleteNamed(actor, 'leadQualityOption', id, async (tenantId, row) => {
      const used = await this.prisma.lead.count({
        where: { tenantId, quality: row.code, deletedAt: null },
      });
      return used > 0 ? 'This quality is used by live leads.' : null;
    });
  }

  listWarrantyPeriods(actor: AuthUser, includeInactive?: boolean) {
    return this.listNamed(actor, 'warrantyPeriod', includeInactive);
  }

  async createWarrantyPeriod(actor: AuthUser, dto: CreateWarrantyPeriodRequest) {
    const tenantId = this.requireTenant(actor);
    const code = this.requireCode(dto.code);
    await this.assertUnique(tenantId, 'warrantyPeriod', code);
    await this.assertUniqueMonths(tenantId, dto.months);
    const row = await this.prisma.warrantyPeriod.create({
      data: {
        tenantId,
        code,
        name: dto.name.trim(),
        months: dto.months,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });
    return this.toPeriod(row);
  }

  async updateWarrantyPeriod(actor: AuthUser, id: string, dto: UpdateWarrantyPeriodRequest) {
    const tenantId = this.requireTenant(actor);
    const current = await this.prisma.warrantyPeriod.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!current) {
      this.missing('Warranty period');
    }
    const code = dto.code ? this.requireCode(dto.code) : current.code;
    if (code !== current.code) {
      await this.assertUnique(tenantId, 'warrantyPeriod', code, id);
    }
    if (dto.months != null && dto.months !== current.months) {
      await this.assertUniqueMonths(tenantId, dto.months, id);
    }
    const months = dto.months ?? current.months;
    const row = await this.prisma.warrantyPeriod.update({
      where: { id },
      data: {
        code,
        name: dto.name?.trim() ?? current.name,
        months,
        sortOrder: dto.sortOrder ?? current.sortOrder,
        isActive: dto.isActive ?? current.isActive,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
    if (months !== current.months) {
      await this.prisma.product.updateMany({
        where: { tenantId, warrantyPeriodId: id, deletedAt: null },
        data: { warrantyMonths: months },
      });
    }
    return this.toPeriod(row);
  }

  deleteWarrantyPeriod(actor: AuthUser, id: string) {
    return this.deleteNamed(actor, 'warrantyPeriod', id, async (tenantId) => {
      const used = await this.prisma.product.count({
        where: { tenantId, warrantyPeriodId: id, deletedAt: null },
      });
      return used > 0 ? 'This period is used by products.' : null;
    });
  }

  async listTaxes(actor: AuthUser, includeInactive?: boolean): Promise<TaxRateView[]> {
    const tenantId = this.requireTenant(actor);
    await this.defaults.ensureDefaults(tenantId, actor.userId);
    const rows = await this.prisma.taxRate.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => this.toTax(row));
  }

  async createTax(actor: AuthUser, dto: CreateTaxRequest): Promise<TaxRateView> {
    const tenantId = this.requireTenant(actor);
    const code = this.requireCode(dto.code);
    await this.assertUniqueTax(tenantId, code);
    const row = await this.prisma.taxRate.create({
      data: {
        tenantId,
        code,
        name: dto.name.trim(),
        rateBps: percentToBps(dto.ratePercent),
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });
    return this.toTax(row);
  }

  async updateTax(actor: AuthUser, id: string, dto: UpdateTaxRequest): Promise<TaxRateView> {
    const tenantId = this.requireTenant(actor);
    const current = await this.prisma.taxRate.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!current) {
      this.missing('Tax');
    }
    const code = dto.code ? this.requireCode(dto.code) : current.code;
    if (code !== current.code) {
      await this.assertUniqueTax(tenantId, code, id);
    }
    const row = await this.prisma.taxRate.update({
      where: { id },
      data: {
        code,
        name: dto.name?.trim() ?? current.name,
        rateBps: dto.ratePercent == null ? current.rateBps : percentToBps(dto.ratePercent),
        sortOrder: dto.sortOrder ?? current.sortOrder,
        isActive: dto.isActive ?? current.isActive,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
    return this.toTax(row);
  }

  async deleteTax(actor: AuthUser, id: string) {
    const tenantId = this.requireTenant(actor);
    const current = await this.prisma.taxRate.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!current) {
      this.missing('Tax');
    }
    const used = await this.prisma.quotationItem.findMany({
      where: { tenantId, deletedAt: null },
      select: { taxRateIds: true },
    });
    const inUse = used.some((row) => Array.isArray(row.taxRateIds) && row.taxRateIds.includes(id));
    if (inUse) {
      throw new AppException(HttpStatus.CONFLICT, 'Catalog item is in use', {
        code: ErrorCodes.CONFLICT,
        detail: 'This tax is used on live quotations.',
      });
    }
    await this.prisma.taxRate.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: actor.userId,
        isActive: false,
        version: { increment: 1 },
      },
    });
    return { deleted: true };
  }

  async saveTaxes(actor: AuthUser, dto: TaxBatchRequest): Promise<TaxRateView[]> {
    const keepIds = new Set(dto.items.map((item) => item.id).filter((id): id is string => Boolean(id)));
    const saved: TaxRateView[] = [];
    for (let index = 0; index < dto.items.length; index += 1) {
      const item = dto.items[index];
      if (!item) {
        continue;
      }
      const sortOrder = item.sortOrder ?? (index + 1) * 10;
      if (item.id) {
        saved.push(
          await this.updateTax(actor, item.id, {
            ...(item.code ? { code: item.code } : {}),
            name: item.name,
            ratePercent: item.ratePercent,
            sortOrder,
            ...(item.isActive == null ? {} : { isActive: item.isActive }),
          }),
        );
        continue;
      }
      saved.push(
        await this.createTax(actor, {
          code: item.code ?? this.codeFromName(item.name, index),
          name: item.name,
          ratePercent: item.ratePercent,
          sortOrder,
          ...(item.isActive == null ? {} : { isActive: item.isActive }),
        }),
      );
    }
    for (const id of dto.deleteIds ?? []) {
      if (keepIds.has(id)) {
        continue;
      }
      try {
        await this.deleteTax(actor, id);
      } catch (error) {
        if (error instanceof AppException && error.code === ErrorCodes.CONFLICT) {
          continue;
        }
        throw error;
      }
    }
    return saved;
  }

  async listCategories(actor: AuthUser, includeInactive?: boolean): Promise<CategoryView[]> {
    const tenantId = this.requireTenant(actor);
    await this.defaults.ensureDefaults(tenantId, actor.userId);
    const rows = await this.prisma.productCategory.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: { parent: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => this.toCategory(row));
  }

  async createCategory(actor: AuthUser, dto: CreateCategoryRequest): Promise<CategoryView> {
    const tenantId = this.requireTenant(actor);
    const code = this.requireCode(dto.code);
    await this.assertUnique(tenantId, 'productCategory', code);
    if (dto.parentId) {
      await this.requireCategory(tenantId, dto.parentId);
    }
    const row = await this.prisma.productCategory.create({
      data: {
        tenantId,
        code,
        name: dto.name.trim(),
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
      include: { parent: true },
    });
    return this.toCategory(row);
  }

  async updateCategory(actor: AuthUser, id: string, dto: UpdateCategoryRequest): Promise<CategoryView> {
    const tenantId = this.requireTenant(actor);
    const current = await this.requireCategory(tenantId, id);
    const code = dto.code ? this.requireCode(dto.code) : current.code;
    if (code !== current.code) {
      await this.assertUnique(tenantId, 'productCategory', code, id);
    }
    const parentId = dto.parentId === undefined ? current.parentId : dto.parentId;
    if (parentId === id) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Category cannot be its own parent', {
        code: ErrorCodes.VALIDATION_ERROR,
        errors: [{ field: 'parentId', code: 'invalid', message: 'Choose a different parent category.' }],
      });
    }
    if (parentId) {
      await this.requireCategory(tenantId, parentId);
      if (await this.wouldCycle(tenantId, id, parentId)) {
        throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Category parent would create a cycle', {
          code: ErrorCodes.VALIDATION_ERROR,
          errors: [{ field: 'parentId', code: 'invalid', message: 'Choose a parent that is not a child of this category.' }],
        });
      }
    }
    const row = await this.prisma.productCategory.update({
      where: { id },
      data: {
        code,
        name: dto.name?.trim() ?? current.name,
        parentId,
        sortOrder: dto.sortOrder ?? current.sortOrder,
        isActive: dto.isActive ?? current.isActive,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
      include: { parent: true },
    });
    return this.toCategory(row);
  }

  async deleteCategory(actor: AuthUser, id: string) {
    const tenantId = this.requireTenant(actor);
    await this.requireCategory(tenantId, id);
    const [products, children] = await Promise.all([
      this.prisma.product.count({ where: { tenantId, categoryId: id, deletedAt: null } }),
      this.prisma.productCategory.count({ where: { tenantId, parentId: id, deletedAt: null } }),
    ]);
    if (products > 0 || children > 0) {
      throw new AppException(HttpStatus.CONFLICT, 'Category is in use', {
        code: ErrorCodes.CONFLICT,
        detail: 'Move or remove products and child categories first.',
      });
    }
    await this.prisma.productCategory.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actor.userId, isActive: false, version: { increment: 1 } },
    });
    return { deleted: true };
  }

  async listProducts(actor: AuthUser, includeInactive?: boolean): Promise<ProductView[]> {
    const tenantId = this.requireTenant(actor);
    await this.defaults.ensureDefaults(tenantId, actor.userId);
    const rows = await this.prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: { category: true, warrantyPeriod: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => this.toProduct(row));
  }

  async createProduct(actor: AuthUser, dto: CreateProductRequest): Promise<ProductView> {
    const tenantId = this.requireTenant(actor);
    await this.assertUniqueSku(tenantId, dto.sku.trim());
    const category = dto.categoryId ? await this.requireCategory(tenantId, dto.categoryId) : null;
    const period = dto.warrantyPeriodId
      ? await this.requirePeriod(tenantId, dto.warrantyPeriodId)
      : null;
    const row = await this.prisma.product.create({
      data: {
        tenantId,
        sku: dto.sku.trim(),
        name: dto.name.trim(),
        description: emptyToNull(dto.description),
        categoryId: category?.id ?? null,
        warrantyPeriodId: period?.id ?? null,
        unitPriceMinor: dto.unitPriceMinor == null ? null : BigInt(dto.unitPriceMinor),
        currency: dto.currency ?? 'INR',
        warrantyMonths: period?.months ?? dto.warrantyMonths ?? null,
        isActive: dto.isActive ?? true,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
      include: { category: true, warrantyPeriod: true },
    });
    return this.toProduct(row);
  }

  async updateProduct(actor: AuthUser, id: string, dto: UpdateProductRequest): Promise<ProductView> {
    const tenantId = this.requireTenant(actor);
    const current = await this.prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!current) {
      this.missing('Product');
    }
    if (dto.sku && dto.sku.trim() !== current.sku) {
      await this.assertUniqueSku(tenantId, dto.sku.trim(), id);
    }
    const categoryId =
      dto.categoryId === undefined ? current.categoryId : dto.categoryId;
    if (categoryId) {
      await this.requireCategory(tenantId, categoryId);
    }
    const warrantyPeriodId =
      dto.warrantyPeriodId === undefined ? current.warrantyPeriodId : dto.warrantyPeriodId;
    const period = warrantyPeriodId
      ? await this.requirePeriod(tenantId, warrantyPeriodId, warrantyPeriodId !== current.warrantyPeriodId)
      : null;
    const row = await this.prisma.product.update({
      where: { id },
      data: {
        sku: dto.sku?.trim() ?? current.sku,
        name: dto.name?.trim() ?? current.name,
        description:
          dto.description === undefined ? current.description : emptyToNull(dto.description),
        categoryId,
        warrantyPeriodId,
        unitPriceMinor:
          dto.unitPriceMinor === undefined
            ? current.unitPriceMinor
            : dto.unitPriceMinor == null
              ? null
              : BigInt(dto.unitPriceMinor),
        warrantyMonths: period?.months ?? (dto.warrantyMonths === undefined
          ? current.warrantyMonths
          : dto.warrantyMonths),
        isActive: dto.isActive ?? current.isActive,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
      include: { category: true, warrantyPeriod: true },
    });
    return this.toProduct(row);
  }

  async deleteProduct(actor: AuthUser, id: string) {
    const tenantId = this.requireTenant(actor);
    const current = await this.prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!current) {
      this.missing('Product');
    }
    const [quotes, warranties, targets] = await Promise.all([
      this.prisma.quotationItem.count({ where: { productId: id, deletedAt: null } }),
      this.prisma.warrantyCardItem.count({ where: { productId: id, deletedAt: null } }),
      this.prisma.target.count({ where: { productId: id, deletedAt: null } }),
    ]);
    if (quotes + warranties + targets > 0) {
      throw new AppException(HttpStatus.CONFLICT, 'Product is in use', {
        code: ErrorCodes.CONFLICT,
        detail: 'Deactivate the product instead of deleting it.',
      });
    }
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actor.userId, isActive: false, version: { increment: 1 } },
    });
    return { deleted: true };
  }

  async listLeadStatuses(actor: AuthUser): Promise<LeadStatusView[]> {
    const tenantId = this.requireTenant(actor);
    const { pipeline } = await this.defaults.ensureDefaults(tenantId, actor.userId);
    const rows = await this.prisma.pipelineStage.findMany({
      where: { pipelineId: pipeline.id, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((row) => this.toStatus(row));
  }

  async createLeadStatus(actor: AuthUser, dto: CreateLeadStatusRequest): Promise<LeadStatusView> {
    const tenantId = this.requireTenant(actor);
    const { pipeline } = await this.defaults.ensureDefaults(tenantId, actor.userId);
    const code = this.requireCode(dto.code);
    const flags = this.requireFlags(dto);
    const clash = await this.prisma.pipelineStage.findFirst({
      where: { pipelineId: pipeline.id, code, deletedAt: null },
    });
    if (clash) {
      this.duplicate('code');
    }
    const row = await this.prisma.pipelineStage.create({
      data: {
        tenantId,
        pipelineId: pipeline.id,
        code,
        name: dto.name.trim(),
        sortOrder: dto.sortOrder ?? 0,
        winProbabilityBps: dto.winProbabilityBps ?? (flags.isWon ? 10000 : 0),
        isOpen: flags.isOpen,
        isWon: flags.isWon,
        isLost: flags.isLost,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });
    return this.toStatus(row);
  }

  async updateLeadStatus(actor: AuthUser, id: string, dto: UpdateLeadStatusRequest): Promise<LeadStatusView> {
    const tenantId = this.requireTenant(actor);
    const current = await this.prisma.pipelineStage.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!current) {
      this.missing('Lead status');
    }
    const code = dto.code ? this.requireCode(dto.code) : current.code;
    if (code !== current.code) {
      const clash = await this.prisma.pipelineStage.findFirst({
        where: { pipelineId: current.pipelineId, code, deletedAt: null, NOT: { id } },
      });
      if (clash) {
        this.duplicate('code');
      }
    }
    const flags = this.requireFlags({
      isOpen: dto.isOpen ?? current.isOpen,
      isWon: dto.isWon ?? current.isWon,
      isLost: dto.isLost ?? current.isLost,
    });
    await this.assertRemainingOpenStage(current.pipelineId, id, flags.isOpen);
    const row = await this.prisma.pipelineStage.update({
      where: { id },
      data: {
        code,
        name: dto.name?.trim() ?? current.name,
        sortOrder: dto.sortOrder ?? current.sortOrder,
        winProbabilityBps: dto.winProbabilityBps ?? current.winProbabilityBps,
        isOpen: flags.isOpen,
        isWon: flags.isWon,
        isLost: flags.isLost,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
    return this.toStatus(row);
  }

  async deleteLeadStatus(actor: AuthUser, id: string) {
    const tenantId = this.requireTenant(actor);
    const current = await this.prisma.pipelineStage.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!current) {
      this.missing('Lead status');
    }
    const used = await this.prisma.lead.count({
      where: { tenantId, stageId: id, deletedAt: null },
    });
    if (used > 0) {
      throw new AppException(HttpStatus.CONFLICT, 'Lead status is in use', {
        code: ErrorCodes.CONFLICT,
        detail: 'Move leads out of this status before deleting it.',
      });
    }
    await this.assertRemainingOpenStage(current.pipelineId, id, false);
    await this.prisma.pipelineStage.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actor.userId, version: { increment: 1 } },
    });
    return { deleted: true };
  }

  private async listNamed(
    actor: AuthUser,
    model: 'leadSource' | 'leadQualityOption' | 'warrantyPeriod',
    includeInactive?: boolean,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.defaults.ensureDefaults(tenantId, actor.userId);
    const rows = await this.named(model).findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (model === 'warrantyPeriod') {
      return rows.map((row) => this.toPeriod(row as WarrantyPeriodRow));
    }
    return rows.map((row) => this.toNamed(row));
  }

  private async createNamed(
    actor: AuthUser,
    model: 'leadSource' | 'leadQualityOption',
    dto: CatalogNamedRequest,
  ) {
    const tenantId = this.requireTenant(actor);
    const code = this.requireCode(dto.code);
    await this.assertUnique(tenantId, model, code);
    const row = await this.named(model).create({
      data: {
        tenantId,
        code,
        name: dto.name.trim(),
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });
    return this.toNamed(row);
  }

  private async updateNamed(
    actor: AuthUser,
    model: 'leadSource' | 'leadQualityOption',
    id: string,
    dto: UpdateCatalogNamedRequest,
  ) {
    const tenantId = this.requireTenant(actor);
    const current = await this.named(model).findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!current) {
      this.missing(model === 'leadSource' ? 'Source' : 'Lead quality');
    }
    const code = dto.code ? this.requireCode(dto.code) : current.code;
    if (code !== current.code) {
      await this.assertUnique(tenantId, model, code, id);
    }
    const row = await this.named(model).update({
      where: { id },
      data: {
        code,
        name: dto.name?.trim() ?? current.name,
        sortOrder: dto.sortOrder ?? current.sortOrder,
        isActive: dto.isActive ?? current.isActive,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
    if (model === 'leadQualityOption' && code !== current.code) {
      await this.prisma.lead.updateMany({
        where: { tenantId, quality: current.code, deletedAt: null },
        data: { quality: code },
      });
    }
    return this.toNamed(row);
  }

  private async deleteNamed(
    actor: AuthUser,
    model: 'leadSource' | 'leadQualityOption' | 'warrantyPeriod',
    id: string,
    inUse: (tenantId: string, row: { code: string }) => Promise<string | null>,
  ) {
    const tenantId = this.requireTenant(actor);
    const current = await this.named(model).findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!current) {
      this.missing('Catalog item');
    }
    const reason = await inUse(tenantId, current);
    if (reason) {
      throw new AppException(HttpStatus.CONFLICT, 'Catalog item is in use', {
        code: ErrorCodes.CONFLICT,
        detail: reason,
      });
    }
    await this.named(model).update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: actor.userId,
        isActive: false,
        version: { increment: 1 },
      },
    });
    return { deleted: true };
  }

  private named(
    model: 'leadSource' | 'leadQualityOption' | 'warrantyPeriod' | 'productCategory',
  ): NamedStore {
    return this.prisma[model] as unknown as NamedStore;
  }

  private async assertUnique(
    tenantId: string,
    model: 'leadSource' | 'leadQualityOption' | 'warrantyPeriod' | 'productCategory',
    code: string,
    exceptId?: string,
  ) {
    const existing = await this.named(model).findFirst({
      where: {
        tenantId,
        code,
        deletedAt: null,
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
    });
    if (existing) {
      this.duplicate('code');
    }
  }

  private async assertUniqueSku(tenantId: string, sku: string, exceptId?: string) {
    const existing = await this.prisma.product.findFirst({
      where: { tenantId, sku, deletedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    });
    if (existing) {
      this.duplicate('sku');
    }
  }

  private async assertUniqueMonths(tenantId: string, months: number, exceptId?: string) {
    const existing = await this.prisma.warrantyPeriod.findFirst({
      where: { tenantId, months, deletedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    });
    if (existing) {
      this.duplicate('months');
    }
  }

  private async requireCategory(tenantId: string, id: string) {
    const row = await this.prisma.productCategory.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { parent: true },
    });
    if (!row) {
      this.missing('Category');
    }
    return row;
  }

  private async requirePeriod(tenantId: string, id: string, requireActive = true) {
    const row = await this.prisma.warrantyPeriod.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
        ...(requireActive ? { isActive: true } : {}),
      },
    });
    if (!row) {
      this.missing('Warranty period');
    }
    return row;
  }

  private async wouldCycle(tenantId: string, id: string, parentId: string): Promise<boolean> {
    let current: string | null = parentId;
    const seen = new Set<string>([id]);
    while (current) {
      if (seen.has(current)) {
        return true;
      }
      seen.add(current);
      const row: { parentId: string | null } | null = await this.prisma.productCategory.findFirst({
        where: { id: current, tenantId, deletedAt: null },
        select: { parentId: true },
      });
      current = row?.parentId ?? null;
    }
    return false;
  }

  private async assertRemainingOpenStage(pipelineId: string, exceptId: string, nextIsOpen: boolean) {
    if (nextIsOpen) {
      return;
    }
    const remaining = await this.prisma.pipelineStage.count({
      where: { pipelineId, deletedAt: null, isOpen: true, NOT: { id: exceptId } },
    });
    if (remaining === 0) {
      throw new AppException(HttpStatus.CONFLICT, 'Keep at least one open lead status', {
        code: ErrorCodes.CONFLICT,
        detail: 'The pipeline must keep one open status.',
      });
    }
  }

  private requireCode(value: string) {
    if (!isCatalogCode(value)) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Catalog code is not valid', {
        code: ErrorCodes.VALIDATION_ERROR,
        errors: [
          {
            field: 'code',
            code: 'invalid',
            message: 'Use a lowercase letter, then letters, numbers, or underscores.',
          },
        ],
      });
    }
    return normalizeCatalogCode(value);
  }

  private requireFlags(dto: { isOpen?: boolean; isWon?: boolean; isLost?: boolean }) {
    const flags = assertStageFlags(dto);
    if (!flags.ok) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, flags.message, {
        code: ErrorCodes.VALIDATION_ERROR,
        errors: [{ field: 'isWon', code: 'invalid', message: flags.message }],
      });
    }
    return flags;
  }

  private toNamed(row: { id: string; code: string; name: string; isActive: boolean; sortOrder: number; version: number; updatedAt: Date }): NamedCatalogView {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toCategory(row: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    sortOrder: number;
    version: number;
    updatedAt: Date;
    parentId: string | null;
    parent?: { name: string } | null;
  }): CategoryView {
    return {
      ...this.toNamed(row),
      parentId: row.parentId,
      parentName: row.parent?.name ?? null,
    };
  }

  private async assertUniqueTax(tenantId: string, code: string, exceptId?: string) {
    const existing = await this.prisma.taxRate.findFirst({
      where: {
        tenantId,
        code,
        deletedAt: null,
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
    });
    if (existing) {
      this.duplicate('code');
    }
  }

  private codeFromName(name: string, index: number): string {
    const cleaned = name.replace(/[^a-zA-Z0-9\s_-]/g, '');
    const code = normalizeCatalogCode(cleaned) || `tax_${index + 1}`;
    return this.requireCode(code.startsWith('tax') || /^[a-z]/.test(code) ? code : `tax_${code}`);
  }

  private toPeriod(row: WarrantyPeriodRow): WarrantyPeriodView {
    return { ...this.toNamed(row), months: row.months };
  }

  private toTax(row: TaxRateRow): TaxRateView {
    return {
      ...this.toNamed(row),
      rateBps: row.rateBps,
      ratePercent: bpsToPercent(row.rateBps),
    };
  }

  private toStatus(row: {
    id: string;
    pipelineId: string;
    code: string;
    name: string;
    sortOrder: number;
    winProbabilityBps: number;
    isOpen: boolean;
    isWon: boolean;
    isLost: boolean;
    version: number;
    updatedAt: Date;
  }): LeadStatusView {
    return {
      id: row.id,
      pipelineId: row.pipelineId,
      code: row.code,
      name: row.name,
      isActive: true,
      sortOrder: row.sortOrder,
      isOpen: row.isOpen,
      isWon: row.isWon,
      isLost: row.isLost,
      winProbabilityBps: row.winProbabilityBps,
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toProduct(row: {
    id: string;
    sku: string;
    name: string;
    description: string | null;
    categoryId: string | null;
    warrantyPeriodId: string | null;
    unitPriceMinor: bigint | null;
    currency: string;
    warrantyMonths: number | null;
    isActive: boolean;
    version: number;
    updatedAt: Date;
    category?: { name: string } | null;
    warrantyPeriod?: { name: string } | null;
  }): ProductView {
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      description: row.description,
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? null,
      warrantyPeriodId: row.warrantyPeriodId,
      warrantyPeriodName: row.warrantyPeriod?.name ?? null,
      unitPriceMinor: toMinorNumber(row.unitPriceMinor),
      currency: row.currency,
      warrantyMonths: row.warrantyMonths,
      isActive: row.isActive,
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private duplicate(field: string): never {
    throw new AppException(HttpStatus.CONFLICT, 'Catalog value already exists', {
      code: ErrorCodes.CONFLICT,
      errors: [{ field, code: 'duplicate', message: 'This value is already in the catalog.' }],
    });
  }

  private missing(title: string): never {
    throw new AppException(HttpStatus.NOT_FOUND, `${title} not found`, {
      code: ErrorCodes.NOT_FOUND,
    });
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

type NamedRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  version: number;
  updatedAt: Date;
  months?: number;
};

type NamedStore = {
  findMany(args: object): Promise<NamedRow[]>;
  findFirst(args: object): Promise<NamedRow | null>;
  create(args: object): Promise<NamedRow>;
  update(args: object): Promise<NamedRow>;
};

type WarrantyPeriodRow = {
  id: string;
  code: string;
  name: string;
  months: number;
  isActive: boolean;
  sortOrder: number;
  version: number;
  updatedAt: Date;
};

type TaxRateRow = {
  id: string;
  code: string;
  name: string;
  rateBps: number;
  isActive: boolean;
  sortOrder: number;
  version: number;
  updatedAt: Date;
};

function emptyToNull(value?: string | null): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
