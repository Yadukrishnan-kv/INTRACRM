import { Injectable } from '@nestjs/common';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { StaffService, StaffView } from './staff.service';

export type StaffReportView = {
  generatedAt: string;
  totals: {
    total: number;
    active: number;
    inactive: number;
    invited: number;
  };
  byRole: Array<{ roleId: string; roleCode: string; roleName: string; count: number }>;
  byTeam: Array<{ teamId: string; teamName: string; count: number }>;
  unassignedTeam: number;
  roster: Array<{
    id: string;
    fullName: string;
    email: string | null;
    status: string;
    active: boolean;
    designation: string | null;
    roles: string[];
    teams: string[];
  }>;
};

@Injectable()
export class StaffReportService {
  constructor(private readonly staff: StaffService) {}

  async build(actor: AuthUser): Promise<StaffReportView> {
    const roster = await this.staff.list(actor, {});
    return summarizeStaff(roster);
  }
}

export function summarizeStaff(roster: StaffView[]): StaffReportView {
  const byRole = new Map<string, { roleId: string; roleCode: string; roleName: string; count: number }>();
  const byTeam = new Map<string, { teamId: string; teamName: string; count: number }>();
  let unassignedTeam = 0;
  for (const row of roster) {
    if (row.roles.length === 0) {
      const key = 'unassigned';
      const current = byRole.get(key) ?? {
        roleId: key,
        roleCode: 'unassigned',
        roleName: 'Unassigned',
        count: 0,
      };
      current.count += 1;
      byRole.set(key, current);
    }
    for (const role of row.roles) {
      const current = byRole.get(role.id) ?? {
        roleId: role.id,
        roleCode: role.code,
        roleName: role.name,
        count: 0,
      };
      current.count += 1;
      byRole.set(role.id, current);
    }
    if (row.teams.length === 0) {
      unassignedTeam += 1;
    }
    for (const team of row.teams) {
      const current = byTeam.get(team.id) ?? {
        teamId: team.id,
        teamName: team.name,
        count: 0,
      };
      current.count += 1;
      byTeam.set(team.id, current);
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      total: roster.length,
      active: roster.filter((row) => row.status === 'active').length,
      inactive: roster.filter((row) => row.status === 'suspended').length,
      invited: roster.filter((row) => row.status === 'invited').length,
    },
    byRole: [...byRole.values()].sort((a, b) => b.count - a.count),
    byTeam: [...byTeam.values()].sort((a, b) => b.count - a.count),
    unassignedTeam,
    roster: roster.map((row) => ({
      id: row.id,
      fullName: row.user.fullName,
      email: row.user.email,
      status: row.status,
      active: row.active,
      designation: row.designation,
      roles: row.roles.map((role) => role.name),
      teams: row.teams.map((team) => team.name),
    })),
  };
}
