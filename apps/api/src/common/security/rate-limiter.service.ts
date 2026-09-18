import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { rateLimitExceeded } from './rate-limit';

export type RateLimitHit = {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
};

@Injectable()
export class RateLimiterService {
  constructor(private readonly redis: RedisService) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitHit> {
    const redisKey = `rl:${key}`;
    try {
      const count = await this.redis.incr(redisKey);
      if (count === 1) {
        await this.redis.expire(redisKey, windowSeconds);
      }
      if (!rateLimitExceeded(count, limit)) {
        return { allowed: true, count, limit, retryAfterSeconds: 0 };
      }
      const ttl = await this.redis.ttl(redisKey);
      return {
        allowed: false,
        count,
        limit,
        retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
      };
    } catch {
      return { allowed: true, count: 0, limit, retryAfterSeconds: 0 };
    }
  }
}
