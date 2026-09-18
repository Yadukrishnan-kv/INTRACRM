import { AccessPolicy } from './access.policy';
import { SYSTEM_ROLE } from './system-roles';

describe('AccessPolicy', () => {
  it('checks a single permission', () => {
    expect(AccessPolicy.has(['lead:read', 'lead:create'], 'lead:read')).toBe(true);
    expect(AccessPolicy.has(['lead:read'], 'lead:delete')).toBe(false);
  });

  it('requires every listed permission', () => {
    expect(
      AccessPolicy.hasAll(['tenant:manage_users', 'lead:read'], [
        'tenant:manage_users',
        'lead:read',
      ]),
    ).toBe(true);
    expect(AccessPolicy.hasAll(['lead:read'], ['lead:read', 'lead:delete'])).toBe(
      false,
    );
  });

  it('treats Founder as admin and founder-assigner', () => {
    expect(AccessPolicy.isFounder([SYSTEM_ROLE.founder])).toBe(true);
    expect(AccessPolicy.isAdmin([SYSTEM_ROLE.founder])).toBe(true);
    expect(AccessPolicy.canAssignFounder([SYSTEM_ROLE.admin])).toBe(false);
    expect(AccessPolicy.canAssignFounder([SYSTEM_ROLE.founder])).toBe(true);
  });
});
