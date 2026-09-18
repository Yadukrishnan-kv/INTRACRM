import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  APP_NAME: z.string().min(1).default('intra-leads-api'),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_PREFIX: z.string().min(1).default('api/v1'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  LOG_PRETTY: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  DATABASE_URL: z.string().min(1),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  REDIS_TLS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  SESSION_IDLE_TTL_SECONDS: z.coerce.number().int().positive().default(43_200),
  AUTH_ECHO_OTP: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:4173'),
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  SEED_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  STORAGE_ROOT: z.string().min(1).default('uploads'),
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_READ: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WRITE: z.coerce.number().int().positive().default(40),
  RATE_LIMIT_EXPORT: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_AUTH: z.coerce.number().int().positive().default(30),
  FCM_PROJECT_ID: z.string().optional().default(''),
  FCM_CLIENT_EMAIL: z.string().optional().default(''),
  FCM_PRIVATE_KEY: z.string().optional().default(''),
  COMMS_CALL_PROVIDER: z.enum(['device', 'twilio']).default('device'),
  COMMS_SMS_PROVIDER: z.enum(['device', 'twilio']).default('device'),
  COMMS_WHATSAPP_PROVIDER: z.enum(['device', 'meta']).default('device'),
  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),
  TWILIO_FROM_NUMBER: z.string().optional().default(''),
  META_WHATSAPP_TOKEN: z.string().optional().default(''),
  META_WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  BILLING_PROVIDER: z.enum(['manual', 'http']).default('manual'),
  BILLING_API_BASE_URL: z.string().optional().default(''),
  BILLING_API_TOKEN: z.string().optional().default(''),
  BILLING_WEBHOOK_SECRET: z.string().optional().default(''),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}
