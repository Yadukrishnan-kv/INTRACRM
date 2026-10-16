import type { ReactNode } from 'react';
import { errorMessage } from '../api/client';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <span>{errorMessage(error)}</span>
      {onRetry ? (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="state">{children}</div>;
}

const STATUS_TONE: Record<string, string> = {
  open: 'info',
  recycled: 'info',
  won: 'success',
  completed: 'success',
  active: 'success',
  lost: 'danger',
  cancelled: 'danger',
  suspended: 'danger',
  unqualified: 'neutral',
  pending: 'warning',
  invited: 'warning',
};

export function Badge({ value, tone }: { value: string; tone?: string }) {
  const resolved = tone ?? STATUS_TONE[value] ?? 'neutral';
  return <span className={`badge badge-${resolved}`}>{value.replace(/_/g, ' ')}</span>;
}

/** INTRA logo with a caption underneath (sidebar, login and public pages). */
export function Brand({ caption, large }: { caption?: ReactNode; large?: boolean }) {
  return (
    <div className={`brand${large ? ' brand-lg' : ''}`}>
      <img src="/logo.png" alt="INTRA Living Solutions" className="brand-logo" />
      {caption ? <span className="muted small">{caption}</span> : null}
    </div>
  );
}
