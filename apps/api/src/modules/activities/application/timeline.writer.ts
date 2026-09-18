import { Injectable } from '@nestjs/common';
import { ActivityType, Prisma } from '@prisma/client';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

export type TimelineWrite = {
  tenantId: string;
  leadId: string;
  actor: AuthUser;
  eventCode: string;
  subject: string;
  body?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  type?: ActivityType;
};

@Injectable()
export class TimelineWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: TimelineWrite, db: Db = this.prisma) {
    const now = new Date();
    const activity = await db.leadActivity.create({
      data: {
        tenantId: input.tenantId,
        leadId: input.leadId,
        type: input.type ?? ActivityType.system,
        eventCode: input.eventCode,
        subject: input.subject,
        body: input.body ?? null,
        metadata: input.metadata ?? {},
        performedByMembershipId: input.actor.membershipId ?? null,
        createdBy: input.actor.userId,
        updatedBy: input.actor.userId,
      },
    });
    await db.lead.update({
      where: { id: input.leadId },
      data: { lastActivityAt: now },
    });
    return activity;
  }
}
