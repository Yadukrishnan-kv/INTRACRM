import { AppEnv } from './env.schema';

export type AppConfig = {
  env: AppEnv['NODE_ENV'];
  name: string;
  port: number;
  url: string;
  apiPrefix: string;
  log: {
    level: AppEnv['LOG_LEVEL'];
    pretty: boolean;
  };
  databaseUrl: string;
  redis: {
    host: string;
    port: number;
    password: string;
    db: number;
    tls: boolean;
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
    sessionIdleTtlSeconds: number;
  };
  authEchoOtp: boolean;
  corsOrigins: string[];
  swaggerEnabled: boolean;
  seedEnabled: boolean;
  storageRoot: string;
  rateLimit: {
    enabled: boolean;
    windowSeconds: number;
    read: number;
    write: number;
    export: number;
    auth: number;
  };
  fcm: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
  } | null;
  comms: {
    callProvider: 'device' | 'twilio';
    smsProvider: 'device' | 'twilio';
    whatsappProvider: 'device' | 'meta';
    twilio: {
      accountSid: string;
      authToken: string;
      fromNumber: string;
    } | null;
    metaWhatsapp: {
      token: string;
      phoneNumberId: string;
    } | null;
  };
  billing: {
    provider: 'manual' | 'http';
    apiBaseUrl: string | null;
    apiToken: string | null;
    webhookSecret: string | null;
  };
};

export function buildConfiguration(env: AppEnv): AppConfig {
  return {
    env: env.NODE_ENV,
    name: env.APP_NAME,
    port: env.APP_PORT,
    url: env.APP_URL,
    apiPrefix: env.API_PREFIX,
    log: {
      level: env.LOG_LEVEL,
      pretty: env.LOG_PRETTY,
    },
    databaseUrl: env.DATABASE_URL,
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      tls: env.REDIS_TLS,
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
      refreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
      sessionIdleTtlSeconds: env.SESSION_IDLE_TTL_SECONDS,
    },
    authEchoOtp: env.AUTH_ECHO_OTP,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    swaggerEnabled: env.SWAGGER_ENABLED,
    seedEnabled: env.SEED_ENABLED,
    storageRoot: env.STORAGE_ROOT,
    rateLimit: {
      enabled: env.RATE_LIMIT_ENABLED,
      windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
      read: env.RATE_LIMIT_READ,
      write: env.RATE_LIMIT_WRITE,
      export: env.RATE_LIMIT_EXPORT,
      auth: env.RATE_LIMIT_AUTH,
    },
    fcm:
      env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY
        ? {
            projectId: env.FCM_PROJECT_ID,
            clientEmail: env.FCM_CLIENT_EMAIL,
            privateKey: env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }
        : null,
    comms: {
      callProvider: env.COMMS_CALL_PROVIDER,
      smsProvider: env.COMMS_SMS_PROVIDER,
      whatsappProvider: env.COMMS_WHATSAPP_PROVIDER,
      twilio:
        env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER
          ? {
              accountSid: env.TWILIO_ACCOUNT_SID,
              authToken: env.TWILIO_AUTH_TOKEN,
              fromNumber: env.TWILIO_FROM_NUMBER,
            }
          : null,
      metaWhatsapp:
        env.META_WHATSAPP_TOKEN && env.META_WHATSAPP_PHONE_NUMBER_ID
          ? {
              token: env.META_WHATSAPP_TOKEN,
              phoneNumberId: env.META_WHATSAPP_PHONE_NUMBER_ID,
            }
          : null,
    },
    billing: {
      provider: env.BILLING_PROVIDER,
      apiBaseUrl: env.BILLING_API_BASE_URL || null,
      apiToken: env.BILLING_API_TOKEN || null,
      webhookSecret: env.BILLING_WEBHOOK_SECRET || null,
    },
  };
}

export const CONFIG = 'CONFIG';
