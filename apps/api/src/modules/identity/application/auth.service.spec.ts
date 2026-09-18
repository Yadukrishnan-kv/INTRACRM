import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { actor } from '../../../testing/fixtures';
import { configStub } from '../../../testing/config-stub';
import { createPrismaMock } from '../../../testing/prisma-mock';
import { AuthService } from './auth.service';
import { LoginRequest } from '../interface/http/dto/auth.dto';

function buildAuth(prisma: ReturnType<typeof createPrismaMock>) {
  const jwt = { signAsync: jest.fn().mockResolvedValue('access.jwt') };
  const passwords = {
    verify: jest.fn().mockResolvedValue(true),
    hash: jest.fn().mockResolvedValue('hashed'),
  };
  const tokens = {
    hash: jest.fn((value: string) => `hash:${value}`),
    hmac: jest.fn((value: string) => `hmac:${value}`),
    refreshToken: jest.fn().mockReturnValue('refresh-token-value-123456'),
    otpCode: jest.fn().mockReturnValue('123456'),
  };
  const rateLimiter = { consume: jest.fn().mockResolvedValue(undefined) };
  const rbac = {
    resolve: jest.fn().mockResolvedValue({
      membershipId: 'm1',
      roles: ['tenant.founder'],
      permissions: ['lead:read'],
    }),
  };
  const pushTokens = { revokeAllForUser: jest.fn().mockResolvedValue(undefined) };
  const service = new AuthService(
    prisma as never,
    jwt as never,
    passwords as never,
    tokens as never,
    rateLimiter as never,
    configStub() as never,
    rbac as never,
    pushTokens as never,
  );
  return { service, jwt, passwords, tokens, rateLimiter, rbac, pushTokens };
}

const loginDto: LoginRequest = {
  email: 'founder@intraleads.local',
  password: 'CorrectHorse1',
  deviceId: 'device-alpha-01',
};

