import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { RedisService } from '../../../common/redis/redis.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PERMISSION } from '../../identity/domain/system-roles';
import { AccessPolicy } from '../../identity/domain/access.policy';
import {
  SEARCH_CATALOG,
  SEARCH_FIELD,
  SEARCH_LIMITS,
  SearchField,
  SearchPlan,
  planSearch,
  scoreHit,
} from '../domain/search-query';

export type SearchHit = {
  type: 'lead' | 'quotation';
  id: string;
  leadId: string;
  quotationId: string | null;
  title: string;
  subtitle: string;
  leadNumber: string | null;
  quotationNumber: string | null;
  customerName: string | null;
  primaryPhone: string | null;
  status: string | null;
  matchedBy: SearchField;
  score: number;
};

type SearchResponse = {
  q: string;
  by: SearchField | null;
  classifiedAs: SearchField | null;
  strategy: string;
  hits: SearchHit[];
};

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  catalog() {
    return {
      fields: SEARCH_CATALOG,
      auto: {
        name: 'Auto',
        description: 'Classifies Customer, Mobile, Lead ID, or Quotation Number from the text',
      },
    };
  }

  async search(actor: AuthUser, query: { q: string; by?: SearchField; limit?: number }) {
    const tenantId = this.requireTenant(actor);
    const planned = planSearch(query.q, query.by);
    const limit = Math.min(query.limit ?? SEARCH_LIMITS.defaultLimit, SEARCH_LIMITS.maxLimit);
    if (!planned.ok) {
      return {
        q: query.q.trim(),
        by: query.by ?? null,
        classifiedAs: planned.field,
        strategy: planned.reason,
        hits: [] as SearchHit[],
      };
    }
    this.assertFieldAccess(actor, planned.plan.field, Boolean(query.by));
    const cacheKey = `search:${tenantId}:${planned.plan.cacheKey}:${limit}`;
    const cached = await this.readCache(cacheKey);
    if (cached) {
      return cached;
    }
    const hits = await this.execute(tenantId, planned.plan, limit, actor);
    const payload: SearchResponse = {
      q: planned.plan.raw,
      by: query.by ?? null,
      classifiedAs: planned.plan.field,
      strategy: planned.plan.strategy,
      hits,
    };
    await this.writeCache(cacheKey, payload);
    return payload;
  }

  private async execute(
    tenantId: string,
    plan: SearchPlan,
    limit: number,
    actor: AuthUser,
  ): Promise<SearchHit[]> {
    switch (plan.field) {
      case SEARCH_FIELD.quotationNumber:
        if (!this.can(actor, PERMISSION.quotationRead)) {
          return [];
        }
        return this.searchQuotations(tenantId, plan, limit);
      default:
        if (!this.can(actor, PERMISSION.leadRead)) {
          return [];
        }
        return this.searchLeads(tenantId, plan, limit);
    }
  }

  private async searchLeads(tenantId: string, plan: SearchPlan, limit: number): Promise<SearchHit[]> {
    const base = { tenantId, deletedAt: null as null };
    const select = {
      id: true,
      leadNumber: true,
      title: true,
      customerName: true,
      primaryPhone: true,
      lifecycleStatus: true,
      city: true,
    } as const;
    let rows = await this.prisma.lead.findMany({
      where: this.leadWhere(base, plan),
      select,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    if (rows.length === 0 && plan.field === SEARCH_FIELD.mobile && plan.strategy === 'phone_exact') {
      rows = await this.prisma.lead.findMany({
        where: { ...base, primaryPhone: { contains: plan.normalized.slice(-10) } },
        select,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });
    }
    if (
      rows.length === 0 &&
      plan.field === SEARCH_FIELD.leadId &&
      plan.strategy !== 'exact' &&
      /^\d+$/.test(plan.normalized)
    ) {
      rows = await this.prisma.lead.findMany({
        where: { ...base, leadNumber: { contains: plan.normalized } },
        select,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });
    }
    return rows
      .map((row) => {
        const matchedValue =
          plan.field === SEARCH_FIELD.customer
            ? (row.customerName ?? '')
            : plan.field === SEARCH_FIELD.mobile
              ? (row.primaryPhone ?? '')
              : row.id === plan.normalized
                ? row.id
                : row.leadNumber;
        return {
          type: 'lead' as const,
          id: row.id,
          leadId: row.id,
          quotationId: null,
          title: row.customerName?.trim() || row.title,
          subtitle: [row.leadNumber, row.primaryPhone, row.city, row.lifecycleStatus]
            .filter(Boolean)
            .join(' · '),
          leadNumber: row.leadNumber,
          quotationNumber: null,
          customerName: row.customerName,
          primaryPhone: row.primaryPhone,
          status: row.lifecycleStatus,
          matchedBy: plan.field,
          score: scoreHit({
            strategy: plan.strategy,
            matchedValue,
            normalized: plan.normalized,
          }),
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  private leadWhere(base: { tenantId: string; deletedAt: null }, plan: SearchPlan) {
    if (plan.field === SEARCH_FIELD.customer) {
      return { ...base, customerName: { contains: plan.normalized, mode: 'insensitive' as const } };
    }
    if (plan.field === SEARCH_FIELD.mobile && plan.strategy === 'phone_exact') {
      return { ...base, primaryPhone: { in: plan.variants } };
    }
    if (plan.field === SEARCH_FIELD.mobile) {
      return { ...base, primaryPhone: { contains: plan.normalized } };
    }
    if (plan.strategy === 'exact' && plan.normalized.length === 36) {
      return { ...base, id: plan.normalized };
    }
    if (plan.strategy === 'exact') {
      return { ...base, leadNumber: plan.normalized };
    }
    return { ...base, leadNumber: { startsWith: plan.normalized } };
  }

  private async searchQuotations(
    tenantId: string,
    plan: SearchPlan,
    limit: number,
  ): Promise<SearchHit[]> {
    const base = { tenantId, deletedAt: null };
    let rows = await this.prisma.quotation.findMany({
      where:
        plan.strategy === 'exact'
          ? { ...base, quotationNumber: plan.normalized }
          : { ...base, quotationNumber: { startsWith: plan.normalized } },
      select: {
        id: true,
        quotationNumber: true,
        title: true,
        status: true,
        leadId: true,
        lead: { select: { leadNumber: true, customerName: true, title: true, primaryPhone: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    if (rows.length === 0 && /^\d+$/.test(plan.normalized)) {
      rows = await this.prisma.quotation.findMany({
        where: { ...base, quotationNumber: { contains: plan.normalized } },
        select: {
          id: true,
          quotationNumber: true,
          title: true,
          status: true,
          leadId: true,
          lead: { select: { leadNumber: true, customerName: true, title: true, primaryPhone: true } },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });
    }
    return rows
      .map((row) => ({
        type: 'quotation' as const,
        id: row.id,
        leadId: row.leadId,
        quotationId: row.id,
        title: row.title?.trim() || row.quotationNumber,
        subtitle: [row.quotationNumber, row.lead.customerName, row.lead.leadNumber, row.status]
          .filter(Boolean)
          .join(' · '),
        leadNumber: row.lead.leadNumber,
        quotationNumber: row.quotationNumber,
        customerName: row.lead.customerName,
        primaryPhone: row.lead.primaryPhone,
        status: row.status,
        matchedBy: plan.field,
        score: scoreHit({
          strategy: plan.strategy,
          matchedValue: row.quotationNumber,
          normalized: plan.normalized,
        }),
      }))
      .sort((a, b) => b.score - a.score);
  }

  private assertFieldAccess(actor: AuthUser, field: SearchField, explicit: boolean) {
    const need =
      field === SEARCH_FIELD.quotationNumber ? PERMISSION.quotationRead : PERMISSION.leadRead;
    if (this.can(actor, need)) {
      return;
    }
    if (explicit) {
      throw new AppException(HttpStatus.FORBIDDEN, 'Permission denied', {
        code: ErrorCodes.FORBIDDEN,
        detail: `Missing permission: ${need}`,
      });
    }
  }

  private can(actor: AuthUser, permission: string): boolean {
    return AccessPolicy.has(actor.permissions ?? [], permission);
  }

  private async readCache(key: string): Promise<SearchResponse | null> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as SearchResponse;
    } catch {
      return null;
    }
  }

  private async writeCache(key: string, payload: SearchResponse): Promise<void> {
    try {
      await this.redis.setex(key, SEARCH_LIMITS.cacheTtlSeconds, JSON.stringify(payload));
    } catch {
      return;
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
}
