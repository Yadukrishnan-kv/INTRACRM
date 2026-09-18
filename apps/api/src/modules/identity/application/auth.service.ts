import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { LoginEventResult } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../../../common/config/configuration';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import { AUTH_POLICY, assertPasswordPolicy } from '../domain/password.policy';
import { AuthRateLimiter } from '../infrastructure/auth.rate-limiter';
import { PasswordHasher } from '../infrastructure/password.hasher';
import { TokenHasher } from '../infrastructure/token.hasher';
import { RbacService } from './rbac.service';
import { PushTokensService } from '../../notifications/application/push-tokens.service';
import {
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginRequest,
  RefreshRequest,
  ResetPasswordRequest,
} from '../interface/http/dto/auth.dto';
import { AccessTokenPayload } from '../../../common/auth/jwt-auth.guard';
import { devicesMatch } from '../../../common/security/device-binding';

export type AuthTokensResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  sessionId: string;
  tenantId: string;
  user: {
    id: string;
    fullName: string;
    email: string;
  };
  tenants: Array<{ id: string; name: string }>;
  membershipId: string | null;
  roles: string[];
  permissions: string[];
};

export type SessionView = {
  id: string;
  deviceId: string;
  deviceName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: string;
  lastSeenAt: Date;
  createdAt: Date;
  isCurrent: boolean;
};

export type LoginHistoryView = {
  id: string;
  result: string;
  deviceName: string | null;
  ipAddress: string | null;
  createdAt: Date;
  failureReason: string | null;
};

