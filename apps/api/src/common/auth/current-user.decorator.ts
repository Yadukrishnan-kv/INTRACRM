import { createParamDecorator, ExecutionContext, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { AppException } from '../exceptions/app.exception';
import { ErrorCodes } from '../exceptions/error-codes';

export type AuthUser = {
  userId: string;
  sessionId: string;
  tenantId?: string;
  email?: string;
  membershipId?: string;
  roles?: string[];
  permissions?: string[];
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'Authentication required', {
        code: ErrorCodes.UNAUTHORIZED,
        detail: 'Missing access token.',
      });
    }
    return user;
  },
);
