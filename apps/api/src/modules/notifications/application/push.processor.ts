import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PinoLogger } from '../../../common/logging/pino-logger';
import { QueueNames } from '../../../common/queue/queue.names';
import { PrismaService } from '../../../prisma/prisma.service';
import { FcmGateway } from './fcm.gateway';
import { PushDispatchJob } from './notification.writer';

@Processor(QueueNames.notifications)
export class PushNotificationProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmGateway,
    private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job<PushDispatchJob>): Promise<{ sent: number; failed: number }> {
    const payload = job.data;
    if (!this.fcm.isConfigured) {
      this.logger.log('FCM is not configured; skip push dispatch');
      return { sent: 0, failed: 0 };
    }
    const tokens = await this.prisma.devicePushToken.findMany({
      where: {
        userId: payload.userId,
        revokedAt: null,
        ...(payload.tenantId ? { OR: [{ tenantId: payload.tenantId }, { tenantId: null }] } : {}),
      },
    });
    const liveTokens = [...new Set(tokens.map((row) => row.token).filter((token) => token.length > 0))];
    if (liveTokens.length === 0) {
      return { sent: 0, failed: 0 };
    }
    const result = await this.fcm.send({
      tokens: liveTokens,
      title: payload.title,
      body: payload.body,
      eventType: payload.eventType,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId,
      notificationId: payload.notificationId,
    });
    if (result.invalidTokens.length > 0) {
      await this.prisma.devicePushToken.updateMany({
        where: { token: { in: result.invalidTokens }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    this.logger.log(
      `FCM dispatch user=${payload.userId} event=${payload.eventType} sent=${result.successCount} failed=${result.failureCount}`,
    );
    return { sent: result.successCount, failed: result.failureCount };
  }
}
