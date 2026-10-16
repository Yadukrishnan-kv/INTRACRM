import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { Modal } from '../../components/Modal';
import { Tabs } from '../../components/Tabs';
import { useToast } from '../../components/toast';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatDate, formatDateTime, formatMoney, humanize } from '../../lib/format';
import { useCursorList } from '../../lib/hooks';
import { leadKeys, leadsApi } from './api';
import {
  ActivityModal,
  AssignModal,
  CommsActions,
  StageChangeModal,
  StageStepper,
  TimelineItem,
  useLeadInvalidation,
  type StageMoveRequest,
} from './LeadWidgets';
import { displayName, qualityTone, stepperIndex } from './logic';
import type { LeadDetail, LossReason, TimelineEvent } from './types';
import './leads.css';

type TabId = 'details' | 'activity' | 'related' | 'history';
const TAB_IDS: TabId[] = ['details', 'activity', 'related', 'history'];
const NO_REASONS: LossReason[] = [];

export function LeadDetailPage() {
  const { leadId = '' } = useParams();
  const { can, canAny } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as TabId | null;
  const tab: TabId = tabParam && TAB_IDS.includes(tabParam) ? tabParam : 'details';
  const [modal, setModal] = useState<null | 'stage' | 'assign' | 'activity'>(null);

  const query = useQuery({ queryKey: leadKeys.detail(leadId), queryFn: () => leadsApi.get(leadId) });

  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const lead = query.data!;

  const showRelated = canAny([P.quotationRead, P.siteVisitRead, P.warrantyRead]);
  const qs = `?leadId=${encodeURIComponent(lead.id)}`;
  const quickActions: Array<{ to: string; label: string; show: boolean }> = [
    { to: `/tasks/create${qs}`, label: 'Schedule follow-up', show: can(P.followUpCreate) },
    { to: `/quotations/create${qs}`, label: 'Create quotation', show: canAny([P.quotationCreate, P.quotationSend]) },
    { to: `/visits/create${qs}`, label: 'Add site visit', show: can(P.siteVisitCreate) },
    { to: `/warranties/create${qs}`, label: 'Issue warranty', show: can(P.warrantyCreate) },
  ];
  const stageTone = lead.lifecycleStatus === 'won' ? 'success' : lead.lifecycleStatus === 'lost' ? 'danger' : 'info';

  return (
    <>
      <Link to="/leads" className="back-link">
        ← Leads
      </Link>
      <PageHeader
        title={displayName(lead)}
        subtitle={
          <>
            <span>{lead.leadNumber}</span>
            <Badge value={lead.stageName} tone={stageTone} />
            {lead.lifecycleStatus !== 'open' ? <Badge value={lead.lifecycleStatus} /> : null}
            {lead.primaryPhone ? <span>{lead.primaryPhone}</span> : null}
            {lead.city ? <span>📍 {lead.city}</span> : null}
          </>
        }
        actions={
          <>
            {can(P.leadUpdate) ? (
              <Link className="btn btn-ghost" to={`/leads/${lead.id}/edit`}>
                Edit
              </Link>
            ) : null}
            {can(P.leadAssign) ? (
              <button type="button" className="btn btn-ghost" onClick={() => setModal('assign')}>
                Reassign
              </button>
            ) : null}
            {can(P.activityCreate) ? (
              <button type="button" className="btn btn-ghost" onClick={() => setModal('activity')}>
                Add activity
              </button>
            ) : null}
          </>
        }
      />

      <div className="card leads-actionbar">
        <CommsActions lead={lead} />
        {quickActions.some((a) => a.show) ? (
          <div className="btn-row chip-scroll leads-quick">
            {quickActions
              .filter((a) => a.show)
              .map((a) => (
                <Link key={a.to} className="btn btn-ghost btn-sm" to={a.to}>
                  {a.label}
                </Link>
              ))}
          </div>
        ) : null}
      </div>

      <Tabs
        tabs={[
          { id: 'details', label: 'Details' },
          { id: 'activity', label: 'Activity' },
          { id: 'related', label: 'Related', hidden: !showRelated },
          { id: 'history', label: 'History' },
        ]}
        active={tab}
        onChange={(id) =>
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              if (id === 'details') next.delete('tab');
              else next.set('tab', id);
              return next;
            },
            { replace: true },
          )
        }
      />

      {tab === 'details' ? <DetailsTab lead={lead} onChangeStage={() => setModal('stage')} /> : null}
      {tab === 'activity' ? <ActivityTab lead={lead} /> : null}
      {tab === 'related' && showRelated ? <RelatedTab leadId={lead.id} /> : null}
      {tab === 'history' ? <HistoryTab leadId={lead.id} /> : null}

      {can(P.leadChangeStage) ? <StageChangeController lead={lead} open={modal === 'stage'} onClose={() => setModal(null)} /> : null}
      {can(P.leadAssign) ? <AssignModal open={modal === 'assign'} lead={lead} onClose={() => setModal(null)} /> : null}
      {can(P.activityCreate) ? <ActivityModal open={modal === 'activity'} leadId={lead.id} onClose={() => setModal(null)} /> : null}
    </>
  );
}

