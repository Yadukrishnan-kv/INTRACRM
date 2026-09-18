import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AppConfig } from '../config/configuration';
import { AppException } from '../exceptions/app.exception';
import { ErrorCodes } from '../exceptions/error-codes';
import { AuthUser } from '../auth/current-user.decorator';
import { classifyRateLimit, RATE_LIMIT_CLASS, RateLimitClass } from './rate-limit';
import { RateLimiterService } from './rate-limiter.service';
import { SKIP_RATE_LIMIT_KEY } from './skip-rate-limit.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiterService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipped = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipped) {
      return true;
    }
    const limits = this.config.get('rateLimit', { infer: true });
    if (!limits.enabled) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const path = request.originalUrl.split('?')[0] ?? request.path;
    const klass = classifyRateLimit(request.method, path);
    if (klass === RATE_LIMIT_CLASS.skip) {
      return true;
    }
    const { limit, windowSeconds } = this.budget(klass, limits);
    const identity = request.user?.userId
      ? `user:${request.user.userId}`
      : `ip:${this.clientIp(request)}`;
    const hit = await this.limiter.hit(`${klass}:${identity}`, limit, windowSeconds);
    if (hit.allowed) {
      return true;
    }
    throw new AppException(HttpStatus.TOO_MANY_REQUESTS, 'Too many requests', {
      code: ErrorCodes.RATE_LIMITED,
      detail: 'Rate limit exceeded. Try again later.',
      retryAfterSeconds: hit.retryAfterSeconds,
    });
  }

  private budget(
    klass: RateLimitClass,
    limits: AppConfig['rateLimit'],
  ): { limit: number; windowSeconds: number } {
    switch (klass) {
      case RATE_LIMIT_CLASS.auth:
        return { limit: limits.auth, windowSeconds: limits.windowSeconds };
      case RATE_LIMIT_CLASS.export:
        return { limit: limits.export, windowSeconds: limits.windowSeconds };
      case RATE_LIMIT_CLASS.write:
        return { limit: limits.write, windowSeconds: limits.windowSeconds };
      default:
        return { limit: limits.read, windowSeconds: limits.windowSeconds };
    }
  }

  private clientIp(request: Request): string {
    const forwarded = request.header('x-forwarded-for');
    return forwarded?.split(',')[0]?.trim() || request.ip || 'unknown';
  }
}
