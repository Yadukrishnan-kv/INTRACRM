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
import { getRequestContext } from '../http/request-context';
import { RbacService } from '../../modules/identity/application/rbac.service';
import { SKIP_TENANT_KEY } from '../tenancy/skip-tenant.decorator';
import { AuthUser } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class MembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const skipTenant = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (isPublic || skipTenant || request.path.startsWith('/api/docs')) {
      return true;
    }

    const user = request.user;
    const tenantId = getRequestContext()?.tenantId ?? user?.tenantId;
    if (!user || !tenantId) {
      throw new AppException(HttpStatus.FORBIDDEN, 'Tenant is required', {
        code: ErrorCodes.TENANT_REQUIRED,
        detail: 'X-Tenant-Id header is required.',
      });
    }

    const access = await this.rbac.resolve(user.userId, tenantId);
    if (!access) {
      throw new AppException(HttpStatus.FORBIDDEN, 'Tenant is not allowed', {
        code: ErrorCodes.TENANT_MISMATCH,
        detail: 'No active membership in this tenant.',
      });
    }

    const next: AuthUser = {
      userId: user.userId,
      sessionId: user.sessionId,
      tenantId,
      membershipId: access.membershipId,
      roles: access.roles,
      permissions: access.permissions,
      ...(user.email ? { email: user.email } : {}),
    };
    request.user = next;
    const store = getRequestContext();
    if (store) {
      store.tenantId = tenantId;
      store.membershipId = access.membershipId;
      store.roles = access.roles;
      store.permissions = access.permissions;
    }
    return true;
  }
}
