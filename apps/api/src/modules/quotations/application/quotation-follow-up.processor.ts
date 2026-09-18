import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PinoLogger } from '../../../common/logging/pino-logger';
import { QueueNames } from '../../../common/queue/queue.names';
import { QuotationFollowUpService } from './quotation-follow-up.service';

@Processor(QueueNames.quotationFollowUpEngine)
export class QuotationFollowUpProcessor extends WorkerHost {
  constructor(
    private readonly engine: QuotationFollowUpService,
    private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(_job: Job): Promise<{ tenants: number; notified: number }> {
    const result = await this.engine.tick();
    this.logger.log(
      `Quotation follow-up tick tenants=${result.tenants} notified=${result.notified}`,
    );
    return result;
  }
}
