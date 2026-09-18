import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueNames } from '../../common/queue/queue.names';
import { JobsModule } from '../../jobs/jobs.module';
import { FcmGateway } from './application/fcm.gateway';
import { NotificationWriter } from './application/notification.writer';
import { NotificationsService } from './application/notifications.service';
import { PushNotificationProcessor } from './application/push.processor';
import { PushTokensService } from './application/push-tokens.service';
import { NotificationsController } from './interface/http/notifications.controller';

@Module({
  imports: [JobsModule, BullModule.registerQueue({ name: QueueNames.notifications })],
  controllers: [NotificationsController],
  providers: [
    NotificationWriter,
    NotificationsService,
    PushTokensService,
    FcmGateway,
    PushNotificationProcessor,
  ],
  exports: [NotificationWriter, PushTokensService],
})
export class NotificationsModule {}
