import { PasswordHasher } from './password.hasher';
import { TokenHasher } from './token.hasher';
import { AuthRateLimiter } from './auth.rate-limiter';
import { jwtConfig } from '../../../testing/fixtures';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { requestMeta } from '../interface/http/request-meta';
import { createRequest } from '../../../testing/http-context';

describe('PasswordHasher', () => {
  it('hashes and verifies argon2id passwords', async () => {
    const hasher = new PasswordHasher();
    const hash = await hasher.hash('CorrectHorse1');
    await expect(hasher.verify(hash, 'CorrectHorse1')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'wrong-password')).resolves.toBe(false);
  });
});

describe('TokenHasher', () => {
  const hasher = new TokenHasher({
    get: () => jwtConfig(),
  } as never);

  it('hashes, hmacs, and generates refresh/otp values', () => {
    expect(hasher.hash('abc')).toHaveLength(64);
    expect(hasher.hmac('abc')).toHaveLength(64);
    expect(hasher.refreshToken().length).toBeGreaterThan(20);
    expect(hasher.otpCode()).toMatch(/^\d{6}$/);
  });
});

describe('AuthRateLimiter', () => {
  it('passes through allowed hits and throws when limited', async () => {
    const limiter = {
      hit: jest
        .fn()
        .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
        .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 30 }),
    };
    const auth = new AuthRateLimiter(limiter as never);
    await expect(auth.consume('login:1', 10)).resolves.toBeUndefined();
    await expect(auth.consume('login:1', 10)).rejects.toMatchObject({
      code: ErrorCodes.RATE_LIMITED,
    });
  });
});

describe('requestMeta', () => {
  it('prefers x-forwarded-for and trims device id', () => {
    const meta = requestMeta(
      createRequest({
        headers: {
          'x-forwarded-for': ' 10.0.0.8, 10.0.0.1',
          'user-agent': 'jest',
          'x-device-id': ' device-1 ',
        },
      }),
    );
    expect(meta).toEqual({ ip: '10.0.0.8', userAgent: 'jest', deviceId: 'device-1' });
  });
});
