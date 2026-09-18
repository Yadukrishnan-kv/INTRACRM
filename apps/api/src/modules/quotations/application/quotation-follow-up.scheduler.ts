import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QueueNames } from '../../../common/queue/queue.names';

@Injectable()
export class QuotationFollowUpScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(QueueNames.quotationFollowUpEngine) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'quotation-follow-up-engine',
      { every: 15 * 60 * 1000 },
      { name: 'tick', data: {} },
    );
  }
}
