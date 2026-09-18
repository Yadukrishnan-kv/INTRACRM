import { Injectable } from '@nestjs/common';
import { AuditActorType, Prisma } from '@prisma/client';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { getRequestContext } from '../../../common/http/request-context';
import { PrismaService } from '../../../prisma/prisma.service';
import { TrackAction, TrackResource } from '../domain/track-events';

type Db = Prisma.TransactionClient | PrismaService;

export type AuditWrite = {
  tenantId: string;
  actor: AuthUser;
  action: TrackAction;
  resourceType: TrackResource;
  resourceId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export function trackPayload(
  summary: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { summary, ...extra };
}

@Injectable()
export class AuditWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditWrite, db: Db = this.prisma) {
    const context = getRequestContext();
    return db.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actor.userId,
        actorType: AuditActorType.user,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        ...(input.before ? { beforeData: input.before as Prisma.InputJsonValue } : {}),
        ...(input.after ? { afterData: input.after as Prisma.InputJsonValue } : {}),
        requestId: context?.requestId ?? null,
        deviceId: context?.deviceId ?? null,
      },
    });
  }
}
