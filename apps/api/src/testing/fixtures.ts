import { AuthUser } from '../common/auth/current-user.decorator';
import { PERMISSION, SYSTEM_ROLE } from '../modules/identity/domain/system-roles';

export const TENANT_A = '11111111-1111-4111-8111-111111111111';
export const TENANT_B = '22222222-2222-4222-8222-222222222222';
export const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const SESSION_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const MEMBERSHIP_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const DEVICE_A = 'device-alpha-01';

export function actor(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    userId: USER_A,
    sessionId: SESSION_A,
    tenantId: TENANT_A,
    membershipId: MEMBERSHIP_A,
    email: 'founder@intraleads.local',
    roles: [SYSTEM_ROLE.founder],
    permissions: Object.values(PERMISSION),
    ...overrides,
  };
}

export function jwtConfig() {
  return {
    accessSecret: 'test-access-secret-16',
    refreshSecret: 'test-refresh-secret-16',
    accessTtlSeconds: 900,
    refreshTtlSeconds: 2_592_000,
    sessionIdleTtlSeconds: 43_200,
  };
}

export function rateLimitConfig(overrides: Partial<{
  enabled: boolean;
  windowSeconds: number;
  read: number;
  write: number;
  export: number;
  auth: number;
}> = {}) {
  return {
    enabled: true,
    windowSeconds: 60,
    read: 120,
    write: 40,
    export: 10,
    auth: 30,
    ...overrides,
  };
}
