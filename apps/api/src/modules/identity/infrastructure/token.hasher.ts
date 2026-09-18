import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../common/config/configuration';

@Injectable()
export class TokenHasher {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  hmac(value: string): string {
    const secret = this.config.get('jwt', { infer: true }).refreshSecret;
    return createHmac('sha256', secret).update(value).digest('hex');
  }

  refreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  otpCode(): string {
    return randomInt(100000, 1000000).toString();
  }
}
