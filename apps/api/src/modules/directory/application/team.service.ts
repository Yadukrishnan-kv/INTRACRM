import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateTeamRequest,
  ReplaceTeamMembersRequest,
  UpdateTeamRequest,
} from '../interface/http/dto/staff.dto';

export type TeamView = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  memberCount: number;
  members: Array<{
    id: string;
    fullName: string;
    email: string | null;
    status: string;
  }>;
};

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<TeamView[]> {
    const rows = await this.prisma.team.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        members: {
          include: { membership: { include: { user: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => this.toView(row));
  }

  async get(tenantId: string, teamId: string): Promise<TeamView> {
    return this.toView(await this.requireTeam(tenantId, teamId));
  }

  async create(actor: AuthUser, dto: CreateTeamRequest): Promise<TeamView> {
    const tenantId = this.requireTenant(actor);
    const existing = await this.prisma.team.findFirst({
      where: { tenantId, code: dto.code, deletedAt: null },
    });
    if (existing) {
      throw new AppException(HttpStatus.CONFLICT, 'Team already exists', {
        code: ErrorCodes.CONFLICT,
        detail: 'A team with this code already exists.',
      });
    }
    const created = await this.prisma.team.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        isActive: true,
        createdBy: actor.userId,
      },
      include: {
        members: { include: { membership: { include: { user: true } } } },
      },
    });
    return this.toView(created);
  }

  async update(
    actor: AuthUser,
    teamId: string,
    dto: UpdateTeamRequest,
  ): Promise<TeamView> {
    const tenantId = this.requireTenant(actor);
    const team = await this.requireTeam(tenantId, teamId);
    const updated = await this.prisma.team.update({
      where: { id: team.id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
      include: {
        members: { include: { membership: { include: { user: true } } } },
      },
    });
    return this.toView(updated);
  }

  async remove(actor: AuthUser, teamId: string): Promise<{ deleted: true }> {
    const tenantId = this.requireTenant(actor);
    const team = await this.requireTeam(tenantId, teamId);
    await this.prisma.$transaction(async (tx) => {
      await tx.teamMember.deleteMany({ where: { teamId: team.id } });
      await tx.membership.updateMany({
        where: { tenantId, teamId: team.id, deletedAt: null },
        data: { teamId: null, updatedBy: actor.userId, version: { increment: 1 } },
      });
      await tx.team.update({
        where: { id: team.id },
        data: {
          deletedAt: new Date(),
          deletedBy: actor.userId,
          isActive: false,
          version: { increment: 1 },
        },
      });
    });
    return { deleted: true };
  }

  async replaceMembers(
    actor: AuthUser,
    teamId: string,
    dto: ReplaceTeamMembersRequest,
  ): Promise<TeamView> {
    const tenantId = this.requireTenant(actor);
    const team = await this.requireTeam(tenantId, teamId);
    const uniqueIds = [...new Set(dto.membershipIds)];
    const memberships = await this.prisma.membership.findMany({
      where: { id: { in: uniqueIds }, tenantId, deletedAt: null },
    });
    if (memberships.length !== uniqueIds.length) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Invalid members', {
        code: ErrorCodes.VALIDATION_ERROR,
        detail: 'One or more staff members are not in this tenant.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.teamMember.deleteMany({ where: { teamId: team.id } });
      if (uniqueIds.length > 0) {
        await tx.teamMember.createMany({
          data: uniqueIds.map((membershipId) => ({
            teamId: team.id,
            membershipId,
            createdBy: actor.userId,
          })),
        });
      }
      await tx.membership.updateMany({
        where: { tenantId, teamId: team.id, id: { notIn: uniqueIds } },
        data: { teamId: null, updatedBy: actor.userId, version: { increment: 1 } },
      });
      if (uniqueIds.length > 0) {
        await tx.membership.updateMany({
          where: { id: { in: uniqueIds }, tenantId },
          data: { teamId: team.id, updatedBy: actor.userId, version: { increment: 1 } },
        });
      }
    });
    return this.get(tenantId, team.id);
  }

  async requireTeams(tenantId: string, teamIds: string[]) {
    const unique = [...new Set(teamIds)];
    if (unique.length === 0) {
      return [];
    }
    const teams = await this.prisma.team.findMany({
      where: { id: { in: unique }, tenantId, deletedAt: null, isActive: true },
    });
    if (teams.length !== unique.length) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Invalid teams', {
        code: ErrorCodes.VALIDATION_ERROR,
        detail: 'One or more teams are unknown or inactive.',
      });
    }
    return teams;
  }

  private async requireTeam(tenantId: string, teamId: string) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, tenantId, deletedAt: null },
      include: {
        members: { include: { membership: { include: { user: true } } } },
      },
    });
    if (!team) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Not found', {
        code: ErrorCodes.NOT_FOUND,
        detail: 'Team not found.',
      });
    }
    return team;
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
    code: string;
    name: string;
    isActive: boolean;
    members: Array<{
      membership: {
        id: string;
        status: string;
        deletedAt: Date | null;
        user: { fullName: string; email: string | null };
      };
    }>;
  }): TeamView {
    const live = row.members.filter((item) => item.membership.deletedAt === null);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.isActive,
      memberCount: live.length,
      members: live.map((item) => ({
        id: item.membership.id,
        fullName: item.membership.user.fullName,
        email: item.membership.user.email,
        status: item.membership.status,
      })),
    };
  }
}
