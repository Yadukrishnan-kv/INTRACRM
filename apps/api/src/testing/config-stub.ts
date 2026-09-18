import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../common/config/configuration';
import { jwtConfig, rateLimitConfig } from './fixtures';

export function configStub(overrides: Partial<AppConfig> = {}): ConfigService<AppConfig, true> {
  const value: AppConfig = {
    env: 'test',
    name: 'intra-leads-api',
    port: 3000,
    url: 'http://localhost:3000',
    apiPrefix: 'api/v1',
    log: { level: 'silent', pretty: false },
    databaseUrl: 'postgresql://intra:intra@localhost:5432/intra_leads',
    redis: { host: 'localhost', port: 6379, password: '', db: 0, tls: false },
    jwt: jwtConfig(),
    authEchoOtp: false,
    corsOrigins: ['http://localhost:3000'],
    swaggerEnabled: false,
    seedEnabled: false,
    storageRoot: 'uploads',
    rateLimit: rateLimitConfig(),
    fcm: null,
    comms: {
      callProvider: 'device',
      smsProvider: 'device',
      whatsappProvider: 'device',
      twilio: null,
      metaWhatsapp: null,
    },
    billing: {
      provider: 'manual',
      apiBaseUrl: null,
      apiToken: null,
      webhookSecret: 'webhook-secret-16',
    },
    ...overrides,
  };
  return {
    get: jest.fn((_key: keyof AppConfig) => {
      const key = _key as keyof AppConfig;
      return value[key];
    }),
  } as unknown as ConfigService<AppConfig, true>;
}
