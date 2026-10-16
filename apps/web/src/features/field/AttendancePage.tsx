import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { TextField } from '../../components/form';
import { Tabs } from '../../components/Tabs';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatDate, formatDateTime } from '../../lib/format';
import { useApiMutation } from '../../lib/hooks';
import { fieldApi } from './api';
import { locate } from './location';
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_TONE,
  defaultAttendanceRange,
  formatClock,
  formatMinutes,
  geoLabel,
  validateRange,
} from './logic';
import type { AttendanceDay, GeoPoint } from './types';
import './field.css';

export function AttendancePage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const canTeam = can(P.attendanceReadTeam);
  const tab = canTeam && params.get('tab') === 'team' ? 'team' : 'mine';
  const setTab = (next: string) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'mine') p.delete('tab');
      else p.set('tab', next);
      return p;
    });

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle="Punch in and out with GPS, and review your working days."
        actions={
          <Link to="/reports/attendance" className="btn btn-ghost">
            Attendance report
          </Link>
        }
      />
      {canTeam ? (
        <Tabs
          tabs={[
            { id: 'mine', label: 'My attendance' },
            { id: 'team', label: 'Team' },
          ]}
          active={tab}
          onChange={setTab}
        />
      ) : null}
      {tab === 'team' ? <TeamAttendance /> : <MyAttendance />}
    </>
  );
}

