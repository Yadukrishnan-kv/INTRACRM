import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { BillingGateway } from './application/billing.gateway';
import { BillingService } from './application/billing.service';
import { CustomerSyncService } from './application/customer-sync.service';
import { InvoiceSyncService } from './application/invoice-sync.service';
import { PaymentStatusService } from './application/payment-status.service';
import { BillingController } from './interface/http/billing.controller';
import { BillingWebhookController } from './interface/http/billing-webhook.controller';

@Module({
  imports: [ActivitiesModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [
    BillingGateway,
    CustomerSyncService,
    InvoiceSyncService,
    PaymentStatusService,
    BillingService,
  ],
  exports: [BillingService],
})
export class BillingModule {}
