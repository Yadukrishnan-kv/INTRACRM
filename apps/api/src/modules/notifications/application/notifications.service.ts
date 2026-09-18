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
import { NOTIFICATION_CATALOG } from '../domain/notification-events';
import { UpdateNotificationPreferenceRequest } from '../interface/http/dto/notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  catalog() {
    return {
      events: NOTIFICATION_CATALOG.map((entry) => ({
        eventType: entry.code,
        name: entry.name,
        description: entry.description,
        resourceType: entry.resourceType,
      })),
    };
  }

  async list(actor: AuthUser, query: { cursor?: string; limit?: number }) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const where: Prisma.NotificationWhereInput = {
      tenantId,
      userId: actor.userId,
      deletedAt: null,
    };
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
    const rows = await this.prisma.notification.findMany({
      where,
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

  async markRead(actor: AuthUser, notificationId: string) {
    const tenantId = this.requireTenant(actor);
    const row = await this.prisma.notification.findFirst({
      where: { id: notificationId, tenantId, userId: actor.userId, deletedAt: null },
    });
    if (!row) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Notification not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    if (row.readAt) {
      return this.toView(row);
    }
    const updated = await this.prisma.notification.update({
      where: { id_createdAt: { id: row.id, createdAt: row.createdAt } },
      data: { readAt: new Date(), updatedBy: actor.userId, version: { increment: 1 } },
    });
    return this.toView(updated);
  }

  async listPreferences(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    const rows = await this.prisma.notificationPreference.findMany({
      where: { tenantId, userId: actor.userId, deletedAt: null },
    });
    const byEvent = new Map(rows.map((row) => [row.eventType, row]));
    return {
      data: NOTIFICATION_CATALOG.map((entry) => {
        const row = byEvent.get(entry.code);
        return {
          eventType: entry.code,
          name: entry.name,
          description: entry.description,
          resourceType: entry.resourceType,
          inAppEnabled: row?.inAppEnabled ?? true,
          pushEnabled: row?.pushEnabled ?? true,
        };
      }),
    };
  }

  async upsertPreference(actor: AuthUser, dto: UpdateNotificationPreferenceRequest) {
    const tenantId = this.requireTenant(actor);
    const existing = await this.prisma.notificationPreference.findFirst({
      where: {
        tenantId,
        userId: actor.userId,
        eventType: dto.eventType,
        deletedAt: null,
      },
    });
    const row = existing
      ? await this.prisma.notificationPreference.update({
          where: { id: existing.id },
          data: {
            inAppEnabled: dto.inAppEnabled ?? existing.inAppEnabled,
            pushEnabled: dto.pushEnabled ?? existing.pushEnabled,
            updatedBy: actor.userId,
            version: { increment: 1 },
          },
        })
      : await this.prisma.notificationPreference.create({
          data: {
            tenantId,
            userId: actor.userId,
            eventType: dto.eventType,
            inAppEnabled: dto.inAppEnabled ?? true,
            pushEnabled: dto.pushEnabled ?? true,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
    const entry = NOTIFICATION_CATALOG.find((item) => item.code === row.eventType);
    return {
      eventType: row.eventType,
      name: entry?.name ?? row.eventType,
      description: entry?.description ?? '',
      resourceType: entry?.resourceType ?? null,
      inAppEnabled: row.inAppEnabled,
      pushEnabled: row.pushEnabled,
    };
  }

  private toView(row: {
    id: string;
    eventType: string;
    title: string;
    body: string | null;
    resourceType: string | null;
    resourceId: string | null;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      eventType: row.eventType,
      title: row.title,
      body: row.body,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      readAt: row.readAt?.toISOString() ?? null,
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
