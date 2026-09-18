import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AppConfig } from '../config/configuration';
import { AppException } from '../exceptions/app.exception';
import { ErrorCodes } from '../exceptions/error-codes';
import { getRequestContext } from '../http/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AUTH_POLICY } from '../../modules/identity/domain/password.policy';
import { AuthUser } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { HttpHeaders } from '../http/http-headers';
import { devicesMatch } from '../security/device-binding';

export type AccessTokenPayload = {
  sub: string;
  sid: string;
  tid?: string;
  did?: string;
  typ: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractBearer(request);
    if (!token) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Authentication required', {
        code: ErrorCodes.UNAUTHORIZED,
        detail: 'Missing access token.',
      });
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Authentication required', {
        code: ErrorCodes.UNAUTHORIZED,
        detail: 'Invalid or expired access token.',
      });
    }

    if (payload.typ !== 'access' || !payload.sub || !payload.sid) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Authentication required', {
        code: ErrorCodes.UNAUTHORIZED,
        detail: 'Invalid access token.',
      });
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    if (!session || session.userId !== payload.sub || session.status !== 'active') {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Session expired', {
        code: ErrorCodes.SESSION_EXPIRED,
        detail: 'This session is no longer active.',
      });
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Session expired', {
        code: ErrorCodes.SESSION_EXPIRED,
        detail: 'This session has expired.',
      });
    }

    const idleMs =
      this.config.get('jwt', { infer: true }).sessionIdleTtlSeconds * 1000;
    if (Date.now() - session.lastSeenAt.getTime() > idleMs) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { status: 'expired', revokedAt: new Date() },
      });
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Session expired', {
        code: ErrorCodes.SESSION_EXPIRED,
        detail: 'Session timed out due to inactivity.',
      });
    }

    if (session.user.deletedAt || session.user.status === 'disabled') {
      throw new AppException(HttpStatus.FORBIDDEN, 'Account disabled', {
        code: ErrorCodes.FORBIDDEN,
        detail: 'This account is disabled.',
      });
    }
    if (session.user.status === 'locked') {
      throw new AppException(HttpStatus.FORBIDDEN, 'Account locked', {
        code: ErrorCodes.ACCOUNT_LOCKED,
        detail: 'This account is locked.',
      });
    }

    const presentedDeviceId = request.header(HttpHeaders.deviceId)?.trim();
    if (!devicesMatch(session.deviceId, presentedDeviceId)) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Device mismatch', {
        code: ErrorCodes.DEVICE_MISMATCH,
        detail: 'This session is bound to another device.',
      });
    }
    if (payload.did && !devicesMatch(payload.did, presentedDeviceId)) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Device mismatch', {
        code: ErrorCodes.DEVICE_MISMATCH,
        detail: 'Access token is bound to another device.',
      });
    }

    const user: AuthUser = {
      userId: session.userId,
      sessionId: session.id,
      ...(payload.tid ? { tenantId: payload.tid } : {}),
      ...(session.user.email ? { email: session.user.email } : {}),
    };
    request.user = user;
    const store = getRequestContext();
    if (store) {
      store.userId = user.userId;
      if (user.tenantId) {
        store.tenantId = user.tenantId;
      }
    }

    if (
      Date.now() - session.lastSeenAt.getTime() >
      AUTH_POLICY.lastSeenTouchSeconds * 1000
    ) {
      void this.prisma.authSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    }

    return true;
  }

  private extractBearer(request: Request): string | undefined {
    const header = request.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      return undefined;
    }
    return header.slice(7).trim();
  }
}
