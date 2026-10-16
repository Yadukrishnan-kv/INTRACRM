// Building blocks shared by every report page (local to this module).
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { useToast } from '../../components/toast';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { EXPORT_FORMATS, reportsApi, type ExportDataset, type ExportFormat, type ReportQuery } from './api';
import { PRESETS, describeRange, type DateMode, type PresetKey } from './dates';
import { END_PARAM, RANGE_PARAM, START_PARAM, barPercent, buildReportQuery, type ReportFilterState } from './logic';
import './reports.css';

export const reportKeys = {
  report: (path: string, query: ReportQuery) => ['reports', path, query] as const,
  lookups: ['reports', 'lookups'] as const,
  incentivePlans: ['reports', 'incentive-plans'] as const,
};

/** URL-backed filter state + the API query it produces. */
export function useReportFilters(mode: DateMode, extraKeys: readonly string[] = [], defaultPreset: PresetKey = 'all') {
  const [params, setParams] = useSearchParams();
  const today = new Date().toDateString();
  const key = params.toString();
  const state: ReportFilterState = useMemo(() => buildReportQuery(params, mode, extraKeys, new Date(), defaultPreset), [key, mode, today, defaultPreset]);

  const setMany = (values: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(values)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );

  return {
    ...state,
    setParam: (k: string, v: string) => setMany({ [k]: v }),
    setPreset: (preset: PresetKey) =>
      setMany({ [RANGE_PARAM]: preset === defaultPreset ? '' : preset, ...(preset === 'custom' ? {} : { [START_PARAM]: '', [END_PARAM]: '' }) }),
    setCustom: (from: string, to: string) => setMany({ [RANGE_PARAM]: 'custom', [START_PARAM]: from, [END_PARAM]: to }),
    clear: () => setParams(new URLSearchParams(), { replace: true }),
    hasFilters: key.length > 0,
  };
}

export type ReportFilters = ReturnType<typeof useReportFilters>;

export function useReport<T>(path: string, query: ReportQuery, enabled = true) {
  return useQuery({
    queryKey: reportKeys.report(path, query),
    queryFn: () => reportsApi.report<T>(path, query),
    enabled,
  });
}

/** Staff + pipelines for filter dropdowns; /leads/lookups needs lead:read. */
export function useReportLookups() {
  const { can } = useAuth();
  return useQuery({
    queryKey: reportKeys.lookups,
    queryFn: reportsApi.lookups,
    staleTime: 5 * 60_000,
    enabled: can(P.leadRead),
  });
}

export function DateRangeFilter({ filters }: { filters: ReportFilters }) {
  return (
    <>
      <select
        className="input"
        aria-label="Date range"
        value={filters.preset}
        onChange={(e) => filters.setPreset(e.target.value as PresetKey)}
      >
        {PRESETS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
      {filters.preset === 'custom' ? (
        <>
          <input
            type="date"
            className="input"
            aria-label="From date"
            value={filters.custom.from}
            max={filters.custom.to || undefined}
            onChange={(e) => filters.setCustom(e.target.value, filters.custom.to)}
          />
          <input
            type="date"
            className="input"
            aria-label="To date"
            value={filters.custom.to}
            min={filters.custom.from || undefined}
            onChange={(e) => filters.setCustom(filters.custom.from, e.target.value)}
          />
        </>
      ) : null}
    </>
  );
}

/** Staff dropdown bound to a URL param; hidden when lookups are unavailable. */
export function StaffFilter({ filters, param, label = 'All staff' }: { filters: ReportFilters; param: string; label?: string }) {
  const lookups = useReportLookups();
  const staff = lookups.data?.staff ?? [];
  if (!staff.length) return null;
  return (
    <select className="input" aria-label={label} value={filters.extras[param] ?? ''} onChange={(e) => filters.setParam(param, e.target.value)}>
      <option value="">{label}</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.fullName}
        </option>
      ))}
    </select>
  );
}

