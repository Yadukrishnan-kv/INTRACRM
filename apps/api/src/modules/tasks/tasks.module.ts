import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JobsModule } from '../../jobs/jobs.module';
import { QueueNames } from '../../common/queue/queue.names';
import { ActivitiesModule } from '../activities/activities.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FollowUpEngineProcessor } from './application/follow-up-engine.processor';
import { FollowUpEngineScheduler } from './application/follow-up-engine.scheduler';
import { FollowUpEngineService } from './application/follow-up-engine.service';
import { FollowUpsService } from './application/follow-ups.service';
import { FollowUpsController } from './interface/http/follow-ups.controller';

@Module({
  imports: [
    ActivitiesModule,
    AuditModule,
    NotificationsModule,
    JobsModule,
    BullModule.registerQueue({ name: QueueNames.followUpEngine }),
  ],
  controllers: [FollowUpsController],
  providers: [
    FollowUpsService,
    FollowUpEngineService,
    FollowUpEngineProcessor,
    FollowUpEngineScheduler,
  ],
  exports: [FollowUpsService, FollowUpEngineService],
})
export class TasksModule {}
