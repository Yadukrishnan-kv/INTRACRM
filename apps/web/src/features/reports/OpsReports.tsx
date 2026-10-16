// Warranty, site-visit, attendance, staff and track (audit) reports.
import { Badge } from '../../components/ui';
import { formatCount, humanize } from '../../lib/format';
import type { AttendanceReport, SiteVisitReport, StaffReport, TrackReport, WarrantyReport } from './types';
import {
  BreakdownTable,
  DateRangeFilter,
  ExportButtons,
  FilterBar,
  MetricGrid,
  MetricWall,
  ReportPage,
  SelectFilter,
  StaffFilter,
  useReport,
  useReportFilters,
} from './kit';
import { formatMinutes, resourceLabel } from './logic';

export function WarrantyReportPage() {
  const result = useReport<WarrantyReport>('/reports/warranties', {});
  return (
    <ReportPage title="Warranty report" result={result}>
      {(r) => (
        <>
          <MetricGrid
            items={[
              { label: 'Total', value: formatCount(r.totals.total) },
              { label: 'Active', value: formatCount(r.totals.active), tone: 'success' },
              { label: 'Expired', value: formatCount(r.totals.expired), tone: 'warning' },
              { label: 'Claimed', value: formatCount(r.totals.claimed), tone: 'info' },
              { label: 'Void', value: formatCount(r.totals.void), tone: 'danger' },
            ]}
          />
          {r.byStatus?.length ? (
            <BreakdownTable
              title="By status"
              rows={r.byStatus}
              rowKey={(x) => x.status}
              bar={(x) => x.count}
              columns={[
                { header: 'Status', cell: (x) => <Badge value={x.status} /> },
                { header: 'Warranties', cell: (x) => formatCount(x.count), num: true },
              ]}
            />
          ) : null}
        </>
      )}
    </ReportPage>
  );
}

export function SiteVisitReportPage() {
  const filters = useReportFilters('instant', ['assignedToMembershipId']);
  const result = useReport<SiteVisitReport>('/reports/site-visits', filters.query);
  return (
    <ReportPage
      title="Site visit report"
      result={result}
      rangeFilters={filters}
      filters={
        <FilterBar filters={filters}>
          <DateRangeFilter filters={filters} />
          <StaffFilter filters={filters} param="assignedToMembershipId" label="All assignees" />
        </FilterBar>
      }
    >
      {(r) => (
        <>
          <MetricWall
            title="Visit details"
            items={[
              { label: 'Total', value: formatCount(r.totals.total) },
              { label: 'Scheduled', value: formatCount(r.totals.scheduled), tone: 'info' },
              { label: 'In progress', value: formatCount(r.totals.inProgress), tone: 'warning' },
              { label: 'Completed', value: formatCount(r.totals.completed), tone: 'success' },
              { label: 'Cancelled', value: formatCount(r.totals.cancelled) },
              { label: 'No show', value: formatCount(r.totals.noShow), tone: r.totals.noShow ? 'danger' : undefined },
              { label: 'With GPS', value: formatCount(r.totals.withGps) },
              { label: 'With photos', value: formatCount(r.totals.withPhotos) },
              { label: 'With feedback', value: formatCount(r.totals.withFeedback) },
              { label: 'Avg rating', value: r.totals.averageRating == null ? '—' : r.totals.averageRating.toFixed(1) },
            ]}
          />
          <BreakdownTable
            title="By status"
            rows={r.byStatus}
            rowKey={(x) => x.status}
            bar={(x) => x.count}
            columns={[
              { header: 'Status', cell: (x) => <Badge value={x.status} /> },
              { header: 'Visits', cell: (x) => formatCount(x.count), num: true },
            ]}
          />
          <BreakdownTable
            title="By assignee"
            rows={r.byAssignee}
            rowKey={(x) => x.membershipId}
            bar={(x) => x.total}
            columns={[
              { header: 'Assignee', cell: (x) => x.name ?? x.membershipId },
              { header: 'Total', cell: (x) => formatCount(x.total), num: true },
              { header: 'Completed', cell: (x) => formatCount(x.completed), num: true },
              { header: 'GPS', cell: (x) => formatCount(x.withGps), num: true },
              { header: 'No-show', cell: (x) => formatCount(x.noShow), num: true },
              { header: 'Rating', cell: (x) => (x.averageRating == null ? '—' : `${x.averageRating.toFixed(1)}★`), num: true },
            ]}
          />
        </>
      )}
    </ReportPage>
  );
}

