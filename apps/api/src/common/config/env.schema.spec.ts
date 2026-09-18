import { validateEnv } from './env.schema';
import { buildConfiguration } from './configuration';

const base = {
  DATABASE_URL: 'postgresql://intra:intra@localhost:5432/intra_leads',
  JWT_ACCESS_SECRET: 'access-secret-16',
  JWT_REFRESH_SECRET: 'refresh-secret-16',
};

describe('validateEnv', () => {
  it('applies defaults and parses booleans', () => {
    const env = validateEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.REDIS_TLS).toBe(false);
    expect(env.APP_PORT).toBe(3000);
  });

  it('rejects a short JWT secret', () => {
    expect(() =>
      validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('enables Redis TLS and FCM when fully configured', () => {
    const env = validateEnv({
      ...base,
      NODE_ENV: 'production',
      REDIS_TLS: 'true',
      FCM_PROJECT_ID: 'p',
      FCM_CLIENT_EMAIL: 'a@b.c',
      FCM_PRIVATE_KEY: '-----BEGIN\\nKEY-----',
      BILLING_PROVIDER: 'http',
      BILLING_API_BASE_URL: 'https://billing.example',
      BILLING_API_TOKEN: 'tok',
      BILLING_WEBHOOK_SECRET: 'secret',
    });
    const config = buildConfiguration(env);
    expect(config.redis.tls).toBe(true);
    expect(config.fcm?.projectId).toBe('p');
    expect(config.billing.provider).toBe('http');
    expect(config.env).toBe('production');
  });

  it('splits CORS origins', () => {
    const config = buildConfiguration(
      validateEnv({ ...base, CORS_ORIGINS: 'http://a.test, http://b.test' }),
    );
    expect(config.corsOrigins).toEqual(['http://a.test', 'http://b.test']);
  });
});
