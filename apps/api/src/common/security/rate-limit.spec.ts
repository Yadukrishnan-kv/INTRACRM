import { classifyRateLimit, RATE_LIMIT_CLASS, rateLimitExceeded } from './rate-limit';

describe('rate limit classifier', () => {
  it('skips health and auth login that already have a dedicated limiter', () => {
    expect(classifyRateLimit('GET', '/api/v1/health/live')).toBe(RATE_LIMIT_CLASS.skip);
    expect(classifyRateLimit('POST', '/api/v1/auth/login')).toBe(RATE_LIMIT_CLASS.skip);
    expect(classifyRateLimit('POST', '/api/v1/auth/forgot-password')).toBe(RATE_LIMIT_CLASS.skip);
  });

  it('classifies refresh, writes, reads, and exports', () => {
    expect(classifyRateLimit('POST', '/api/v1/auth/refresh')).toBe(RATE_LIMIT_CLASS.auth);
    expect(classifyRateLimit('POST', '/api/v1/leads')).toBe(RATE_LIMIT_CLASS.write);
    expect(classifyRateLimit('GET', '/api/v1/leads')).toBe(RATE_LIMIT_CLASS.read);
    expect(classifyRateLimit('GET', '/api/v1/reports/tracks/export')).toBe(RATE_LIMIT_CLASS.export);
  });

  it('detects an exceeded window', () => {
    expect(rateLimitExceeded(10, 10)).toBe(false);
    expect(rateLimitExceeded(11, 10)).toBe(true);
  });
});
