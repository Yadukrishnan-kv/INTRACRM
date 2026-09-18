import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueNames } from '../../common/queue/queue.names';
import { JobsModule } from '../../jobs/jobs.module';
import { ActivitiesModule } from '../activities/activities.module';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QuotationFollowUpProcessor } from './application/quotation-follow-up.processor';
import { QuotationFollowUpScheduler } from './application/quotation-follow-up.scheduler';
import { QuotationFollowUpService } from './application/quotation-follow-up.service';
import { QuotationsService } from './application/quotations.service';
import { LeadQuotationsController } from './interface/http/lead-quotations.controller';
import { QuotationsController } from './interface/http/quotations.controller';

@Module({
  imports: [
    ActivitiesModule,
    AuditModule,
    BillingModule,
    NotificationsModule,
    JobsModule,
    BullModule.registerQueue({ name: QueueNames.quotationFollowUpEngine }),
  ],
  controllers: [QuotationsController, LeadQuotationsController],
  providers: [
    QuotationsService,
    QuotationFollowUpService,
    QuotationFollowUpProcessor,
    QuotationFollowUpScheduler,
  ],
  exports: [QuotationsService, QuotationFollowUpService],
})
export class QuotationsModule {}
