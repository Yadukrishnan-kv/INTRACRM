import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import { RbacService } from '../../identity/application/rbac.service';
import {
  AssignStaffRolesRequest,
  AssignStaffTeamsRequest,
  CreateStaffRequest,
  StaffQuery,
  StaffStatusRequest,
  UpdateStaffRequest,
} from '../interface/http/dto/staff.dto';
import { TeamService } from './team.service';

export type StaffView = {
  id: string;
  status: string;
  active: boolean;
  designation: string | null;
  employeeCode: string | null;
  user: {
    id: string;
    fullName: string;
    email: string | null;
    lastLoginAt: Date | null;
  };
  roles: Array<{ id: string; code: string; name: string }>;
  teams: Array<{ id: string; code: string; name: string }>;
};

const staffInclude = {
  user: true,
  roles: { include: { role: true } },
  teamLinks: { include: { team: true } },
  team: true,
} satisfies Prisma.MembershipInclude;

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly teams: TeamService,
  ) {}

  async list(actor: AuthUser, query: StaffQuery): Promise<StaffView[]> {
    const tenantId = this.requireTenant(actor);
    const rows = await this.prisma.membership.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.teamId
          ? { OR: [{ teamId: query.teamId }, { teamLinks: { some: { teamId: query.teamId } } }] }
          : {}),
        ...(query.roleId ? { roles: { some: { roleId: query.roleId } } } : {}),
        ...(query.q
          ? {
              OR: [
                { user: { fullName: { contains: query.q, mode: 'insensitive' } } },
                { user: { email: { contains: query.q, mode: 'insensitive' } } },
                { employeeCode: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: staffInclude,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toView(row));
  }

  async get(actor: AuthUser, membershipId: string): Promise<StaffView> {
    return this.toView(await this.requireStaff(this.requireTenant(actor), membershipId));
  }

  async create(actor: AuthUser, dto: CreateStaffRequest): Promise<StaffView> {
    const created = await this.rbac.assignUser(actor, {
      email: dto.email,
      fullName: dto.fullName,
      roleIds: dto.roleIds,
      ...(dto.designation ? { designation: dto.designation } : {}),
      ...(dto.employeeCode ? { employeeCode: dto.employeeCode } : {}),
    });
    if (dto.teamIds && dto.teamIds.length > 0) {
      await this.assignTeams(actor, created.id, { teamIds: dto.teamIds });
    }
    return this.get(actor, created.id);
  }

  async update(
    actor: AuthUser,
    membershipId: string,
    dto: UpdateStaffRequest,
  ): Promise<StaffView> {
    const tenantId = this.requireTenant(actor);
    const staff = await this.requireStaff(tenantId, membershipId);
    if (dto.email && dto.email !== staff.user.email) {
      const taken = await this.prisma.user.findFirst({
        where: { email: dto.email, deletedAt: null, id: { not: staff.userId } },
      });
      if (taken) {
        throw new AppException(HttpStatus.CONFLICT, 'Email already used', {
          code: ErrorCodes.CONFLICT,
          detail: 'Another user already uses this email.',
        });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: staff.userId },
        data: {
          ...(dto.fullName ? { fullName: dto.fullName } : {}),
          ...(dto.email ? { email: dto.email } : {}),
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await tx.membership.update({
        where: { id: staff.id },
        data: {
          ...(dto.designation !== undefined ? { designation: dto.designation } : {}),
          ...(dto.employeeCode !== undefined ? { employeeCode: dto.employeeCode } : {}),
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
    });
    if (dto.roleIds) {
      await this.rbac.assignRoles(actor, staff.id, { roleIds: dto.roleIds });
    }
    if (dto.teamIds) {
      await this.assignTeams(actor, staff.id, { teamIds: dto.teamIds });
    }
    return this.get(actor, staff.id);
  }

  async setStatus(
    actor: AuthUser,
    membershipId: string,
    dto: StaffStatusRequest,
  ): Promise<StaffView> {
    await this.rbac.updateMembership(actor, membershipId, {
      status: dto.active ? 'active' : 'suspended',
    });
    return this.get(actor, membershipId);
  }

  async assignRoles(
    actor: AuthUser,
    membershipId: string,
    dto: AssignStaffRolesRequest,
  ): Promise<StaffView> {
    await this.rbac.assignRoles(actor, membershipId, dto);
    return this.get(actor, membershipId);
  }

  async assignTeams(
    actor: AuthUser,
    membershipId: string,
    dto: AssignStaffTeamsRequest,
  ): Promise<StaffView> {
    const tenantId = this.requireTenant(actor);
    const staff = await this.requireStaff(tenantId, membershipId);
    const teams = await this.teams.requireTeams(tenantId, dto.teamIds);
    const primaryTeamId = teams[0]?.id ?? null;
    await this.prisma.$transaction(async (tx) => {
      await tx.teamMember.deleteMany({ where: { membershipId: staff.id } });
      if (teams.length > 0) {
        await tx.teamMember.createMany({
          data: teams.map((team) => ({
            teamId: team.id,
            membershipId: staff.id,
            createdBy: actor.userId,
          })),
        });
      }
      await tx.membership.update({
        where: { id: staff.id },
        data: {
          teamId: primaryTeamId,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
    });
    return this.get(actor, staff.id);
  }

  private async requireStaff(tenantId: string, membershipId: string) {
    const row = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId, deletedAt: null },
      include: staffInclude,
    });
    if (!row) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Not found', {
        code: ErrorCodes.NOT_FOUND,
        detail: 'Staff member not found.',
      });
    }
    return row;
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

  private toView(row: {
    id: string;
    status: string;
    designation: string | null;
    employeeCode: string | null;
    user: {
      id: string;
      fullName: string;
      email: string | null;
      lastLoginAt: Date | null;
    };
    roles: Array<{ role: { id: string; code: string; name: string; deletedAt: Date | null } }>;
    team: { id: string; code: string; name: string; deletedAt: Date | null } | null;
    teamLinks: Array<{
      team: { id: string; code: string; name: string; deletedAt: Date | null };
    }>;
  }): StaffView {
    const teams = new Map<string, { id: string; code: string; name: string }>();
    if (row.team && row.team.deletedAt === null) {
      teams.set(row.team.id, {
        id: row.team.id,
        code: row.team.code,
        name: row.team.name,
      });
    }
    for (const link of row.teamLinks) {
      if (link.team.deletedAt === null) {
        teams.set(link.team.id, {
          id: link.team.id,
          code: link.team.code,
          name: link.team.name,
        });
      }
    }
    return {
      id: row.id,
      status: row.status,
      active: row.status === 'active',
      designation: row.designation,
      employeeCode: row.employeeCode,
      user: {
        id: row.user.id,
        fullName: row.user.fullName,
        email: row.user.email,
        lastLoginAt: row.user.lastLoginAt,
      },
      roles: row.roles
        .filter((item) => item.role.deletedAt === null)
        .map((item) => ({
          id: item.role.id,
          code: item.role.code,
          name: item.role.name,
        })),
      teams: [...teams.values()],
    };
  }
}
