import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  labelForTrackAction,
  summarizeTracks,
  TRACK_CATALOG,
  type TrackAction,
  type TrackResource,
} from '../domain/track-events';
import { TrackListQuery, TrackReportQuery } from '../interface/http/dto/track.dto';

type AuditRow = Prisma.AuditLogGetPayload<{
  include: { actor: { select: { id: true; fullName: true } } };
}>;

@Injectable()
export class TracksService {
  constructor(private readonly prisma: PrismaService) {}

  catalog() {
    return {
      actions: TRACK_CATALOG.map((entry) => ({
        action: entry.action,
        name: entry.name,
        description: entry.description,
      })),
    };
  }

  async list(actor: AuthUser, query: TrackListQuery) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const where = this.where(tenantId, query);
    if (query.cursor) {
      try {
        const cursor = decodeCursor(query.cursor);
        const createdAt = cursor.createdAt;
        const id = cursor.id;
        if (!createdAt || !id) {
          throw new Error('Invalid cursor');
        }
        where.OR = [
          { createdAt: { lt: new Date(createdAt) } },
          { createdAt: new Date(createdAt), id: { lt: id } },
        ];
      } catch {
        throw new AppException(HttpStatus.BAD_REQUEST, 'Invalid cursor', {
          code: ErrorCodes.BAD_REQUEST,
          detail: 'The pagination cursor is not valid.',
        });
      }
    }
    const rows = await this.prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, fullName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      data: pageRows.map((row) => this.toView(row)),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
            : null,
      }),
    };
  }

  async report(actor: AuthUser, query: TrackReportQuery) {
    const tenantId = this.requireTenant(actor);
    const rows = await this.prisma.auditLog.findMany({
      where: this.where(tenantId, query),
      include: { actor: { select: { id: true, fullName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5000,
    });
    return summarizeTracks(
      rows.map((row) => ({
        action: row.action,
        resourceType: row.resourceType,
        actorId: row.actorId,
        actorName: row.actor?.fullName ?? null,
        createdAt: row.createdAt,
      })),
    );
  }

  private where(
    tenantId: string,
    query: {
      action?: TrackAction;
      resourceType?: TrackResource;
      resourceId?: string;
      from?: string;
      to?: string;
    },
  ): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = { tenantId };
    if (query.action) {
      where.action = query.action;
    }
    if (query.resourceType) {
      where.resourceType = query.resourceType;
    }
    if (query.resourceId) {
      where.resourceId = query.resourceId;
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      };
    }
    return where;
  }

  private toView(row: AuditRow) {
    const after = asRecord(row.afterData);
    const before = asRecord(row.beforeData);
    return {
      id: row.id,
      action: row.action,
      actionName: labelForTrackAction(row.action),
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      actorId: row.actorId,
      actorName: row.actor?.fullName ?? null,
      actorType: row.actorType,
      summary: stringField(after, 'summary') ?? stringField(before, 'summary'),
      number: stringField(after, 'number') ?? stringField(before, 'number'),
      from: stringField(after, 'from') ?? stringField(before, 'from'),
      to: stringField(after, 'to') ?? stringField(before, 'to'),
      requestId: row.requestId,
      deviceId: row.deviceId,
      createdAt: row.createdAt.toISOString(),
    };
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

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' ? value : null;
}
