import { Reflector } from '@nestjs/core';
import { ErrorCodes } from '../exceptions/error-codes';
import { HttpHeaders } from '../http/http-headers';
import { requestContextStorage } from '../http/request-context';
import { TENANT_A } from '../../testing/fixtures';
import { httpContext } from '../../testing/http-context';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new TenantGuard(reflector as unknown as Reflector);

  beforeEach(() => {
    reflector.getAllAndOverride.mockReturnValue(false);
  });

  it('skips public, skip-tenant, and docs', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);
    expect(guard.canActivate(httpContext({}))).toBe(true);
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(guard.canActivate(httpContext({}))).toBe(true);
    reflector.getAllAndOverride.mockReturnValue(false);
    expect(guard.canActivate(httpContext({ path: '/api/docs/swagger' }))).toBe(true);
  });

  it('requires a UUID tenant header', () => {
    expect(() => guard.canActivate(httpContext({}))).toThrow(
      expect.objectContaining({ code: ErrorCodes.TENANT_REQUIRED }),
    );
    expect(() =>
      guard.canActivate(httpContext({ headers: { [HttpHeaders.tenantId]: 'not-a-uuid' } })),
    ).toThrow(expect.objectContaining({ code: ErrorCodes.BAD_REQUEST }));
  });

  it('stores a valid tenant id', () => {
    requestContextStorage.run({ requestId: 'r', path: '/', method: 'GET' }, () => {
      expect(
        guard.canActivate(
          httpContext({ headers: { [HttpHeaders.tenantId]: TENANT_A } }),
        ),
      ).toBe(true);
      expect(requestContextStorage.getStore()?.tenantId).toBe(TENANT_A);
    });
  });
});
