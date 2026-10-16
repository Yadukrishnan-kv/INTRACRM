import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatDateTime, humanize } from '../../lib/format';
import { followUpsApi, keys } from './api';
import { CallButton, CompleteModal, FollowUpStatusBadge, RescheduleModal } from './components';
import { PRIORITY_LABELS, typeTitle } from './logic';
import './followups.css';

export function FollowUpDetailPage() {
  const { followUpId = '' } = useParams();
  const { can } = useAuth();
  const query = useQuery({ queryKey: keys.detail(followUpId), queryFn: () => followUpsApi.get(followUpId) });
  const [dialog, setDialog] = useState<'reschedule' | 'complete' | null>(null);

  if (query.isLoading) return <Spinner />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const item = query.data;
  const pending = item.status === 'pending';
  const canUpdate = pending && can(P.followUpUpdate);
  const canComplete = pending && can(P.followUpComplete);

  return (
    <>
      <Link className="back-link" to="/tasks">
        ← Follow-ups
      </Link>
      <PageHeader
        title={item.title}
        subtitle={
          <>
            {typeTitle(item.type)} · <FollowUpStatusBadge item={item} />
          </>
        }
        actions={
          <div className="btn-row followups-detail-actions">
            {canComplete ? (
              <button type="button" className="btn btn-primary" onClick={() => setDialog('complete')}>
                Complete
              </button>
            ) : null}
            <CallButton leadId={item.leadId} phone={item.leadPhone} small={false} />
            {item.leadPhone ? (
              <a className="btn btn-ghost" href={`https://wa.me/${item.leadPhone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            ) : null}
            {canUpdate ? (
              <>
                <Link className="btn btn-ghost" to={`/tasks/${item.id}/edit`}>
                  Edit
                </Link>
                <button type="button" className="btn btn-ghost" onClick={() => setDialog('reschedule')}>
                  Reschedule
                </button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="detail-grid">
        <section className="card stack">
          <h2>Details</h2>
          <dl className="facts">
            <div>
              <dt>Due</dt>
              <dd>{formatDateTime(item.dueAt)}</dd>
            </div>
            <div>
              <dt>Remind at</dt>
              <dd>{formatDateTime(item.remindAt)}</dd>
            </div>
            <div>
              <dt>Bucket</dt>
              <dd>{humanize(item.engineBucket)}</dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>{PRIORITY_LABELS[item.priority] ?? item.priority}</dd>
            </div>
            <div>
              <dt>Assignee</dt>
              <dd>{item.assigneeName ?? '—'}</dd>
            </div>
            {item.completedAt ? (
              <div>
                <dt>Completed</dt>
                <dd>{formatDateTime(item.completedAt)}</dd>
              </div>
            ) : null}
            {item.rescheduleCount > 0 ? (
              <div>
                <dt>Rescheduled</dt>
                <dd>
                  {item.rescheduleCount} time{item.rescheduleCount === 1 ? '' : 's'}
                  {item.lastRescheduledAt ? <div className="muted small">last {formatDateTime(item.lastRescheduledAt)}</div> : null}
                </dd>
              </div>
            ) : null}
          </dl>
          {item.notes ? (
            <div>
              <h3 className="section-title">Notes</h3>
              <p className="prewrap">{item.notes}</p>
            </div>
          ) : null}
        </section>

        <section className="card stack">
          <h2>Lead</h2>
          <div>
            <Link to={`/leads/${item.leadId}`}>{item.leadTitle ?? 'Open lead'}</Link>
            <div className="muted small">{[item.leadNumber, item.leadCustomerName, item.leadPhone].filter(Boolean).join(' · ')}</div>
          </div>
          {can(P.followUpCreate) ? (
            <Link className="btn btn-ghost btn-sm followups-self-start" to={`/tasks/create?leadId=${item.leadId}`}>
              Schedule another
            </Link>
          ) : null}
        </section>
      </div>

      <RescheduleModal item={item} open={dialog === 'reschedule'} onClose={() => setDialog(null)} />
      <CompleteModal item={item} open={dialog === 'complete'} onClose={() => setDialog(null)} />
    </>
  );
}
