import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useToast } from '../../components/toast';
import { perfApi, type AnalyticsRange } from './api';
import { deltaLabel, initials, metricDisplay, widgetPrimary } from './logic';
import type { DashboardWidget, Funnel, MixSlice, SeriesPoint } from './types';

/** Thin progress bar; `value` is 0..1. */
export function Progress({ value, tone }: { value: number; tone?: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }) {
  const width = `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%`;
  return (
    <div className={`perf-progress${tone ? ` perf-tone-${tone}` : ''}`} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width }} />
    </div>
  );
}

/** Ring showing achievement against a target. */
export function Donut({ value, label, caption, size = 112 }: { value: number; label?: string; caption?: string; size?: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const v = Math.min(Math.max(value, 0), 1);
  return (
    <div className="perf-donut" style={{ width: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        <circle cx="50" cy="50" r={r} className="perf-donut-track" />
        <circle cx="50" cy="50" r={r} className="perf-donut-value" strokeDasharray={`${v * c} ${c}`} transform="rotate(-90 50 50)" />
      </svg>
      <div className="perf-donut-label">
        <strong>{label ?? `${Math.round(v * 100)}%`}</strong>
        {caption ? <small className="muted">{caption}</small> : null}
      </div>
    </div>
  );
}

/** Half-circle gauge for the sales board. */
export function Gauge({ value, valueLabel, caption, maxLabel, onTrack }: { value: number; valueLabel: string; caption: string; maxLabel: string; onTrack: boolean }) {
  const v = Math.min(Math.max(value, 0), 1);
  const r = 80;
  const len = Math.PI * r;
  return (
    <div className="perf-gauge">
      <svg viewBox="0 0 200 110" aria-hidden>
        <path d="M20 100 A80 80 0 0 1 180 100" className="perf-gauge-track" />
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          className={`perf-gauge-value ${onTrack ? 'perf-gauge-ok' : 'perf-gauge-behind'}`}
          strokeDasharray={`${v * len} ${len}`}
        />
      </svg>
      <div className="perf-gauge-label">
        <strong>{valueLabel}</strong>
        <small className="muted">{caption}</small>
      </div>
      <div className="perf-gauge-scale muted small">
        <span>0</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

export function BarChart({ points, format = String }: { points: SeriesPoint[]; format?: (v: number) => string }) {
  if (points.length === 0) return <p className="muted small">No chart data</p>;
  const max = Math.max(0, ...points.map((p) => p.value));
  return (
    <div className="perf-bars" role="img" aria-label="Last days">
      {points.map((p) => (
        <div key={p.date || p.label} className="perf-bar" title={`${p.label}: ${format(p.value)}`}>
          <div className="perf-bar-area">
            <span style={{ height: `${max <= 0 ? 4 : Math.max(4, (p.value / max) * 100)}%` }} />
          </div>
          <small>{p.label}</small>
        </div>
      ))}
    </div>
  );
}

export function MixChart({ slices, format = String, share }: { slices: MixSlice[]; format?: (v: number) => string; share?: boolean }) {
  if (slices.length === 0) return null;
  const max = Math.max(0, ...slices.map((s) => s.value));
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return (
    <div className="perf-mix">
      {slices.map((s) => {
        const part = share ? (total <= 0 ? 0 : s.value / total) : max <= 0 ? 0 : s.value / max;
        return (
          <div key={s.code} className="perf-mix-row">
            <div className="list-row">
              <span>{s.label}</span>
              <span className="muted small">
                {format(s.value)}
                {share ? ` · ${Math.round(part * 100)}%` : ''}
              </span>
            </div>
            <Progress value={part} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Stat tile in the dashboard KPI look: optional icon chip + label on top, value (and hint) at the bottom.
 * `tone` colours the icon chip, or the value when there is no icon.
 */
export function StatTile({ label, value, hint, tone, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string; icon?: ReactNode }) {
  return (
    <div className="card perf-kpi">
      <span className="perf-kpi-head">
        {icon ? (
          <span className={`perf-kpi-icon${tone ? ` perf-kpi-icon-${tone}` : ''}`} aria-hidden>
            {icon}
          </span>
        ) : null}
        <span className="perf-kpi-title">{label}</span>
      </span>
      <span className="perf-kpi-foot">
        <strong className={`perf-kpi-value${tone && !icon ? ` perf-text-${tone}` : ''}`}>{value}</strong>
        {hint ? <span className="muted small">{hint}</span> : null}
      </span>
    </div>
  );
}

/** Rounded delta pill (▲ +12% / ▼ -4% / 0%); nothing when there is no comparison. */
export function DeltaPill({ bps }: { bps: number | null | undefined }) {
  if (bps === null || bps === undefined) return null;
  const trend = bps > 0 ? 'up' : bps < 0 ? 'down' : 'flat';
  return (
    <span className={`perf-delta perf-delta-${trend}`}>
      {trend === 'up' ? '▲ ' : trend === 'down' ? '▼ ' : ''}
      {deltaLabel(bps)}
    </span>
  );
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="perf-avatar" aria-hidden>
      {initials(name)}
    </span>
  );
}

/** Funnel bars with step conversion and drop-off, as on mobile. */
export function FunnelChart({ funnel }: { funnel: Funnel }) {
  const steps = funnel.steps;
  if (steps.length === 0) return <p className="muted small">No funnel data yet.</p>;
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="perf-funnel">
      {steps.map((step, i) => (
        <div key={step.code}>
          {i > 0 ? (
            <div className="perf-funnel-conv">
              ↓ {step.conversionFromPreviousBps === null ? '—' : `${Math.round(step.conversionFromPreviousBps / 100)}%`}
            </div>
          ) : null}
          <div className="list-row">
            <strong>{step.label}</strong>
            <span>
              {step.value}
              {step.dropOffCount ? <span className="perf-text-danger small"> −{step.dropOffCount}</span> : null}
            </span>
          </div>
          <div className="perf-funnel-bar">
            <span style={{ width: `${Math.max(8, (step.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Dashboard/analytics widget card: headline, delta, 7-day bars, first metrics. */
export function WidgetCard({ widget, to }: { widget: DashboardWidget; to?: string }) {
  const body = (
    <>
      <div className="list-row">
        <strong>{widget.title}</strong>
        <DeltaPill bps={widget.deltaBps} />
      </div>
      <div className="perf-widget-value">{widgetPrimary(widget)}</div>
      <span className="muted small">{widget.primaryLabel}</span>
      <BarChart points={widget.series} />
      {widget.metrics.length > 0 ? (
        <div className="perf-widget-metrics">
          {widget.metrics.slice(0, 3).map((m) => (
            <span key={m.code} className="badge badge-neutral">
              {m.label} {metricDisplay(widget, m)}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
  return to ? (
    <Link to={to} className="card perf-widget perf-link-card">
      {body}
    </Link>
  ) : (
    <div className="card perf-widget">{body}</div>
  );
}

/** Export menu for the analytics report (mobile ReportExportButton). */
export function ExportAnalyticsButton({ range = {} }: { range?: AnalyticsRange }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (format: 'xlsx' | 'pdf' | 'csv') => {
    setBusy(true);
    try {
      await perfApi.exportAnalytics(format, range);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <select
      className="input perf-export"
      aria-label="Export analytics"
      value=""
      disabled={busy}
      onChange={(e) => {
        const f = e.target.value as 'xlsx' | 'pdf' | 'csv' | '';
        if (f) void run(f);
      }}
    >
      <option value="">{busy ? 'Exporting…' : 'Export…'}</option>
      <option value="xlsx">Excel (.xlsx)</option>
      <option value="pdf">PDF</option>
      <option value="csv">CSV</option>
    </select>
  );
}

