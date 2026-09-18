import { HttpStatus, Injectable } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { RedisService } from '../../../common/redis/redis.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccessPolicy } from '../domain/access.policy';
import {
  PRODUCT_ROLE_CODES,
  RBAC_CACHE_TTL_SECONDS,
  SYSTEM_ROLE,
} from '../domain/system-roles';
import {
  AssignMembershipRolesRequest,
  AssignUserRequest,
  CreateRoleRequest,
  ReplaceRolePermissionsRequest,
  UpdateMembershipRequest,
  UpdateRoleRequest,
} from '../interface/http/dto/rbac.dto';

export type ResolvedAccess = {
  membershipId: string;
  roles: string[];
  permissions: string[];
};

export type PermissionView = {
  id: string;
  code: string;
  resource: string;
  action: string;
  description: string | null;
};

export type RoleView = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  tenantId: string | null;
  permissionCodes: string[];
};

export type MembershipView = {
  id: string;
  status: string;
  designation: string | null;
  employeeCode: string | null;
  user: {
    id: string;
    fullName: string;
    email: string | null;
  };
  roles: Array<{ id: string; code: string; name: string }>;
};

export type PermissionMatrixView = {
  permissions: PermissionView[];
  roles: Array<Omit<RoleView, 'permissionCodes'> & { permissionCodes: string[] }>;
};

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async resolve(userId: string, tenantId: string): Promise<ResolvedAccess | null> {
    const cached = await this.readCache(tenantId, userId);
    if (cached) {
      return cached;
    }
    const membership = await this.prisma.membership.findFirst({
      where: { userId, tenantId, deletedAt: null, status: 'active' },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (!membership) {
      return null;
    }
    const roles = membership.roles
      .filter((row) => row.role.deletedAt === null)
      .map((row) => row.role.code);
    const permissions = [
      ...new Set(
        membership.roles.flatMap((row) =>
          row.role.deletedAt
            ? []
            : row.role.permissions.map((grant) => grant.permission.code),
        ),
      ),
    ].sort();
    const access: ResolvedAccess = {
      membershipId: membership.id,
      roles,
      permissions,
    };
    await this.writeCache(tenantId, userId, access);
    return access;
  }

  async listPermissions(): Promise<PermissionView[]> {
    const rows = await this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
    return rows.map((row) => this.toPermission(row));
  }

  async listRoles(tenantId: string): Promise<RoleView[]> {
    const rows = await this.prisma.role.findMany({
      where: {
        deletedAt: null,
        OR: [
          { tenantId, isSystem: false },
          { tenantId: null, isSystem: true, code: { in: [...PRODUCT_ROLE_CODES] } },
        ],
      },
      include: { permissions: { include: { permission: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return rows.map((row) => this.toRole(row));
  }

  async getRole(tenantId: string, roleId: string): Promise<RoleView> {
    const role = await this.findVisibleRole(tenantId, roleId);
    return this.toRole(role);
  }

  async createRole(actor: AuthUser, dto: CreateRoleRequest): Promise<RoleView> {
    const tenantId = this.requireTenant(actor);
    const existing = await this.prisma.role.findFirst({
      where: { tenantId, code: dto.code, deletedAt: null },
    });
    if (existing) {
      throw new AppException(HttpStatus.CONFLICT, 'Role already exists', {
        code: ErrorCodes.CONFLICT,
        detail: 'A role with this code already exists in the tenant.',
      });
    }
    const permissionIds = await this.permissionIds(dto.permissionCodes ?? []);
    const created = await this.prisma.role.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        isSystem: false,
        isDefault: false,
        createdBy: actor.userId,
        ...(dto.description ? { description: dto.description } : {}),
        permissions: {
          create: permissionIds.map((permissionId) => ({
            permissionId,
            createdBy: actor.userId,
          })),
        },
      },
      include: { permissions: { include: { permission: true } } },
    });
    await this.invalidateTenant(tenantId);
    return this.toRole(created);
  }

  async updateRole(
    actor: AuthUser,
    roleId: string,
    dto: UpdateRoleRequest,
  ): Promise<RoleView> {
    const tenantId = this.requireTenant(actor);
    const role = await this.findVisibleRole(tenantId, roleId);
    if (role.isSystem) {
      throw new AppException(HttpStatus.FORBIDDEN, 'System role is locked', {
        code: ErrorCodes.FORBIDDEN,
        detail: 'System role names cannot be changed.',
      });
    }
    const updated = await this.prisma.role.update({
      where: { id: role.id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
      include: { permissions: { include: { permission: true } } },
    });
    return this.toRole(updated);
  }

  async deleteRole(actor: AuthUser, roleId: string): Promise<{ deleted: true }> {
    const tenantId = this.requireTenant(actor);
    const role = await this.findVisibleRole(tenantId, roleId);
    if (role.isSystem) {
      throw new AppException(HttpStatus.FORBIDDEN, 'System role is locked', {
        code: ErrorCodes.FORBIDDEN,
        detail: 'System roles cannot be deleted.',
      });
    }
    await this.prisma.role.update({
      where: { id: role.id },
      data: {
        deletedAt: new Date(),
        deletedBy: actor.userId,
        version: { increment: 1 },
      },
    });
    await this.prisma.membershipRole.deleteMany({ where: { roleId: role.id } });
    await this.invalidateTenant(tenantId);
    return { deleted: true };
  }

  async replacePermissions(
    actor: AuthUser,
    roleId: string,
    dto: ReplaceRolePermissionsRequest,
  ): Promise<RoleView> {
    const tenantId = this.requireTenant(actor);
    const role = await this.findVisibleRole(tenantId, roleId);
    if (role.isSystem) {
      throw new AppException(HttpStatus.FORBIDDEN, 'System role is locked', {
        code: ErrorCodes.FORBIDDEN,
        detail: 'System role permissions are fixed. Create a custom role to change the matrix.',
      });
    }
    const permissionIds = await this.permissionIds(dto.permissionCodes);
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
            createdBy: actor.userId,
          })),
        });
      }
      await tx.role.update({
        where: { id: role.id },
        data: { updatedBy: actor.userId, version: { increment: 1 } },
      });
    });
    await this.invalidateTenant(tenantId);
    return this.getRole(tenantId, role.id);
  }

  async matrix(tenantId: string): Promise<PermissionMatrixView> {
    const [permissions, roles] = await Promise.all([
      this.listPermissions(),
      this.listRoles(tenantId),
    ]);
    return { permissions, roles };
  }

  async listMemberships(tenantId: string): Promise<MembershipView[]> {
    const rows = await this.prisma.membership.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        user: true,
        roles: { include: { role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toMembership(row));
  }

  async assignUser(actor: AuthUser, dto: AssignUserRequest): Promise<MembershipView> {
    const tenantId = this.requireTenant(actor);
    const roles = await this.loadAssignableRoles(tenantId, dto.roleIds);
    this.assertFounderAssignment(actor, [], roles.map((role) => role.code));

    let user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          fullName: dto.fullName,
          status: 'invited',
          createdBy: actor.userId,
        },
      });
    }

    const existing = await this.prisma.membership.findFirst({
      where: { tenantId, userId: user.id, deletedAt: null },
    });
    if (existing) {
      throw new AppException(HttpStatus.CONFLICT, 'User already assigned', {
        code: ErrorCodes.CONFLICT,
        detail: 'This user already has a membership in the tenant.',
      });
    }

    const membership = await this.prisma.membership.create({
      data: {
        tenantId,
        userId: user.id,
        status: 'active',
        joinedAt: new Date(),
        createdBy: actor.userId,
        ...(dto.designation ? { designation: dto.designation } : {}),
        ...(dto.employeeCode ? { employeeCode: dto.employeeCode } : {}),
        roles: {
          create: roles.map((role) => ({
            roleId: role.id,
            createdBy: actor.userId,
          })),
        },
      },
      include: { user: true, roles: { include: { role: true } } },
    });
    await this.invalidateUser(tenantId, user.id);
    return this.toMembership(membership);
  }

  async updateMembership(
    actor: AuthUser,
    membershipId: string,
    dto: UpdateMembershipRequest,
  ): Promise<MembershipView> {
    const tenantId = this.requireTenant(actor);
    const membership = await this.requireMembership(tenantId, membershipId);
    const currentRoles = membership.roles.map((row) => row.role.code);
    if (dto.status && dto.status !== 'active' && currentRoles.includes(SYSTEM_ROLE.founder)) {
      await this.assertNotLastFounder(tenantId, membership.id);
    }
    const status = dto.status as MembershipStatus | undefined;
    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: {
        ...(status ? { status } : {}),
        ...(dto.designation !== undefined ? { designation: dto.designation } : {}),
        ...(status === 'active' ? { suspendedAt: null } : {}),
        ...(status === 'suspended' ? { suspendedAt: new Date() } : {}),
        ...(status === 'ended'
          ? { deletedAt: new Date(), deletedBy: actor.userId }
          : {}),
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
      include: { user: true, roles: { include: { role: true } } },
    });
    await this.invalidateUser(tenantId, membership.userId);
    return this.toMembership(updated);
  }

  async assignRoles(
    actor: AuthUser,
    membershipId: string,
    dto: AssignMembershipRolesRequest,
  ): Promise<MembershipView> {
    const tenantId = this.requireTenant(actor);
    const membership = await this.requireMembership(tenantId, membershipId);
    const nextRoles = await this.loadAssignableRoles(tenantId, dto.roleIds);
    const currentCodes = membership.roles.map((row) => row.role.code);
    const nextCodes = nextRoles.map((role) => role.code);
    this.assertFounderAssignment(actor, currentCodes, nextCodes);
    if (currentCodes.includes(SYSTEM_ROLE.founder) && !nextCodes.includes(SYSTEM_ROLE.founder)) {
      await this.assertNotLastFounder(tenantId, membership.id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.membershipRole.deleteMany({ where: { membershipId: membership.id } });
      await tx.membershipRole.createMany({
        data: nextRoles.map((role) => ({
          membershipId: membership.id,
          roleId: role.id,
          createdBy: actor.userId,
        })),
      });
    });
    await this.invalidateUser(tenantId, membership.userId);
    const refreshed = await this.requireMembership(tenantId, membership.id);
    return this.toMembership(refreshed);
  }

  private async findVisibleRole(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        deletedAt: null,
        OR: [
          { tenantId, isSystem: false },
          { tenantId: null, isSystem: true, code: { in: [...PRODUCT_ROLE_CODES] } },
        ],
      },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Not found', {
        code: ErrorCodes.NOT_FOUND,
        detail: 'Role not found.',
      });
    }
    return role;
  }

  private async requireMembership(tenantId: string, membershipId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId, deletedAt: null },
      include: { user: true, roles: { include: { role: true } } },
    });
    if (!membership) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Not found', {
        code: ErrorCodes.NOT_FOUND,
        detail: 'Membership not found.',
      });
    }
    return membership;
  }

  private async loadAssignableRoles(tenantId: string, roleIds: string[]) {
    const uniqueIds = [...new Set(roleIds)];
    const roles = await this.prisma.role.findMany({
      where: {
        id: { in: uniqueIds },
        deletedAt: null,
        OR: [
          { tenantId, isSystem: false },
          { tenantId: null, isSystem: true, code: { in: [...PRODUCT_ROLE_CODES] } },
        ],
      },
    });
    if (roles.length !== uniqueIds.length) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Invalid roles', {
        code: ErrorCodes.VALIDATION_ERROR,
        detail: 'One or more roles are not assignable in this tenant.',
      });
    }
    return roles;
  }

  private async permissionIds(codes: string[]): Promise<string[]> {
    if (codes.length === 0) {
      return [];
    }
    const unique = [...new Set(codes)];
    const rows = await this.prisma.permission.findMany({
      where: { code: { in: unique } },
    });
    if (rows.length !== unique.length) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Invalid permissions', {
        code: ErrorCodes.VALIDATION_ERROR,
        detail: 'One or more permission codes are unknown.',
      });
    }
    return rows.map((row) => row.id);
  }

  private assertFounderAssignment(
    actor: AuthUser,
    currentCodes: string[],
    nextCodes: string[],
  ): void {
    const adding = nextCodes.includes(SYSTEM_ROLE.founder) && !currentCodes.includes(SYSTEM_ROLE.founder);
    const removing = currentCodes.includes(SYSTEM_ROLE.founder) && !nextCodes.includes(SYSTEM_ROLE.founder);
    if ((adding || removing) && !AccessPolicy.canAssignFounder(actor.roles ?? [])) {
      throw new AppException(HttpStatus.FORBIDDEN, 'Permission denied', {
        code: ErrorCodes.FORBIDDEN,
        detail: 'Only a Founder can assign or remove the Founder role.',
      });
    }
  }

  private async assertNotLastFounder(tenantId: string, membershipId: string): Promise<void> {
    const founders = await this.prisma.membershipRole.count({
      where: {
        role: { code: SYSTEM_ROLE.founder, tenantId: null, deletedAt: null },
        membership: {
          tenantId,
          deletedAt: null,
          status: 'active',
          id: { not: membershipId },
        },
      },
    });
    if (founders === 0) {
      throw new AppException(HttpStatus.CONFLICT, 'Last founder', {
        code: ErrorCodes.CONFLICT,
        detail: 'The tenant must keep at least one Founder.',
      });
    }
  }

  private requireTenant(actor: AuthUser): string {
    if (!actor.tenantId) {
      throw new AppException(HttpStatus.FORBIDDEN, 'Tenant is required', {
        code: ErrorCodes.TENANT_REQUIRED,
        detail: 'X-Tenant-Id header is required.',
      });
    }
    return actor.tenantId;
  }

  private toPermission(row: {
    id: string;
    code: string;
    resource: string;
    action: string;
    description: string | null;
  }): PermissionView {
    return {
      id: row.id,
      code: row.code,
      resource: row.resource,
      action: row.action,
      description: row.description,
    };
  }

  private toRole(row: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    isDefault: boolean;
    tenantId: string | null;
    permissions: Array<{ permission: { code: string } }>;
  }): RoleView {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      isSystem: row.isSystem,
      isDefault: row.isDefault,
      tenantId: row.tenantId,
      permissionCodes: row.permissions.map((grant) => grant.permission.code).sort(),
    };
  }

  private toMembership(row: {
    id: string;
    status: string;
    designation: string | null;
    employeeCode: string | null;
    user: { id: string; fullName: string; email: string | null };
    roles: Array<{ role: { id: string; code: string; name: string; deletedAt: Date | null } }>;
  }): MembershipView {
    return {
      id: row.id,
      status: row.status,
      designation: row.designation,
      employeeCode: row.employeeCode,
      user: {
        id: row.user.id,
        fullName: row.user.fullName,
        email: row.user.email,
      },
      roles: row.roles
        .filter((item) => item.role.deletedAt === null)
        .map((item) => ({
          id: item.role.id,
          code: item.role.code,
          name: item.role.name,
        })),
    };
  }

  private cacheKey(tenantId: string, userId: string): string {
    return `rbac:perm:${tenantId}:${userId}`;
  }

  private async readCache(tenantId: string, userId: string): Promise<ResolvedAccess | null> {
    const raw = await this.redis.get(this.cacheKey(tenantId, userId));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as ResolvedAccess;
    } catch {
      return null;
    }
  }

  private async writeCache(
    tenantId: string,
    userId: string,
    access: ResolvedAccess,
  ): Promise<void> {
    await this.redis.set(
      this.cacheKey(tenantId, userId),
      JSON.stringify(access),
      'EX',
      RBAC_CACHE_TTL_SECONDS,
    );
  }

  private async invalidateUser(tenantId: string, userId: string): Promise<void> {
    await this.redis.del(this.cacheKey(tenantId, userId));
  }

  async invalidateTenant(tenantId: string): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `rbac:perm:${tenantId}:*`,
        'COUNT',
        100,
      );
      cursor = next;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }
}