function useBoard(enabled = true) {
  return useQuery({ queryKey: leadKeys.board, queryFn: leadsApi.board, staleTime: 60_000, enabled });
}

function StageChangeController({ lead, open, onClose }: { lead: LeadDetail; open: boolean; onClose: () => void }) {
  const board = useBoard(open);
  const toast = useToast();
  const invalidate = useLeadInvalidation();
  const [busy, setBusy] = useState(false);
  const stages = board.data?.columns.map((c) => c.stage) ?? [];

  const submit = async (req: StageMoveRequest) => {
    setBusy(true);
    try {
      await leadsApi.changeStage(lead.id, { ...req, version: lead.version });
      await invalidate(lead.id);
      toast.success('Stage updated');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
      await invalidate(lead.id);
    } finally {
      setBusy(false);
    }
  };

  if (open && !board.data) {
    return (
      <Modal open title="Change stage" onClose={onClose}>
        {board.isError ? <ErrorState error={board.error} onRetry={() => board.refetch()} /> : <Spinner />}
      </Modal>
    );
  }
  return (
    <StageChangeModal
      open={open}
      stages={stages}
      lossReasons={board.data?.lossReasons ?? NO_REASONS}
      currentStageId={lead.stageId}
      busy={busy}
      onClose={onClose}
      onSubmit={submit}
    />
  );
}

function DetailsTab({ lead, onChangeStage }: { lead: LeadDetail; onChangeStage: () => void }) {
  const { can } = useAuth();
  const board = useBoard();
  const stages = (board.data?.columns.map((c) => c.stage) ?? []).filter((s) => !(s.isLost && s.isWon));
  const lost = lead.lifecycleStatus === 'lost';

  const facts: Array<[string, ReactNode]> = [
    ['Lead source', lead.sourceName ?? '—'],
    ['Assigned staff', lead.ownerName ?? <span className="muted">Unassigned</span>],
    ['Product interest', lead.title],
    ['Lead value (est.)', formatMoney(lead.estimatedValueMinor, lead.currency)],
    ['Lead quality', lead.quality ? <Badge value={humanize(lead.quality)} tone={qualityTone(lead.quality)} /> : '—'],
    ['Phone', lead.primaryPhone ? <a href={`tel:${lead.primaryPhone}`}>{lead.primaryPhone}</a> : '—'],
    ['Email', lead.primaryEmail ? <a href={`mailto:${lead.primaryEmail}`}>{lead.primaryEmail}</a> : '—'],
    ['City', lead.city ?? '—'],
    ['Created on', formatDate(lead.createdAt)],
    ['Next follow-up', lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : 'Not scheduled'],
    ['Last activity', formatDateTime(lead.lastActivityAt)],
  ];

  return (
    <div className="detail-grid">
      <section className="card">
        <h2>Details</h2>
        <dl className="facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {lead.requirement ? (
          <>
            <h3>Requirement</h3>
            <p className="prewrap">{lead.requirement}</p>
          </>
        ) : null}
      </section>

      <div className="stack">
        <section className="card">
          <div className="list-row">
            <h2>Status pipeline</h2>
            {can(P.leadChangeStage) ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={onChangeStage}>
                Change stage
              </button>
            ) : null}
          </div>
          {board.isLoading ? (
            <Spinner />
          ) : stages.length ? (
            <StageStepper stages={stages} activeIndex={stepperIndex(stages, lead.stageName, lost)} lost={lost} />
          ) : (
            <p>
              Current stage: <strong>{lead.stageName}</strong>
            </p>
          )}
        </section>

        <FollowUpsCard lead={lead} />
        {can(P.billingRead) ? <BillingCard leadId={lead.id} /> : null}
      </div>
    </div>
  );
}