export function AttendanceReportPage() {
  const filters = useReportFilters('ymd', ['membershipId']);
  const result = useReport<AttendanceReport>('/reports/attendance', filters.query);
  return (
    <ReportPage
      title="Attendance report"
      subtitle={result.data ? `${result.data.from} – ${result.data.to} · late after ${result.data.lateAfter} · ${result.data.timezone}` : undefined}
      result={result}
      filters={
        <FilterBar filters={filters}>
          <DateRangeFilter filters={filters} />
          <StaffFilter filters={filters} param="membershipId" />
        </FilterBar>
      }
    >
      {(r) => (
        <>
          <MetricGrid
            items={[
              { label: 'Present days', value: formatCount(r.totals.presentDays), tone: 'success' },
              { label: 'Late days', value: formatCount(r.totals.lateDays), tone: r.totals.lateDays ? 'warning' : undefined },
              { label: 'Open now', value: formatCount(r.totals.openNow), tone: 'info' },
              { label: 'Hours', value: r.totals.hoursWorked.toFixed(1) },
              { label: 'Staff', value: formatCount(r.totals.staffCount) },
            ]}
          />
          <BreakdownTable
            title="By staff"
            rows={r.byStaff}
            rowKey={(x) => x.membershipId}
            bar={(x) => x.minutesWorked}
            columns={[
              { header: 'Staff', cell: (x) => x.name ?? x.membershipId },
              { header: 'Present', cell: (x) => formatCount(x.presentDays), num: true },
              { header: 'Late', cell: (x) => formatCount(x.lateDays), num: true },
              { header: 'Open', cell: (x) => formatCount(x.openNow), num: true },
              { header: 'Worked', cell: (x) => formatMinutes(x.minutesWorked), num: true },
            ]}
          />
          <BreakdownTable
            title="By day"
            rows={r.byDay}
            rowKey={(x) => x.date}
            bar={(x) => x.present}
            columns={[
              { header: 'Date', cell: (x) => x.date },
              { header: 'Present', cell: (x) => formatCount(x.present), num: true },
              { header: 'Late', cell: (x) => formatCount(x.late), num: true },
              { header: 'Open', cell: (x) => formatCount(x.open), num: true },
            ]}
          />
        </>
      )}
    </ReportPage>
  );
}

export function StaffReportPage() {
  const result = useReport<StaffReport>('/reports/staff', {});
  return (
    <ReportPage title="Staff report" result={result}>
      {(r) => (
        <>
          <MetricGrid
            items={[
              { label: 'Total', value: formatCount(r.totals.total) },
              { label: 'Active', value: formatCount(r.totals.active), tone: 'success' },
              { label: 'Inactive', value: formatCount(r.totals.inactive), tone: 'danger' },
              { label: 'Invited', value: formatCount(r.totals.invited), tone: 'warning' },
            ]}
          />
          <div className="grid-2">
            <BreakdownTable
              title="By role"
              rows={r.byRole}
              rowKey={(x) => x.roleId}
              bar={(x) => x.count}
              columns={[
                { header: 'Role', cell: (x) => x.roleName },
                { header: 'Staff', cell: (x) => formatCount(x.count), num: true },
              ]}
            />
            <BreakdownTable
              title="By team"
              rows={[...r.byTeam, { teamId: '__none', teamName: 'No team', count: r.unassignedTeam }]}
              rowKey={(x) => x.teamId}
              bar={(x) => x.count}
              columns={[
                { header: 'Team', cell: (x) => x.teamName },
                { header: 'Staff', cell: (x) => formatCount(x.count), num: true },
              ]}
            />
          </div>
          <BreakdownTable
            title="Roster"
            rows={r.roster}
            rowKey={(x) => x.id}
            empty="No staff yet."
            columns={[
              {
                header: 'Name',
                cell: (x) => (
                  <>
                    <div>{x.fullName}</div>
                    {x.designation ? <div className="muted small">{x.designation}</div> : null}
                  </>
                ),
              },
              { header: 'Email', cell: (x) => x.email ?? '—' },
              { header: 'Status', cell: (x) => <Badge value={x.active ? 'active' : x.status || 'inactive'} /> },
              { header: 'Roles', cell: (x) => x.roles.join(', ') || '—' },
              { header: 'Teams', cell: (x) => x.teams.join(', ') || '—' },
            ]}
          />
        </>
      )}
    </ReportPage>
  );
}