function MyAttendance() {
  const { can } = useAuth();
  const today = useQuery({ queryKey: ['attendance', 'today'], queryFn: fieldApi.attendanceToday });
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const after = { invalidate: [['attendance']] };
  const punchIn = useApiMutation((location: GeoPoint) => fieldApi.punchIn({ location }), {
    ...after,
    success: 'Punched in',
  });
  const punchOut = useApiMutation((location: GeoPoint) => fieldApi.punchOut({ location }), {
    ...after,
    success: 'Punched out',
  });

  const punch = async (punchingIn: boolean) => {
    setGeoBusy(true);
    const result = await locate();
    setGeoBusy(false);
    if (!result.ok) {
      setGeoError(result.message);
      return;
    }
    setGeoError(null);
    (punchingIn ? punchIn : punchOut).mutate(result.point);
  };

  const busy = geoBusy || punchIn.isPending || punchOut.isPending;
  const data = today.data;

  return (
    <div className="stack">
      {geoError ? (
        <div className="field-geo-alert" role="alert">
          <span>{geoError}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGeoError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="card">
        {today.isLoading ? (
          <Spinner />
        ) : today.isError || !data ? (
          <ErrorState error={today.error} onRetry={() => today.refetch()} />
        ) : (
          <>
            <div className="field-today">
              <div className="field-today-status">
                <h2>
                  Today <Badge value={ATTENDANCE_LABELS[data.today.status] ?? data.today.status} tone={ATTENDANCE_TONE[data.today.status]} />
                </h2>
                <span>
                  {data.open
                    ? `Punched in at ${formatClock(data.open.punchedInAt)} · ${formatMinutes(data.open.minutesWorked)}`
                    : `Not punched in · late after ${data.lateAfter}`}
                </span>
                {data.open?.inLocation ? <span className="muted small">GPS {geoLabel(data.open.inLocation)}</span> : null}
                <span className="muted small">
                  Worked today {formatMinutes(data.today.minutesWorked)} · {data.timezone}
                </span>
              </div>
              {can(P.attendancePunch) ? (
                <button
                  type="button"
                  className={`btn ${data.open ? 'btn-danger' : 'btn-primary'} field-punch`}
                  onClick={() => punch(!data.open)}
                  disabled={busy}
                >
                  {busy ? (geoBusy ? 'Locating…' : 'Saving…') : data.open ? 'Punch out' : 'Punch in'}
                </button>
              ) : null}
            </div>
            {data.today.sessions.length > 0 ? (
              <>
                <h3>Today’s sessions</h3>
                <SessionList day={data.today} />
              </>
            ) : null}
          </>
        )}
      </section>

      <DaysSection title="My working days" membershipId={undefined} />
    </div>
  );
}

function SessionList({ day }: { day: AttendanceDay }) {
  return (
    <ul className="list">
      {day.sessions.map((s) => (
        <li key={s.id}>
          <div className="list-row">
            <strong>
              {formatClock(s.punchedInAt)} – {s.punchedOutAt ? formatClock(s.punchedOutAt) : 'now'}
            </strong>
            <span className="small">{formatMinutes(s.minutesWorked)}</span>
          </div>
          <span className="muted small">
            In {geoLabel(s.inLocation)}
            {s.punchedOutAt ? ` · Out ${geoLabel(s.outLocation)}` : ''}
          </span>
          {s.notes ? <span className="small prewrap">{s.notes}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function RangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  const error = validateRange(from, to);
  return (
    <div className="field-range">
      <TextField label="From" type="date" value={from} max={to} onValue={(v) => onChange({ from: v, to })} />
      <TextField label="To" type="date" value={to} min={from} onValue={(v) => onChange({ from, to: v })} error={error ?? undefined} />
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(defaultAttendanceRange())}>
        Last 14 days
      </button>
    </div>
  );
}

function DaysSection({
  title,
  membershipId,
  onClose,
  closeLabel,
  scrollIntoView,
}: {
  title: string;
  membershipId: string | undefined;
  onClose?: () => void;
  closeLabel?: string;
  scrollIntoView?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (scrollIntoView) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [scrollIntoView]);
  const [range, setRange] = useState(defaultAttendanceRange);
  const valid = validateRange(range.from, range.to) === null;
  const days = useQuery({
    queryKey: ['attendance', 'days', membershipId ?? 'me', range.from, range.to],
    queryFn: () => fieldApi.attendanceDays({ ...range, membershipId }),
    enabled: valid,
    placeholderData: keepPreviousData,
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const items = [...(days.data?.items ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section className="card" ref={ref}>
      <div className="card-head">
        <h2>{title}</h2>
        {onClose ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label={closeLabel}>
            Close
          </button>
        ) : null}
      </div>
      <RangePicker from={range.from} to={range.to} onChange={setRange} />
      {days.isLoading ? (
        <Spinner />
      ) : days.isError ? (
        <ErrorState error={days.error} onRetry={() => days.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState>No days yet</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>First in</th>
                <th>Last out</th>
                <th className="num">Worked</th>
                <th className="num">Sessions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((day) => (
                <DayRow
                  key={day.date}
                  day={day}
                  expanded={expanded === day.date}
                  onToggle={() => setExpanded((d) => (d === day.date ? null : day.date))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DayRow({ day, expanded, onToggle }: { day: AttendanceDay; expanded: boolean; onToggle: () => void }) {
  const hasSessions = day.sessions.length > 0;
  return (
    <>
      <tr className={hasSessions ? 'row-link' : undefined} onClick={hasSessions ? onToggle : undefined} aria-expanded={hasSessions ? expanded : undefined}>
        <td>{formatDate(`${day.date}T00:00:00`)}</td>
        <td>
          <Badge value={ATTENDANCE_LABELS[day.status] ?? day.status} tone={ATTENDANCE_TONE[day.status]} />
        </td>
        <td>{formatClock(day.firstInAt)}</td>
        <td>{formatClock(day.lastOutAt)}</td>
        <td className="num">{formatMinutes(day.minutesWorked)}</td>
        <td className="num">{day.sessions.length}</td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={6} className="field-sessions-cell">
            <SessionList day={day} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function TeamAttendance() {
  const [range, setRange] = useState(defaultAttendanceRange);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const valid = validateRange(range.from, range.to) === null;
  const report = useQuery({
    queryKey: ['attendance', 'team', range.from, range.to],
    queryFn: () => fieldApi.attendanceTeam(range),
    enabled: valid,
    placeholderData: keepPreviousData,
  });
  const data = report.data;
  const rows = [...(data?.byStaff ?? [])].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  return (
    <div className="stack">
      <section className="card">
        <RangePicker from={range.from} to={range.to} onChange={setRange} />
        {report.isLoading ? (
          <Spinner />
        ) : report.isError || !data ? (
          <ErrorState error={report.error} onRetry={() => report.refetch()} />
        ) : (
          <>
            <div className="kpi-grid field-kpis">
              <Stat label="Staff" value={String(data.totals.staffCount)} />
              <Stat label="Present days" value={String(data.totals.presentDays)} />
              <Stat label="Late days" value={String(data.totals.lateDays)} />
              <Stat label="Punched in now" value={String(data.totals.openNow)} />
              <Stat label="Hours worked" value={String(Math.round(data.totals.hoursWorked * 10) / 10)} />
            </div>
            <p className="muted small">
              {data.timezone} · late after {data.lateAfter} · generated {formatDateTime(data.generatedAt)}
            </p>
          </>
        )}
      </section>

      {data ? (
        <section className="card table-wrap">
          {rows.length === 0 ? (
            <EmptyState>No attendance in this range.</EmptyState>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th className="num">Present</th>
                  <th className="num">Late</th>
                  <th>Now</th>
                  <th className="num">Worked</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.membershipId}
                    className="row-link"
                    aria-selected={selected?.id === r.membershipId}
                    onClick={() => setSelected({ id: r.membershipId, name: r.name ?? 'Staff' })}
                  >
                    <td>
                      <button type="button" className="field-link-btn">
                        {r.name ?? '—'}
                      </button>
                    </td>
                    <td className="num">{r.presentDays}</td>
                    <td className="num">{r.lateDays}</td>
                    <td>{r.openNow > 0 ? <Badge value="Punched in" tone="info" /> : <span className="muted">—</span>}</td>
                    <td className="num">{formatMinutes(r.minutesWorked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {selected ? (
        <DaysSection
          key={selected.id}
          title={`${selected.name} · working days`}
          membershipId={selected.id}
          onClose={() => setSelected(null)}
          closeLabel={`Close ${selected.name}`}
          scrollIntoView
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="muted small">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
