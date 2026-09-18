import { SYSTEM_ROLE } from './system-roles';

export class AccessPolicy {
  static has(permissions: readonly string[], code: string): boolean {
    return permissions.includes(code);
  }

  static hasAll(permissions: readonly string[], required: readonly string[]): boolean {
    return required.every((code) => permissions.includes(code));
  }

  static isFounder(roles: readonly string[]): boolean {
    return roles.includes(SYSTEM_ROLE.founder);
  }

  static isAdmin(roles: readonly string[]): boolean {
    return roles.includes(SYSTEM_ROLE.admin) || AccessPolicy.isFounder(roles);
  }

  static canAssignFounder(actorRoles: readonly string[]): boolean {
    return AccessPolicy.isFounder(actorRoles);
  }
}