export function SelectFilter({
  filters,
  param,
  label,
  options,
}: {
  filters: ReportFilters;
  param: string;
  label: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <select className="input" aria-label={label} value={filters.extras[param] ?? ''} onChange={(e) => filters.setParam(param, e.target.value)}>
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ChipFilter({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="btn-row chip-scroll reports-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value || 'all'}
          type="button"
          className={`chip${value === o.value ? ' chip-active' : ''}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({ filters, children }: { filters?: ReportFilters; children: ReactNode }) {
  return (
    <div className="toolbar reports-toolbar">
      {children}
      {filters?.hasFilters ? (
        <button type="button" className="btn btn-ghost reports-clear" onClick={filters.clear}>
          Clear
        </button>
      ) : null}
    </div>
  );
}

export function ExportButtons({ dataset, query }: { dataset: ExportDataset; query: ReportQuery }) {
  const toast = useToast();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const run = async (format: ExportFormat) => {
    setBusy(format);
    try {
      await reportsApi.exportReport(dataset, format, query);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="btn-row reports-export" role="group" aria-label="Export report">
      {EXPORT_FORMATS.map((f) => (
        <button key={f.format} type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => run(f.format)}>
          {busy === f.format ? 'Exporting…' : f.label}
        </button>
      ))}
    </div>
  );
}

type ReportPageProps<T> = {
  title: string;
  subtitle?: ReactNode;
  result: UseQueryResult<T>;
  actions?: ReactNode;
  filters?: ReactNode;
  /** Describes the active date range under the title. */
  rangeFilters?: ReportFilters;
  isEmpty?: (data: T) => boolean;
  emptyMessage?: string;
  children: (data: T) => ReactNode;
};

export function ReportPage<T extends { generatedAt?: string }>({
  title,
  subtitle,
  result,
  actions,
  filters,
  rangeFilters,
  isEmpty,
  emptyMessage = 'No data for this report yet.',
  children,
}: ReportPageProps<T>) {
  const generated = result.data?.generatedAt ? `Generated ${formatDateTime(result.data.generatedAt)}` : null;
  const rangeText = rangeFilters ? describeRange(rangeFilters.range) : null;
  const sub = subtitle ?? ([rangeText, generated].filter(Boolean).join(' · ') || undefined);
  return (
    <>
      <Link className="back-link" to="/reports">
        ← Reports
      </Link>
      <PageHeader
        title={title}
        subtitle={sub}
        actions={
          <>
            {actions}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => result.refetch()} disabled={result.isFetching}>
              {result.isFetching && !result.isLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </>
        }
      />
      {filters}
      {result.isLoading ? (
        <Spinner />
      ) : result.isError ? (
        <ErrorState error={result.error} onRetry={() => result.refetch()} />
      ) : result.data === undefined ? (
        <EmptyState>{emptyMessage}</EmptyState>
      ) : isEmpty?.(result.data) ? (
        <EmptyState>{emptyMessage}</EmptyState>
      ) : (
        <div className="stack">{children(result.data)}</div>
      )}
    </>
  );
}

export type Metric = { label: string; value: ReactNode; tone?: 'success' | 'danger' | 'warning' | 'info' };

/** Headline tiles (label on top, value at the bottom, as the dashboard KPI tiles). */
export function MetricGrid({ items }: { items: Metric[] }) {
  return (
    <div className="reports-metrics">
      {items.map((m) => (
        <div key={m.label} className={`card reports-metric${m.tone ? ` reports-metric-${m.tone}` : ''}`}>
          <span className="reports-metric-label">{m.label}</span>
          <span className="reports-metric-value">{m.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Long metric lists: the first `limit` as tiles, the rest as a compact facts list. */
export function MetricWall({ items, limit = 6, title = 'More figures' }: { items: Metric[]; limit?: number; title?: string }) {
  const rest = items.slice(limit);
  return (
    <>
      <MetricGrid items={items.slice(0, limit)} />
      {rest.length ? (
        <Section title={title}>
          <dl className="reports-facts">
            {rest.map((m) => (
              <div key={m.label}>
                <dt>{m.label}</dt>
                <dd className={m.tone ? `reports-fact-${m.tone}` : undefined}>{m.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}
    </>
  );
}

export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  num?: boolean;
};

/** Titled breakdown table; `bar` adds an inline relative bar to the first column. */
export function BreakdownTable<T>({
  title,
  rows,
  columns,
  rowKey,
  bar,
  empty = 'Nothing to show.',
  footer,
}: {
  title: string;
  rows: readonly T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  bar?: (row: T) => number;
  empty?: string;
  footer?: ReactNode;
}) {
  const max = bar ? rows.reduce((acc, r) => Math.max(acc, bar(r) || 0), 0) : 0;
  return (
    <section className="card reports-section">
      <h2 className="reports-section-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="muted reports-empty">{empty}</p>
      ) : (
        <div className="table-wrap">
          <table className="table reports-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.header} className={c.num ? 'num' : undefined}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={rowKey(row, i)}>
                  {columns.map((c, ci) => (
                    <td key={c.header} className={c.num ? 'num' : undefined} data-label={c.header}>
                      {c.cell(row)}
                      {bar && ci === 0 ? <Bar percent={barPercent(bar(row), max)} /> : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {footer ? <tfoot>{footer}</tfoot> : null}
          </table>
        </div>
      )}
    </section>
  );
}

export function Bar({ percent, color }: { percent: number; color?: string }) {
  return (
    <div className="bar reports-bar" aria-hidden>
      <span style={{ width: `${percent}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card reports-section">
      <div className="reports-section-head">
        <h2 className="reports-section-title">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
