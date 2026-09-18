import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../common/config/configuration';
import { QueueNames } from '../common/queue/queue.names';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const redis = config.get('redis', { infer: true });
        return {
          connection: {
            host: redis.host,
            port: redis.port,
            db: redis.db,
            ...(redis.password ? { password: redis.password } : {}),
            ...(redis.tls ? { tls: {} } : {}),
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QueueNames.notifications },
      { name: QueueNames.exports },
      { name: QueueNames.files },
      { name: QueueNames.outboxRelay },
      { name: QueueNames.followUpEngine },
      { name: QueueNames.quotationFollowUpEngine },
    ),
  ],
  exports: [BullModule],
})
export class JobsModule {}
