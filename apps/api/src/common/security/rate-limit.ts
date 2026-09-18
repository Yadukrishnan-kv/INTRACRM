export const RATE_LIMIT_CLASS = {
  skip: 'skip',
  auth: 'auth',
  export: 'export',
  write: 'write',
  read: 'read',
} as const;

export type RateLimitClass = (typeof RATE_LIMIT_CLASS)[keyof typeof RATE_LIMIT_CLASS];

const AUTH_HANDLED = ['/auth/login', '/auth/forgot-password', '/auth/reset-password'];

export function classifyRateLimit(method: string, path: string): RateLimitClass {
  const normalized = path.split('?')[0]?.toLowerCase() ?? '';
  if (normalized.includes('/health')) {
    return RATE_LIMIT_CLASS.skip;
  }
  if (AUTH_HANDLED.some((prefix) => normalized.includes(prefix))) {
    return RATE_LIMIT_CLASS.skip;
  }
  if (normalized.includes('/auth/')) {
    return RATE_LIMIT_CLASS.auth;
  }
  if (normalized.includes('/export')) {
    return RATE_LIMIT_CLASS.export;
  }
  const verb = method.toUpperCase();
  if (verb === 'POST' || verb === 'PUT' || verb === 'PATCH' || verb === 'DELETE') {
    return RATE_LIMIT_CLASS.write;
  }
  return RATE_LIMIT_CLASS.read;
}

export function rateLimitExceeded(count: number, limit: number): boolean {
  return count > limit;
}
