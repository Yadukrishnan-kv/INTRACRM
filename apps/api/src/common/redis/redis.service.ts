import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig } from '../config/configuration';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(config: ConfigService<AppConfig, true>) {
    const redis = config.get('redis', { infer: true });
    super({
      host: redis.host,
      port: redis.port,
      db: redis.db,
      ...(redis.password ? { password: redis.password } : {}),
      ...(redis.tls ? { tls: {} } : {}),
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }
}
