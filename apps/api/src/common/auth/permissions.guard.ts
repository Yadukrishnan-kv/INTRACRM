import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AppException } from '../exceptions/app.exception';
import { ErrorCodes } from '../exceptions/error-codes';
import { AccessPolicy } from '../../modules/identity/domain/access.policy';
import { AuthUser } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from './require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const anyRequired = this.reflector.getAllAndOverride<string[]>(
      ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if ((!required || required.length === 0) && (!anyRequired || anyRequired.length === 0)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const permissions = request.user?.permissions ?? [];
    if (required && required.length > 0 && !AccessPolicy.hasAll(permissions, required)) {
      throw new AppException(HttpStatus.FORBIDDEN, 'Permission denied', {
        code: ErrorCodes.FORBIDDEN,
        detail: `Missing permission: ${required.filter((code) => !permissions.includes(code)).join(', ')}`,
      });
    }
    if (
      anyRequired &&
      anyRequired.length > 0 &&
      !anyRequired.some((code) => AccessPolicy.has(permissions, code))
    ) {
      throw new AppException(HttpStatus.FORBIDDEN, 'Permission denied', {
        code: ErrorCodes.FORBIDDEN,
        detail: `Missing permission: ${anyRequired.join(' or ')}`,
      });
    }
    return true;
  }
}
