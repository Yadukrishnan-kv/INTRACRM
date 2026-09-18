import { summarizeStaff, type StaffReportView } from './staff-report.service';
import type { StaffView } from './staff.service';

function staff(partial: Partial<StaffView> & Pick<StaffView, 'id' | 'status'>): StaffView {
  return {
    active: partial.status === 'active',
    designation: null,
    employeeCode: null,
    user: {
      id: `user-${partial.id}`,
      fullName: partial.user?.fullName ?? partial.id,
      email: null,
      lastLoginAt: null,
    },
    roles: [],
    teams: [],
    ...partial,
  };
}

describe('summarizeStaff', () => {
  it('counts status, roles, and teams', () => {
    const report: StaffReportView = summarizeStaff([
      staff({
        id: '1',
        status: 'active',
        roles: [{ id: 'r1', code: 'sales.staff', name: 'Sales Staff' }],
        teams: [{ id: 't1', code: 'west', name: 'West' }],
      }),
      staff({
        id: '2',
        status: 'suspended',
        roles: [{ id: 'r1', code: 'sales.staff', name: 'Sales Staff' }],
        teams: [],
      }),
      staff({
        id: '3',
        status: 'invited',
        roles: [{ id: 'r2', code: 'tenant.admin', name: 'Admin' }],
        teams: [{ id: 't1', code: 'west', name: 'West' }],
      }),
    ]);

    expect(report.totals).toEqual({
      total: 3,
      active: 1,
      inactive: 1,
      invited: 1,
    });
    expect(report.unassignedTeam).toBe(1);
    expect(report.byRole.find((row) => row.roleCode === 'sales.staff')?.count).toBe(2);
    expect(report.byTeam[0]?.count).toBe(2);
  });
});
