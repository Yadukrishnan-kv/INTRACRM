import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { followUpsApi, keys } from './api';
import { AssigneeFilter, CallButton } from './components';
import { chunkWeeks, defaultSelectedDay, isMonthKey, longDate, monthLabel, shiftMonth, typeTitle, WEEKDAY_LABELS } from './logic';
import { FOLLOW_UP_TYPES, type CalendarMonth, type FollowUp } from './types';
import './followups.css';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Follow-up reminders: month grid of per-day counts with the selected day's agenda (mobile's FollowUpCalendarPage). */
export function FollowUpCalendarPage() {
  const [params, setParams] = useSearchParams();
  const { can } = useAuth();
  const monthParam = params.get('month');
  const month = isMonthKey(monthParam) ? monthParam : undefined;
  const assignee = params.get('assignee') ?? '';
  const type = params.get('type') ?? '';
  const dayParam = params.get('day');

  const set = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );

  const calendar = useQuery({
    queryKey: keys.calendar(month ?? '', assignee, type),
    queryFn: () => followUpsApi.calendar(month, assignee || undefined, type || undefined),
  });

  return (
    <>
      <PageHeader
        title="Follow-up calendar"
        actions={
          <div className="btn-row">
            <Link className="btn btn-ghost" to="/tasks">
              List
            </Link>
            {can(P.followUpCreate) ? (
              <Link className="btn btn-primary" to="/tasks/create">
                New follow-up
              </Link>
            ) : null}
          </div>
        }
      />
      <div className="toolbar">
        <AssigneeFilter value={assignee} onChange={(v) => set({ assignee: v || null })} />
        <select className="input" aria-label="Type" value={type} onChange={(e) => set({ type: e.target.value || null })}>
          <option value="">Any type</option>
          {FOLLOW_UP_TYPES.map((t) => (
            <option key={t} value={t}>
              {typeTitle(t)}
            </option>
          ))}
        </select>
      </div>

      {calendar.isLoading ? (
        <Spinner />
      ) : calendar.isError || !calendar.data ? (
        <ErrorState error={calendar.error} onRetry={() => calendar.refetch()} />
      ) : (
        <CalendarBody
          month={calendar.data}
          selected={dayParam && YMD.test(dayParam) ? dayParam : defaultSelectedDay(calendar.data)}
          onSelect={(day) => set({ day })}
          onStep={(delta) => set({ month: shiftMonth(calendar.data.month, delta), day: null })}
          onToday={() => set({ month: null, day: null })}
          assignee={assignee}
          type={type}
        />
      )}
    </>
  );
}

function CalendarBody({
  month,
  selected,
  onSelect,
  onStep,
  onToday,
  assignee,
  type,
}: {
  month: CalendarMonth;
  selected: string;
  onSelect: (day: string) => void;
  onStep: (delta: number) => void;
  onToday: () => void;
  assignee: string;
  type: string;
}) {
  const day = month.days.find((d) => d.date === selected);
  const [year] = month.month.split('-');
  return (
    <div className="followups-cal-layout">
      <section className="card">
        <div className="followups-cal-head">
          <button type="button" className="icon-btn followups-cal-nav" aria-label="Previous month" onClick={() => onStep(-1)}>
            ‹
          </button>
          <div className="followups-cal-title">
            <strong>{monthLabel(month.month).replace(` ${year}`, '')}</strong>
            <span className="muted small">{year}</span>
          </div>
          <div className="btn-row followups-cal-head-end">
            {month.today < month.monthStart || month.today > month.monthEnd ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onToday}>
                Today
              </button>
            ) : null}
            <button type="button" className="icon-btn followups-cal-nav" aria-label="Next month" onClick={() => onStep(1)}>
              ›
            </button>
          </div>
        </div>
        <div className="followups-cal-grid" role="grid" aria-label={monthLabel(month.month)}>
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="followups-cal-weekday" role="columnheader">
              {w}
            </div>
          ))}
          {chunkWeeks(month.days).flatMap((week) =>
            week.map((d) => {
              const cls = [
                'followups-cal-day',
                d.inMonth ? '' : 'followups-cal-day-out',
                d.isToday ? 'followups-cal-day-today' : '',
                d.date === selected ? 'followups-cal-day-selected' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={d.date}
                  type="button"
                  role="gridcell"
                  aria-selected={d.date === selected}
                  aria-label={`${longDate(d.date)}: ${d.total} follow-up${d.total === 1 ? '' : 's'}`}
                  className={cls}
                  onClick={() => onSelect(d.date)}
                >
                  {Number(d.date.slice(8, 10))}
                  {d.total > 0 && d.band ? <span className={`followups-cal-count followups-band-${d.band}`}>{d.total}</span> : null}
                </button>
              );
            }),
          )}
        </div>
        <div className="followups-legend">
          <span>
            <i className="followups-dot followups-band-overdue" /> Overdue · {month.totals.overdue}
          </span>
          <span>
            <i className="followups-dot followups-band-due" /> Due · {month.totals.due}
          </span>
          <span>
            <i className="followups-dot followups-band-completed" /> Completed · {month.totals.completed}
          </span>
        </div>
      </section>

      <section>
        <div className="followups-agenda-head">
          <strong>{longDate(selected)}</strong>
          <span className="muted small">
            {day?.total ?? 0} event{(day?.total ?? 0) === 1 ? '' : 's'}
          </span>
        </div>
        <DayAgenda day={selected} assignee={assignee} type={type} />
      </section>
    </div>
  );
}

function DayAgenda({ day, assignee, type }: { day: string; assignee: string; type: string }) {
  const agenda = useQuery({
    queryKey: keys.day(day, assignee, type),
    queryFn: () =>
      followUpsApi
        .list({ dueOn: day, assignedToMembershipId: assignee || undefined, type: type || undefined }, undefined, 100)
        .then((r) => r.data),
  });
  if (agenda.isLoading) return <Spinner />;
  if (agenda.isError) return <ErrorState error={agenda.error} onRetry={() => agenda.refetch()} />;
  const items = agenda.data ?? [];
  if (items.length === 0) return <EmptyState>No follow-ups on this day.</EmptyState>;
  return (
    <div className="followups-agenda">
      {items.map((item) => (
        <AgendaItem key={item.id} item={item} />
      ))}
    </div>
  );
}

function AgendaItem({ item }: { item: FollowUp }) {
  const navigate = useNavigate();
  const accent = item.status === 'completed' ? 'completed' : item.overdue ? 'overdue' : 'due';
  const customer = item.leadCustomerName ?? item.leadTitle ?? item.title;
  const company = item.leadTitle && item.leadTitle !== customer ? item.leadTitle : null;
  const time = new Date(item.dueAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <div
      className={`card followups-agenda-item followups-accent-${accent}`}
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/tasks/${item.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(`/tasks/${item.id}`);
      }}
    >
      <div className="followups-agenda-main">
        <strong>{customer}</strong>
        {company ? <div className="muted small">{company}</div> : null}
        <div className="followups-agenda-meta small">
          <span>{time}</span>
          <Badge value={typeTitle(item.type)} tone="neutral" />
          {item.status !== 'pending' ? <Badge value={item.status} /> : null}
          {item.assigneeName ? <span className="muted">{item.assigneeName}</span> : null}
        </div>
      </div>
      <CallButton leadId={item.leadId} phone={item.leadPhone} />
    </div>
  );
}