type RequestMeta = {
  ip?: string;
  userAgent?: string;
  deviceId?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenHasher,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly rbac: RbacService,
    private readonly pushTokens: PushTokensService,
  ) {}

  async login(dto: LoginRequest, meta: RequestMeta): Promise<AuthTokensResponse> {
    await this.rateLimiter.consume(
      `login:${meta.ip ?? 'unknown'}:${dto.email}`,
      AUTH_POLICY.loginRateLimit,
    );

    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      include: {
        credential: true,
        memberships: {
          where: { deletedAt: null, status: 'active' },
          include: { tenant: true },
        },
      },
    });

    if (user == null || user.credential == null) {
      await this.recordHistory({
        email: dto.email,
        result: 'failure',
        failureReason: 'unknown_user',
        meta,
        deviceId: dto.deviceId,
        ...(dto.deviceName ? { deviceName: dto.deviceName } : {}),
      });
      this.invalidCredentials();
    }

    const credential = user.credential;
    if (user.status === 'disabled') {
      throw new AppException(HttpStatus.FORBIDDEN, 'Account disabled', {
        code: ErrorCodes.FORBIDDEN,
        detail: 'This account is disabled.',
      });
    }
    if (user.status === 'locked') {
      await this.recordHistory({
        userId: user.id,
        email: dto.email,
        result: 'locked',
        failureReason: 'admin_lock',
        meta,
        deviceId: dto.deviceId,
        ...(dto.deviceName ? { deviceName: dto.deviceName } : {}),
      });
      throw new AppException(HttpStatus.FORBIDDEN, 'Account locked', {
        code: ErrorCodes.ACCOUNT_LOCKED,
        detail: 'This account is locked. Contact your administrator.',
      });
    }
    if (credential.lockedUntil && credential.lockedUntil.getTime() > Date.now()) {
      await this.recordHistory({
        userId: user.id,
        email: dto.email,
        result: 'locked',
        failureReason: 'temporary_lock',
        meta,
        deviceId: dto.deviceId,
        ...(dto.deviceName ? { deviceName: dto.deviceName } : {}),
      });
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Account locked', {
        code: ErrorCodes.ACCOUNT_LOCKED,
        detail: 'Too many failed attempts. Try again later.',
      });
    }

    const passwordOk = await this.passwords.verify(
      credential.passwordHash,
      dto.password,
    );
    if (!passwordOk) {
      await this.registerFailure(user.id, dto, meta);
      this.invalidCredentials();
    }

    const tenants = user.memberships
      .filter((membership) => membership.tenant.deletedAt === null)
      .map((membership) => ({
        id: membership.tenant.id,
        name: membership.tenant.name,
      }));
    if (tenants.length === 0) {
      throw new AppException(HttpStatus.FORBIDDEN, 'No tenant access', {
        code: ErrorCodes.FORBIDDEN,
        detail: 'This user has no active tenant membership.',
      });
    }
    const tenantId = dto.tenantId ?? tenants[0]?.id;
    if (!tenantId || !tenants.some((tenant) => tenant.id === tenantId)) {
      throw new AppException(HttpStatus.FORBIDDEN, 'Tenant is not allowed', {
        code: ErrorCodes.TENANT_MISMATCH,
        detail: 'The selected tenant is not available to this user.',
      });
    }

    await this.prisma.userCredential.update({
      where: { userId: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });

    const issued = await this.issueSession({
      userId: user.id,
      email: user.email ?? dto.email,
      fullName: user.fullName,
      tenantId,
      tenants,
      deviceId: dto.deviceId,
      ...(dto.deviceName ? { deviceName: dto.deviceName } : {}),
      meta,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.recordHistory({
      userId: user.id,
      tenantId,
      sessionId: issued.sessionId,
      email: dto.email,
      result: 'success',
      meta,
      deviceId: dto.deviceId,
      ...(dto.deviceName ? { deviceName: dto.deviceName } : {}),
    });
    return issued;
  }

  async refresh(dto: RefreshRequest, meta: RequestMeta = {}): Promise<AuthTokensResponse> {
    const tokenHash = this.tokens.hash(dto.refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        authSession: { include: { user: { include: { memberships: { include: { tenant: true } } } } } },
      },
    });

    if (!existing) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Invalid refresh token', {
        code: ErrorCodes.UNAUTHORIZED,
        detail: 'Refresh token is invalid.',
      });
    }

    if (existing.revokedAt || existing.replacedBy) {
      await this.revokeFamily(existing.familyId);
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Refresh token reused', {
        code: ErrorCodes.REFRESH_REUSE,
        detail: 'Refresh token reuse detected. All sessions in this family were revoked.',
      });
    }
    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Session expired', {
        code: ErrorCodes.SESSION_EXPIRED,
        detail: 'Refresh token has expired.',
      });
    }

    const session = existing.authSession;
    if (session.status !== 'active') {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Session expired', {
        code: ErrorCodes.SESSION_EXPIRED,
        detail: 'This session is no longer active.',
      });
    }
    const presentedDeviceId = dto.deviceId ?? meta.deviceId;
    if (!devicesMatch(session.deviceId, presentedDeviceId)) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Device mismatch', {
        code: ErrorCodes.DEVICE_MISMATCH,
        detail: 'Refresh is bound to the original device.',
      });
    }

    const user = session.user;
    const tenants = user.memberships
      .filter((membership) => membership.deletedAt === null && membership.status === 'active')
      .map((membership) => ({ id: membership.tenant.id, name: membership.tenant.name }));
    const tenantId = session.tenantId ?? tenants[0]?.id;
    if (!tenantId) {
      throw new AppException(HttpStatus.FORBIDDEN, 'No tenant access', {
        code: ErrorCodes.FORBIDDEN,
        detail: 'This user has no active tenant membership.',
      });
    }

    const refreshToken = this.tokens.refreshToken();
    const jwt = this.config.get('jwt', { infer: true });
    const now = new Date();
    const refreshExpires = new Date(now.getTime() + jwt.refreshTtlSeconds * 1000);

    const created = await this.prisma.$transaction(async (tx) => {
      const next = await tx.refreshToken.create({
        data: {
          sessionId: session.id,
          userId: user.id,
          tokenHash: this.tokens.hash(refreshToken),
          familyId: existing.familyId,
          expiresAt: refreshExpires,
        },
      });
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: now, replacedBy: next.id },
      });
      await tx.authSession.update({
        where: { id: session.id },
        data: { lastSeenAt: now },
      });
      return next;
    });
    void created;

    const accessToken = await this.signAccess(user.id, session.id, tenantId, session.deviceId);
    const access = await this.rbac.resolve(user.id, tenantId);
    return {
      accessToken,
      refreshToken,
      expiresIn: jwt.accessTtlSeconds,
      tokenType: 'Bearer',
      sessionId: session.id,
      tenantId,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email ?? '',
      },
      tenants,
      membershipId: access?.membershipId ?? null,
      roles: access?.roles ?? [],
      permissions: access?.permissions ?? [],
    };
  }

  async logout(actor: AuthUser, refreshToken?: string): Promise<{ revoked: true }> {
    await this.pushTokens.revokeAllForUser(actor.userId);
    if (refreshToken) {
      const hashed = this.tokens.hash(refreshToken);
      const row = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: hashed },
      });
      if (row && row.userId === actor.userId) {
        await this.revokeFamily(row.familyId);
        return { revoked: true };
      }
    }
    await this.revokeSessionById(actor.sessionId);
    return { revoked: true };
  }

  async forgotPassword(
    dto: ForgotPasswordRequest,
    meta: RequestMeta,
  ): Promise<{ accepted: true; debugOtp?: string }> {
    await this.rateLimiter.consume(
      `forgot:${meta.ip ?? 'unknown'}`,
      AUTH_POLICY.forgotRateLimit,
    );
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });
    const accepted = { accepted: true as const };
    if (!user) {
      return accepted;
    }
    const otp = this.tokens.otpCode();
    const expiresAt = new Date(
      Date.now() + AUTH_POLICY.otpTtlMinutes * 60 * 1000,
    );
    await this.prisma.otpChallenge.create({
      data: {
        userId: user.id,
        destination: dto.email,
        purpose: 'password_reset',
        codeHash: this.tokens.hmac(otp),
        maxAttempts: AUTH_POLICY.otpMaxAttempts,
        expiresAt,
      },
    });
    if (this.config.get('authEchoOtp', { infer: true })) {
      return { ...accepted, debugOtp: otp };
    }
    return accepted;
  }

  async resetPassword(dto: ResetPasswordRequest): Promise<{ reset: true }> {
    const policyError = assertPasswordPolicy(dto.newPassword, dto.email);
    if (policyError) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Password policy', {
        code: ErrorCodes.PASSWORD_POLICY,
        detail: policyError,
      });
    }
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        destination: dto.email,
        purpose: 'password_reset',
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge || challenge.expiresAt.getTime() <= Date.now()) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Invalid code', {
        code: ErrorCodes.OTP_INVALID,
        detail: 'The reset code is invalid or expired.',
      });
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Invalid code', {
        code: ErrorCodes.OTP_INVALID,
        detail: 'The reset code is no longer valid.',
      });
    }
    const matches = challenge.codeHash === this.tokens.hmac(dto.otp);
    if (!matches) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Invalid code', {
        code: ErrorCodes.OTP_INVALID,
        detail: 'The reset code is invalid or expired.',
      });
    }
    if (!challenge.userId) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Invalid code', {
        code: ErrorCodes.OTP_INVALID,
        detail: 'The reset code is invalid or expired.',
      });
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      await tx.userCredential.upsert({
        where: { userId: challenge.userId as string },
        update: {
          passwordHash,
          passwordAlgo: 'argon2id',
          passwordUpdatedAt: new Date(),
          failedAttempts: 0,
          lockedUntil: null,
        },
        create: {
          userId: challenge.userId as string,
          passwordHash,
        },
      });
      await tx.user.update({
        where: { id: challenge.userId as string },
        data: { status: 'active' },
      });
    });
    await this.revokeAllUserSessions(challenge.userId);
    return { reset: true };
  }

  async changePassword(
    actor: AuthUser,
    dto: ChangePasswordRequest,
  ): Promise<{ changed: true }> {
    const policyError = assertPasswordPolicy(dto.newPassword, actor.email);
    if (policyError) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Password policy', {
        code: ErrorCodes.PASSWORD_POLICY,
        detail: policyError,
      });
    }
    const credential = await this.prisma.userCredential.findUnique({
      where: { userId: actor.userId },
    });
    if (!credential) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Invalid credentials', {
        code: ErrorCodes.INVALID_CREDENTIALS,
        detail: 'Current password is incorrect.',
      });
    }
    const ok = await this.passwords.verify(credential.passwordHash, dto.currentPassword);
    if (!ok) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Invalid credentials', {
        code: ErrorCodes.INVALID_CREDENTIALS,
        detail: 'Current password is incorrect.',
      });
    }
    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.userCredential.update({
      where: { userId: actor.userId },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
    await this.revokeOtherSessions(actor.userId, actor.sessionId);
    return { changed: true };
  }

  async listSessions(actor: AuthUser): Promise<SessionView[]> {
    const rows = await this.prisma.authSession.findMany({
      where: { userId: actor.userId },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      deviceId: row.deviceId,
      deviceName: row.deviceName,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      status: row.status,
      lastSeenAt: row.lastSeenAt,
      createdAt: row.createdAt,
      isCurrent: row.id === actor.sessionId,
    }));
  }

  async revokeSession(actor: AuthUser, sessionId: string): Promise<{ revoked: true }> {
    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== actor.userId) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Not found', {
        code: ErrorCodes.NOT_FOUND,
        detail: 'Session not found.',
      });
    }
    await this.revokeSessionById(session.id);
    return { revoked: true };
  }

  async revokeOtherSessions(userId: string, keepSessionId: string): Promise<{ revoked: true }> {
    const others = await this.prisma.authSession.findMany({
      where: { userId, status: 'active', id: { not: keepSessionId } },
    });
    for (const session of others) {
      await this.revokeSessionById(session.id);
    }
    return { revoked: true };
  }

  async loginHistory(actor: AuthUser): Promise<LoginHistoryView[]> {
    const rows = await this.prisma.loginHistory.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      result: row.result,
      deviceName: row.deviceName,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt,
      failureReason: row.failureReason,
    }));
  }

  async me(actor: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      include: {
        memberships: {
          where: { deletedAt: null, status: 'active' },
          include: { tenant: true },
        },
      },
    });
    if (!user) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Not found', {
        code: ErrorCodes.NOT_FOUND,
        detail: 'User not found.',
      });
    }
    const access = actor.tenantId
      ? await this.rbac.resolve(actor.userId, actor.tenantId)
      : null;
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      status: user.status,
      tenantId: actor.tenantId ?? null,
      tenants: user.memberships.map((membership) => ({
        id: membership.tenant.id,
        name: membership.tenant.name,
      })),
      membershipId: access?.membershipId ?? null,
      roles: access?.roles ?? [],
      permissions: access?.permissions ?? [],
    };
  }

  private async issueSession(input: {
    userId: string;
    email: string;
    fullName: string;
    tenantId: string;
    tenants: Array<{ id: string; name: string }>;
    deviceId: string;
    deviceName?: string;
    meta: RequestMeta;
  }): Promise<AuthTokensResponse> {
    const jwt = this.config.get('jwt', { infer: true });
    const now = new Date();
    const sessionExpires = new Date(now.getTime() + jwt.refreshTtlSeconds * 1000);
    const refreshExpires = sessionExpires;
    const familyId = randomUUID();
    const refreshToken = this.tokens.refreshToken();

    const previous = await this.prisma.authSession.findMany({
      where: { userId: input.userId, deviceId: input.deviceId, status: 'active' },
    });
    for (const session of previous) {
      await this.revokeSessionById(session.id);
    }

    const session = await this.prisma.authSession.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        ...(input.deviceName ? { deviceName: input.deviceName } : {}),
        ...(input.meta.userAgent ? { userAgent: input.meta.userAgent } : {}),
        ...(input.meta.ip ? { ipAddress: input.meta.ip } : {}),
        refreshFamilyId: familyId,
        status: 'active',
        expiresAt: sessionExpires,
        lastSeenAt: now,
      },
    });
    await this.prisma.refreshToken.create({
      data: {
        sessionId: session.id,
        userId: input.userId,
        tokenHash: this.tokens.hash(refreshToken),
        familyId,
        expiresAt: refreshExpires,
      },
    });
    const accessToken = await this.signAccess(input.userId, session.id, input.tenantId, input.deviceId);
    const access = await this.rbac.resolve(input.userId, input.tenantId);
    return {
      accessToken,
      refreshToken,
      expiresIn: jwt.accessTtlSeconds,
      tokenType: 'Bearer',
      sessionId: session.id,
      tenantId: input.tenantId,
      user: {
        id: input.userId,
        fullName: input.fullName,
        email: input.email,
      },
      tenants: input.tenants,
      membershipId: access?.membershipId ?? null,
      roles: access?.roles ?? [],
      permissions: access?.permissions ?? [],
    };
  }

  private async signAccess(
    userId: string,
    sessionId: string,
    tenantId: string,
    deviceId: string,
  ): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: userId,
      sid: sessionId,
      tid: tenantId,
      did: deviceId,
      typ: 'access',
    };
    return this.jwt.signAsync(payload);
  }

  private async registerFailure(
    userId: string,
    dto: LoginRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const credential = await this.prisma.userCredential.update({
      where: { userId },
      data: { failedAttempts: { increment: 1 } },
    });
    const attempts = credential.failedAttempts;
    let locked = false;
    if (attempts >= AUTH_POLICY.maxFailedAttempts) {
      locked = true;
      await this.prisma.userCredential.update({
        where: { userId },
        data: {
          lockedUntil: new Date(Date.now() + AUTH_POLICY.lockMinutes * 60 * 1000),
          failedAttempts: 0,
        },
      });
    }
    await this.recordHistory({
      userId,
      email: dto.email,
      result: locked ? 'locked' : 'failure',
      failureReason: locked ? 'too_many_attempts' : 'bad_password',
      meta,
      deviceId: dto.deviceId,
      ...(dto.deviceName ? { deviceName: dto.deviceName } : {}),
    });
  }

  private async recordHistory(input: {
    userId?: string;
    tenantId?: string;
    sessionId?: string;
    email: string;
    result: LoginEventResult;
    failureReason?: string;
    meta: RequestMeta;
    deviceId?: string;
    deviceName?: string;
  }): Promise<void> {
    await this.prisma.loginHistory.create({
      data: {
        email: input.email,
        result: input.result,
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input.deviceId ? { deviceId: input.deviceId } : {}),
        ...(input.deviceName ? { deviceName: input.deviceName } : {}),
        ...(input.meta.ip ? { ipAddress: input.meta.ip } : {}),
        ...(input.meta.userAgent ? { userAgent: input.meta.userAgent } : {}),
        ...(input.failureReason ? { failureReason: input.failureReason } : {}),
      },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    const now = new Date();
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    const tokens = await this.prisma.refreshToken.findMany({
      where: { familyId },
      select: { sessionId: true },
    });
    const sessionIds = [...new Set(tokens.map((row) => row.sessionId))];
    if (sessionIds.length > 0) {
      await this.prisma.authSession.updateMany({
        where: { id: { in: sessionIds }, status: 'active' },
        data: { status: 'revoked', revokedAt: now },
      });
    }
  }

  private async revokeSessionById(sessionId: string): Promise<void> {
    const now = new Date();
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: { status: 'revoked', revokedAt: now },
    });
    await this.prisma.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private async revokeAllUserSessions(userId: string): Promise<void> {
    const sessions = await this.prisma.authSession.findMany({
      where: { userId, status: 'active' },
    });
    for (const session of sessions) {
      await this.revokeSessionById(session.id);
    }
  }

  private invalidCredentials(): never {
    throw new AppException(HttpStatus.UNAUTHORIZED, 'Invalid credentials', {
      code: ErrorCodes.INVALID_CREDENTIALS,
      detail: 'Invalid email or password.',
    });
  }
}
