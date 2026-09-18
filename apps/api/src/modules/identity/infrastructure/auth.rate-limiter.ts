import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { AUTH_POLICY } from '../domain/password.policy';
import { RateLimiterService } from '../../../common/security/rate-limiter.service';

@Injectable()
export class AuthRateLimiter {
  constructor(private readonly limiter: RateLimiterService) {}

  async consume(key: string, limit: number): Promise<void> {
    const hit = await this.limiter.hit(`auth:${key}`, limit, AUTH_POLICY.rateWindowSeconds);
    if (hit.allowed) {
      return;
    }
    throw new AppException(HttpStatus.TOO_MANY_REQUESTS, 'Too many attempts', {
      code: ErrorCodes.RATE_LIMITED,
      detail: 'Too many authentication attempts. Try again later.',
      retryAfterSeconds: hit.retryAfterSeconds,
    });
  }
}
