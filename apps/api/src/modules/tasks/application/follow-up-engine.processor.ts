import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PinoLogger } from '../../../common/logging/pino-logger';
import { QueueNames } from '../../../common/queue/queue.names';
import { FollowUpEngineService } from './follow-up-engine.service';

@Processor(QueueNames.followUpEngine)
export class FollowUpEngineProcessor extends WorkerHost {
  constructor(
    private readonly engine: FollowUpEngineService,
    private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(_job: Job): Promise<{ tenants: number; notified: number }> {
    const result = await this.engine.tick();
    this.logger.log(
      `Follow-up engine tick tenants=${result.tenants} notified=${result.notified}`,
    );
    return result;
  }
}