function FollowUpsCard({ lead }: { lead: LeadDetail }) {
  const { can } = useAuth();
  const toast = useToast();
  const invalidate = useLeadInvalidation();
  const [busyId, setBusyId] = useState<string | null>(null);

  const complete = async (followUpId: string, version: number) => {
    setBusyId(followUpId);
    try {
      await leadsApi.completeFollowUp(lead.id, followUpId, version);
      await invalidate(lead.id);
      toast.success('Follow-up completed');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="card">
      <div className="list-row">
        <h2>Follow-ups</h2>
        {can(P.followUpCreate) ? (
          <Link className="btn btn-ghost btn-sm" to={`/tasks/create?leadId=${encodeURIComponent(lead.id)}`}>
            Schedule
          </Link>
        ) : null}
      </div>
      {lead.followUps.length === 0 ? (
        <EmptyState>No follow-ups scheduled.</EmptyState>
      ) : (
        <ul className="list">
          {lead.followUps.map((f) => {
            const pending = f.status === 'pending';
            const overdue = f.overdue && pending;
            return (
              <li key={f.id}>
                <div className="list-row">
                  <Link to={`/tasks/${f.id}`}>
                    <strong>{f.title}</strong>
                  </Link>
                  <Badge value={overdue ? 'overdue' : f.status} tone={overdue ? 'danger' : undefined} />
                </div>
                <div className="list-row">
                  <span className="muted small">
                    {humanize(f.type)} · {formatDateTime(f.dueAt)}
                    {f.assigneeName ? ` · ${f.assigneeName}` : ''}
                  </span>
                  {pending && can(P.followUpComplete) ? (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busyId === f.id} onClick={() => complete(f.id, f.version)}>
                      {busyId === f.id ? 'Completing…' : 'Complete'}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function BillingCard({ leadId }: { leadId: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const invalidate = useLeadInvalidation();
  const billing = useQuery({ queryKey: leadKeys.sub(leadId, 'billing'), queryFn: () => leadsApi.billing(leadId) });
  const [syncing, setSyncing] = useState(false);

  const sync = async () => {
    setSyncing(true);
    try {
      const customer = await leadsApi.syncBillingCustomer(leadId);
      await invalidate(leadId);
      if (customer.warning) toast.info(customer.warning);
      else toast.success('Customer synced');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="card">
      <div className="list-row">
        <h2>Invoices</h2>
        {can(P.billingSync) ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={sync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync customer'}
          </button>
        ) : null}
      </div>
      {billing.isLoading ? (
        <Spinner />
      ) : billing.isError ? (
        <ErrorState error={billing.error} onRetry={() => billing.refetch()} />
      ) : (
        <>
          {billing.data?.customer ? (
            <p className="muted small">
              {billing.data.customer.displayName} · {humanize(billing.data.customer.provider)} · {humanize(billing.data.customer.syncStatus)}
            </p>
          ) : null}
          {!billing.data?.invoices.length ? (
            <EmptyState>No invoices yet.</EmptyState>
          ) : (
            <ul className="list">
              {billing.data.invoices.map((inv) => (
                <li key={inv.id}>
                  <div className="list-row">
                    <strong>{inv.invoiceNumber}</strong>
                    <Badge value={inv.paymentStatus} tone={inv.paymentStatus === 'paid' ? 'success' : inv.balanceMinor > 0 ? 'warning' : undefined} />
                  </div>
                  <span className="muted small">
                    {formatMoney(inv.totalMinor, inv.currency)} total · {formatMoney(inv.balanceMinor, inv.currency)} due
                    {inv.dueOn ? ` · Due ${formatDate(inv.dueOn)}` : ''}
                  </span>
                  {inv.warning ? <span className="small field-error">{inv.warning}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function ActivityTab({ lead }: { lead: LeadDetail }) {
  const { can } = useAuth();
  const canTimeline = can(P.activityRead);
  const timeline = useCursorList([...leadKeys.sub(lead.id, 'timeline'), canTimeline], (cursor) =>
    canTimeline ? leadsApi.leadTimeline(lead.id, cursor) : Promise.resolve({ data: [] as TimelineEvent[], page: null }),
  );
  const stageChanges = useQuery({ queryKey: leadKeys.sub(lead.id, 'stage-changes'), queryFn: () => leadsApi.stageChanges(lead.id) });

  // Without activity:read (or if the feed fails), fall back to the activities embedded in the lead — like mobile.
  const fallback: TimelineEvent[] = lead.activities.map((a) => ({
    id: a.id,
    eventCode: a.type,
    title: a.subject ?? humanize(a.type),
    subject: null,
    body: a.body,
    occurredAt: a.occurredAt,
    actorName: a.actorName,
    lead: null,
  }));
  const events = canTimeline && !timeline.isError ? timeline.items : fallback;

  return (
    <div className="detail-grid">
      <section className="card">
        <h2>Timeline</h2>
        {canTimeline && timeline.isLoading ? (
          <Spinner />
        ) : events.length === 0 ? (
          <EmptyState>No timeline events yet.</EmptyState>
        ) : (
          <ul className="leads-tl">
            {events.map((e) => (
              <TimelineItem key={e.id} event={e} />
            ))}
          </ul>
        )}
        {canTimeline && timeline.hasNextPage ? (
          <div className="table-footer">
            <button type="button" className="btn btn-ghost" onClick={() => timeline.fetchNextPage()} disabled={timeline.isFetchingNextPage}>
              {timeline.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>Stage history</h2>
        {stageChanges.isLoading ? (
          <Spinner />
        ) : stageChanges.isError ? (
          <ErrorState error={stageChanges.error} onRetry={() => stageChanges.refetch()} />
        ) : !stageChanges.data?.length ? (
          <EmptyState>No stage changes yet.</EmptyState>
        ) : (
          <ul className="list">
            {stageChanges.data.map((c) => (
              <li key={c.id}>
                <strong>{c.fromStageName ? `${c.fromStageName} → ${c.toStageName}` : c.toStageName}</strong>
                <span className="muted small">
                  {humanize(c.toLifecycleStatus)}
                  {c.changedByName ? ` · ${c.changedByName}` : ''} · {formatDateTime(c.changedAt)}
                </span>
                {c.reason ? <span className="small prewrap">{c.reason}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RelatedTab({ leadId }: { leadId: string }) {
  const { can } = useAuth();
  const quotations = useQuery({
    queryKey: leadKeys.sub(leadId, 'quotations'),
    queryFn: () => leadsApi.quotations(leadId),
    enabled: can(P.quotationRead),
  });
  const visits = useQuery({
    queryKey: leadKeys.sub(leadId, 'site-visits'),
    queryFn: () => leadsApi.siteVisits(leadId),
    enabled: can(P.siteVisitRead),
  });
  const warranties = useQuery({
    queryKey: leadKeys.sub(leadId, 'warranties'),
    queryFn: () => leadsApi.warranties(leadId),
    enabled: can(P.warrantyRead),
  });

  return (
    <div className="leads-related">
      {can(P.quotationRead) ? (
        <RelatedCard title="Quotations" query={quotations} empty="No quotations.">
          {(quotations.data ?? []).map((q) => (
            <li key={q.id}>
              <div className="list-row">
                <Link to={`/quotations/${q.id}`}>{q.quotationNumber}</Link>
                <Badge value={q.status} />
              </div>
              <span className="muted small">
                {formatMoney(q.totalMinor, q.currency)}
                {q.validUntilOn ? ` · valid till ${formatDate(q.validUntilOn)}` : ''}
              </span>
            </li>
          ))}
        </RelatedCard>
      ) : null}
      {can(P.siteVisitRead) ? (
        <RelatedCard title="Site visits" query={visits} empty="No site visits.">
          {(visits.data ?? []).map((v) => (
            <li key={v.id}>
              <div className="list-row">
                <Link to={`/visits/${v.id}`}>{v.purpose || 'Site visit'}</Link>
                <Badge value={v.status} />
              </div>
              <span className="muted small">
                {formatDateTime(v.scheduledAt ?? v.checkedInAt)}
                {v.assigneeName ? ` · ${v.assigneeName}` : ''}
                {v.city ? ` · ${v.city}` : ''}
              </span>
            </li>
          ))}
        </RelatedCard>
      ) : null}
      {can(P.warrantyRead) ? (
        <RelatedCard title="Warranties" query={warranties} empty="No warranties.">
          {(warranties.data ?? []).map((w) => (
            <li key={w.id}>
              <div className="list-row">
                <Link to={`/warranties/${w.id}`}>{w.cardNumber}</Link>
                <Badge value={w.statusLabel ?? w.status} />
              </div>
              <span className="muted small">
                {w.warrantyStartOn ? `${formatDate(w.warrantyStartOn)} – ${formatDate(w.warrantyEndOn)}` : '—'}
                {w.serialNumber ? ` · SN ${w.serialNumber}` : ''}
              </span>
            </li>
          ))}
        </RelatedCard>
      ) : null}
    </div>
  );
}

function RelatedCard({
  title,
  query,
  empty,
  children,
}: {
  title: string;
  query: { isLoading: boolean; isError: boolean; error: unknown; data?: unknown[]; refetch: () => unknown };
  empty: string;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <EmptyState>{empty}</EmptyState>
      ) : (
        <ul className="list">{children}</ul>
      )}
    </section>
  );
}

function HistoryTab({ leadId }: { leadId: string }) {
  const { can } = useAuth();
  const assignments = useQuery({ queryKey: leadKeys.sub(leadId, 'assignments'), queryFn: () => leadsApi.assignments(leadId) });
  const canAudit = can(P.auditRead);

  return (
    <div className="detail-grid">
      <section className="card">
        <h2>Assignments</h2>
        {assignments.isLoading ? (
          <Spinner />
        ) : assignments.isError ? (
          <ErrorState error={assignments.error} onRetry={() => assignments.refetch()} />
        ) : !assignments.data?.length ? (
          <EmptyState>No assignment history.</EmptyState>
        ) : (
          <ul className="list">
            {assignments.data.map((a) => (
              <li key={a.id}>
                <div className="list-row">
                  <strong>{a.fromName ? `${a.fromName} → ${a.toName ?? '—'}` : (a.toName ?? '—')}</strong>
                  {a.isCurrent ? <Badge value="current" tone="success" /> : null}
                </div>
                <span className="muted small">
                  {formatDateTime(a.assignedAt)}
                  {a.byName ? ` · by ${a.byName}` : ''}
                </span>
                {a.reason ? <span className="small">{a.reason}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      {canAudit ? <AuditCard leadId={leadId} /> : null}
    </div>
  );
}

function AuditCard({ leadId }: { leadId: string }) {
  const tracks = useCursorList([...leadKeys.sub(leadId, 'tracks')], (cursor) => leadsApi.tracks(leadId, cursor));
  return (
    <section className="card">
      <h2>Audit trail</h2>
      {tracks.isLoading ? (
        <Spinner />
      ) : tracks.isError ? (
        <ErrorState error={tracks.error} onRetry={() => tracks.refetch()} />
      ) : tracks.items.length === 0 ? (
        <EmptyState>No tracked changes.</EmptyState>
      ) : (
        <ul className="list">
          {tracks.items.map((t) => (
            <li key={t.id}>
              <div className="list-row">
                <strong>{t.actionName || humanize(t.action)}</strong>
                <span className="muted small">{formatDateTime(t.createdAt)}</span>
              </div>
              <span className="muted small">
                {humanize(t.resourceType)}
                {t.number ? ` ${t.number}` : ''}
                {t.actorName ? ` · ${t.actorName}` : ''}
              </span>
              {t.summary ? <span className="small">{t.summary}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {tracks.hasNextPage ? (
        <div className="table-footer">
          <button type="button" className="btn btn-ghost" onClick={() => tracks.fetchNextPage()} disabled={tracks.isFetchingNextPage}>
            {tracks.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