const TRACK_ACTION_OPTIONS = [
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'assign', label: 'Assignments' },
  { value: 'status_change', label: 'Status changes' },
];

const TRACK_RESOURCE_OPTIONS = ['lead', 'quotation', 'follow_up'].map((value) => ({ value, label: resourceLabel(value) }));

export function TrackReportPage() {
  const filters = useReportFilters('instant', ['action', 'resourceType']);
  const result = useReport<TrackReport>('/reports/tracks', filters.query);
  return (
    <ReportPage
      title="Track report"
      result={result}
      rangeFilters={filters}
      actions={<ExportButtons dataset="tracks" query={filters.query} />}
      filters={
        <FilterBar filters={filters}>
          <DateRangeFilter filters={filters} />
          <SelectFilter filters={filters} param="action" label="All actions" options={TRACK_ACTION_OPTIONS} />
          <SelectFilter filters={filters} param="resourceType" label="All records" options={TRACK_RESOURCE_OPTIONS} />
        </FilterBar>
      }
    >
      {(r) => (
        <>
          <MetricGrid
            items={[
              { label: 'Total', value: formatCount(r.totals.total) },
              { label: 'Create', value: formatCount(r.totals.create), tone: 'success' },
              { label: 'Update', value: formatCount(r.totals.update), tone: 'info' },
              { label: 'Delete', value: formatCount(r.totals.delete), tone: 'danger' },
              { label: 'Assignments', value: formatCount(r.totals.assign) },
              { label: 'Status changes', value: formatCount(r.totals.statusChange) },
            ]}
          />
          <div className="grid-2">
            <BreakdownTable
              title="By action"
              rows={r.byAction}
              rowKey={(x) => x.action}
              bar={(x) => x.count}
              columns={[
                { header: 'Action', cell: (x) => x.name || humanize(x.action) },
                { header: 'Changes', cell: (x) => formatCount(x.count), num: true },
              ]}
            />
            <BreakdownTable
              title="By resource"
              rows={r.byResource}
              rowKey={(x) => x.resourceType}
              bar={(x) => x.count}
              columns={[
                { header: 'Record', cell: (x) => resourceLabel(x.resourceType) },
                { header: 'Changes', cell: (x) => formatCount(x.count), num: true },
              ]}
            />
          </div>
          <BreakdownTable
            title="By actor"
            rows={r.byActor}
            rowKey={(x, i) => x.actorId ?? `system-${i}`}
            bar={(x) => x.count}
            empty="No tracked changes yet"
            columns={[
              { header: 'Actor', cell: (x) => x.name ?? 'System' },
              { header: 'Changes', cell: (x) => formatCount(x.count), num: true },
            ]}
          />
          {r.byDay.length ? (
            <BreakdownTable
              title="By day"
              rows={r.byDay}
              rowKey={(x) => x.date}
              bar={(x) => x.count}
              columns={[
                { header: 'Date', cell: (x) => x.date },
                { header: 'Changes', cell: (x) => formatCount(x.count), num: true },
              ]}
            />
          ) : null}
        </>
      )}
    </ReportPage>
  );
}
