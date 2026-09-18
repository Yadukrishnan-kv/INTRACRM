import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { QueueNames } from '../../../common/queue/queue.names';
import { PrismaService } from '../../../prisma/prisma.service';
import { channelsEnabled } from '../domain/notification-events';

export type NotificationWrite = {
  tenantId: string;
  userId: string;
  eventType: string;
  title: string;
  body: string;
  resourceType: string;
  resourceId: string;
  payload?: Record<string, string | number | boolean | null>;
};

export type PushDispatchJob = {
  tenantId: string;
  userId: string;
  eventType: string;
  title: string;
  body: string;
  resourceType: string;
  resourceId: string;
  notificationId: string | null;
};

@Injectable()
export class NotificationWriter {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QueueNames.notifications) private readonly queue: Queue,
  ) {}

  async notifyInApp(input: NotificationWrite) {
    return this.notify(input);
  }

  async notify(input: NotificationWrite) {
    const preference = await this.prisma.notificationPreference.findFirst({
      where: {
        tenantId: input.tenantId,
        userId: input.userId,
        eventType: input.eventType,
        deletedAt: null,
      },
    });
    const channels = channelsEnabled(preference);
    if (!channels.inApp && !channels.push) {
      return null;
    }
    const now = new Date();
    const row = channels.inApp
      ? await this.prisma.notification.create({
          data: {
            tenantId: input.tenantId,
            userId: input.userId,
            eventType: input.eventType,
            title: input.title,
            body: input.body,
            resourceType: input.resourceType,
            resourceId: input.resourceId,
            channel: NotificationChannel.in_app,
            status: NotificationStatus.sent,
            sentAt: now,
            payload: input.payload ?? {},
          },
        })
      : null;
    if (channels.push) {
      const job: PushDispatchJob = {
        tenantId: input.tenantId,
        userId: input.userId,
        eventType: input.eventType,
        title: input.title,
        body: input.body,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        notificationId: row?.id ?? null,
      };
      await this.queue.add('send-push', job, {
        removeOnComplete: 100,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      });
    }
    return row;
  }
}