describe('AuthService', () => {
  const prisma = createPrismaMock();
  const { service, passwords, tokens, pushTokens } = buildAuth(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    passwords.verify.mockResolvedValue(true);
    tokens.hash.mockImplementation((value: string) => `hash:${value}`);
    tokens.hmac.mockImplementation((value: string) => `hmac:${value}`);
  });

  it('rejects unknown, disabled, locked, and bad passwords', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.login(loginDto, { ip: '1.1.1.1' })).rejects.toMatchObject({
      code: ErrorCodes.INVALID_CREDENTIALS,
    });

    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 'u1',
      status: 'disabled',
      email: loginDto.email,
      credential: { passwordHash: 'x', lockedUntil: null },
      memberships: [],
    });
    await expect(service.login(loginDto, {})).rejects.toMatchObject({
      code: ErrorCodes.FORBIDDEN,
    });

    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 'u1',
      status: 'locked',
      email: loginDto.email,
      credential: { passwordHash: 'x', lockedUntil: null },
      memberships: [],
    });
    await expect(service.login(loginDto, {})).rejects.toMatchObject({
      code: ErrorCodes.ACCOUNT_LOCKED,
    });

    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 'u1',
      status: 'active',
      email: loginDto.email,
      credential: { passwordHash: 'x', lockedUntil: new Date(Date.now() + 60_000) },
      memberships: [],
    });
    await expect(service.login(loginDto, {})).rejects.toMatchObject({
      code: ErrorCodes.ACCOUNT_LOCKED,
    });

    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 'u1',
      status: 'active',
      email: loginDto.email,
      fullName: 'Founder',
      credential: { passwordHash: 'x', lockedUntil: null },
      memberships: [{ tenant: { id: actor().tenantId, name: 'A', deletedAt: null }, deletedAt: null, status: 'active' }],
    });
    passwords.verify.mockResolvedValueOnce(false);
    (prisma.userCredential.update as jest.Mock).mockResolvedValue({ failedAttempts: 1 });
    await expect(service.login(loginDto, {})).rejects.toMatchObject({
      code: ErrorCodes.INVALID_CREDENTIALS,
    });
  });

  it('rejects a user with no tenant or the wrong tenant', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 'u1',
      status: 'active',
      email: loginDto.email,
      fullName: 'Founder',
      credential: { passwordHash: 'x', lockedUntil: null },
      memberships: [],
    });
    await expect(service.login(loginDto, {})).rejects.toMatchObject({
      code: ErrorCodes.FORBIDDEN,
    });

    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 'u1',
      status: 'active',
      email: loginDto.email,
      fullName: 'Founder',
      credential: { passwordHash: 'x', lockedUntil: null },
      memberships: [{ tenant: { id: actor().tenantId, name: 'A', deletedAt: null }, deletedAt: null, status: 'active' }],
    });
    await expect(
      service.login({ ...loginDto, tenantId: '99999999-9999-4999-8999-999999999999' }, {}),
    ).rejects.toMatchObject({ code: ErrorCodes.TENANT_MISMATCH });
  });

  it('rejects invalid, reused, and expired refresh tokens', async () => {
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      service.refresh({ refreshToken: 'refresh-token-value-123456' }),
    ).rejects.toMatchObject({ code: ErrorCodes.UNAUTHORIZED });

    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'rt',
      familyId: 'fam',
      revokedAt: new Date(),
      replacedBy: 'next',
      expiresAt: new Date(Date.now() + 1000),
    });
    (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([]);
    await expect(
      service.refresh({ refreshToken: 'refresh-token-value-123456' }),
    ).rejects.toMatchObject({ code: ErrorCodes.REFRESH_REUSE });

    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'rt',
      familyId: 'fam',
      revokedAt: null,
      replacedBy: null,
      expiresAt: new Date(Date.now() - 1000),
      authSession: { status: 'active', deviceId: 'device-alpha-01', user: { memberships: [] } },
    });
    await expect(
      service.refresh({ refreshToken: 'refresh-token-value-123456' }),
    ).rejects.toMatchObject({ code: ErrorCodes.SESSION_EXPIRED });
  });

  it('revokes the current session on logout', async () => {
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.authSession.findUnique as jest.Mock).mockResolvedValue({
      id: actor().sessionId,
      userId: actor().userId,
      status: 'active',
    });
    (prisma.authSession.update as jest.Mock).mockResolvedValue({});
    (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({});
    await expect(service.logout(actor())).resolves.toEqual({ revoked: true });
    expect(pushTokens.revokeAllForUser).toHaveBeenCalledWith(actor().userId);

    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'rt',
      userId: actor().userId,
      familyId: 'fam',
    });
    (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([{ sessionId: actor().sessionId }]);
    await expect(service.logout(actor(), 'refresh-token-value-123456')).resolves.toEqual({ revoked: true });
  });

  it('accepts forgot-password even for unknown emails', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.forgotPassword({ email: 'nobody@x.test' }, { ip: '1.1.1.1' }),
    ).resolves.toEqual({ accepted: true });
  });

  it('rejects reset-password when the policy or OTP fails', async () => {
    await expect(
      service.resetPassword({
        email: 'a@b.c',
        otp: '123456',
        newPassword: 'short',
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.PASSWORD_POLICY });

    (prisma.otpChallenge.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.resetPassword({
        email: 'a@b.c',
        otp: '123456',
        newPassword: 'CorrectHorse1',
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.OTP_INVALID });
  });

  it('logs in, returns me, lists sessions, and changes password', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 'u1',
      status: 'active',
      email: loginDto.email,
      fullName: 'Founder',
      credential: { passwordHash: 'x', lockedUntil: null },
      memberships: [{ tenant: { id: actor().tenantId, name: 'A', deletedAt: null }, deletedAt: null, status: 'active' }],
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      fullName: 'Founder',
      email: loginDto.email,
      status: 'active',
      memberships: [{ tenant: { id: actor().tenantId, name: 'A' } }],
    });
    (prisma.authSession.create as jest.Mock).mockResolvedValue({ id: 'sess-1' });
    const tokens = await service.login(loginDto, { ip: '1.1.1.1', userAgent: 'jest' });
    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.accessToken).toBe('access.jwt');

    await expect(service.me(actor())).resolves.toMatchObject({ email: loginDto.email });

    (prisma.authSession.findMany as jest.Mock).mockResolvedValue([
      {
        id: actor().sessionId,
        deviceId: 'device-alpha-01',
        deviceName: 'Pixel',
        ipAddress: '1.1.1.1',
        userAgent: 'jest',
        status: 'active',
        lastSeenAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const sessions = await service.listSessions(actor());
    expect(sessions[0]?.isCurrent).toBe(true);

    (prisma.loginHistory.findMany as jest.Mock).mockResolvedValue([
      { id: 'h1', result: 'success', deviceName: null, ipAddress: '1.1.1.1', createdAt: new Date(), failureReason: null },
    ]);
    await expect(service.loginHistory(actor())).resolves.toHaveLength(1);

    (prisma.userCredential.findUnique as jest.Mock).mockResolvedValue({ passwordHash: 'x' });
    await expect(
      service.changePassword(actor(), { currentPassword: 'CorrectHorse1', newPassword: 'CorrectHorse2' }),
    ).resolves.toEqual({ changed: true });

    (prisma.otpChallenge.findFirst as jest.Mock).mockResolvedValue({
      id: 'otp-1',
      userId: 'u1',
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      maxAttempts: 5,
      codeHash: 'hmac:123456',
    });
    await expect(
      service.resetPassword({
        email: 'a@b.c',
        otp: '123456',
        newPassword: 'CorrectHorse1',
      }),
    ).resolves.toEqual({ reset: true });

    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'rt',
      familyId: 'fam',
      revokedAt: null,
      replacedBy: null,
      expiresAt: new Date(Date.now() + 60_000),
      authSession: {
        id: 'sess-1',
        status: 'active',
        deviceId: 'device-alpha-01',
        tenantId: actor().tenantId,
        user: {
          id: 'u1',
          fullName: 'Founder',
          email: loginDto.email,
          memberships: [
            { tenant: { id: actor().tenantId, name: 'A' }, deletedAt: null, status: 'active' },
          ],
        },
      },
    });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({ id: 'rt-next' });
    await expect(
      service.refresh({ refreshToken: 'refresh-token-value-123456', deviceId: 'device-alpha-01' }),
    ).resolves.toMatchObject({ tokenType: 'Bearer', sessionId: 'sess-1' });

    (prisma.authSession.findUnique as jest.Mock).mockResolvedValue({
      id: 'sess-2',
      userId: actor().userId,
    });
    await expect(service.revokeSession(actor(), 'sess-2')).resolves.toEqual({ revoked: true });
    (prisma.authSession.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.revokeSession(actor(), 'missing')).rejects.toMatchObject({
      code: ErrorCodes.NOT_FOUND,
    });
    (prisma.authSession.findMany as jest.Mock).mockResolvedValue([{ id: 'other' }]);
    await expect(service.revokeOtherSessions(actor().userId, actor().sessionId)).resolves.toEqual({
      revoked: true,
    });

    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'u1' });
    await expect(service.forgotPassword({ email: loginDto.email }, { ip: '1.1.1.1' })).resolves.toEqual({
      accepted: true,
    });
  });
});
