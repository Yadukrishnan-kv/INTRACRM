import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { AppException } from '../exceptions/app.exception';
import { ErrorCodes } from '../exceptions/error-codes';
import { HttpHeaders } from '../http/http-headers';
import { getRequestContext } from '../http/request-context';
import { SKIP_TENANT_KEY } from './skip-tenant.decorator';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const skipTenant = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request>();
    if (isPublic || skipTenant || request.path.startsWith('/api/docs')) {
      return true;
    }

    const tenantId = request.header(HttpHeaders.tenantId);
    if (!tenantId) {
      throw new AppException(HttpStatus.FORBIDDEN, 'Tenant is required', {
        code: ErrorCodes.TENANT_REQUIRED,
        detail: 'X-Tenant-Id header is required.',
      });
    }
    if (!UUID_RE.test(tenantId)) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Invalid tenant', {
        code: ErrorCodes.BAD_REQUEST,
        detail: 'X-Tenant-Id must be a UUID.',
      });
    }

    const store = getRequestContext();
    if (store) {
      store.tenantId = tenantId;
    }
    return true;
  }
}
