import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { FormError, SelectField, TextArea, TextField } from '../../components/form';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/toast';
import { formatDateTime, humanize } from '../../lib/format';
import { commsApi, leadKeys, leadsApi } from './api';
import { checkStageMove, commsOutcome, displayName, fillMessageTemplate, timelineIcon } from './logic';
import {
  ACTIVITY_TYPES,
  type ActivityType,
  type CommsChannel,
  type CommsResult,
  type Lead,
  type LossReason,
  type PipelineStage,
  type TimelineEvent,
} from './types';

/** Invalidate everything that shows a lead after a mutation. */
export function useLeadInvalidation() {
  const qc = useQueryClient();
  return (leadId?: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: leadKeys.all }),
      qc.invalidateQueries({ queryKey: ['timeline'] }),
      leadId ? qc.invalidateQueries({ queryKey: ['lead', leadId] }) : Promise.resolve(),
    ]);
}

/* ------------------------------------------------------------------ */
/* Stage change (detail page + pipeline board)                         */
/* ------------------------------------------------------------------ */

export type StageMoveRequest = { stageId: string; lostReasonId?: string; reason?: string };

/**
 * Picks the target stage (unless `fixedStageId` is given, as when dropping on
 * a board column) and, for Lost, a loss reason — same flow as mobile.
 */
export function StageChangeModal({
  open,
  stages,
  lossReasons,
  currentStageId,
  fixedStageId,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  stages: PipelineStage[];
  lossReasons: LossReason[];
  currentStageId: string;
  fixedStageId?: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (req: StageMoveRequest) => void;
}) {
  const [stageId, setStageId] = useState(fixedStageId ?? currentStageId);
  const [lostReasonId, setLostReasonId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const firstReason = lossReasons[0]?.id ?? '';
  // Reset only when the dialog opens (or its target changes), never mid-edit.
  useEffect(() => {
    if (open) {
      setStageId(fixedStageId ?? currentStageId);
      setLostReasonId(firstReason);
      setReason('');
      setError(null);
    }
  }, [open, fixedStageId, currentStageId, firstReason]);

  const target = stages.find((s) => s.id === stageId);
  const submit = () => {
    const check = checkStageMove(stages, currentStageId, stageId, lossReasons.length);
    if (!check.ok) {
      setError(
        check.reason === 'same'
          ? 'The lead is already in this stage.'
          : check.reason === 'no_loss_reasons'
            ? 'Add a loss reason before marking Lost.'
            : 'Pick a stage.',
      );
      return;
    }
    if (check.needsLossReason && !lostReasonId) {
      setError('Pick a loss reason.');
      return;
    }
    onSubmit({
      stageId,
      ...(check.needsLossReason ? { lostReasonId } : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
  };

  return (
    <Modal
      open={open}
      title={target?.isLost ? 'Mark lost' : 'Change stage'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={`btn ${target?.isLost ? 'btn-danger' : 'btn-primary'}`} onClick={submit} disabled={busy}>
            {busy ? 'Moving…' : target?.isLost ? 'Mark lost' : 'Move'}
          </button>
        </>
      }
    >
      <div className="stack">
        {fixedStageId ? (
          <p>
            Move to <strong>{target?.name ?? 'stage'}</strong>
          </p>
        ) : (
          <SelectField
            label="Stage"
            value={stageId}
            onValue={(v) => {
              setStageId(v);
              setError(null);
            }}
            options={stages.map((s) => ({ value: s.id, label: s.name }))}
          />
        )}
        {target?.isLost ? (
          <SelectField
            label="Loss reason"
            required
            value={lostReasonId}
            onValue={setLostReasonId}
            options={lossReasons.map((r) => ({ value: r.id, label: r.name }))}
            placeholder={lossReasons.length ? undefined : 'No loss reasons configured'}
          />
        ) : null}
        <TextField label="Note (optional)" value={reason} maxLength={240} onValue={setReason} />
        <FormError message={error} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Assign                                                              */
/* ------------------------------------------------------------------ */

export function AssignModal({
  open,
  lead,
  onClose,
}: {
  open: boolean;
  lead: Pick<Lead, 'id' | 'ownerMembershipId'>;
  onClose: () => void;
}) {
  const toast = useToast();
  const invalidate = useLeadInvalidation();
  const lookups = useQuery({ queryKey: leadKeys.lookups, queryFn: leadsApi.lookups, staleTime: 5 * 60_000, enabled: open });
  const staff = lookups.data?.staff ?? [];
  const [owner, setOwner] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstStaff = staff[0]?.id ?? '';
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);
  useEffect(() => {
    if (open) setOwner(lead.ownerMembershipId ?? firstStaff);
  }, [open, lead.ownerMembershipId, firstStaff]);

  const submit = async () => {
    if (!owner) {
      setError('Pick a staff member.');
      return;
    }
    setBusy(true);
    try {
      await leadsApi.assign(lead.id, owner, reason.trim() || undefined);
      await invalidate(lead.id);
      toast.success('Lead assigned');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Reassign staff"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || lookups.isLoading}>
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        </>
      }
    >
      <div className="stack">
        <SelectField
          label="Assigned staff"
          required
          value={owner}
          onValue={setOwner}
          placeholder={lookups.isLoading ? 'Loading…' : 'Select staff'}
          options={staff.map((s) => ({ value: s.id, label: s.designation ? `${s.fullName} · ${s.designation}` : s.fullName }))}
        />
        <TextField label="Reason (optional)" value={reason} maxLength={240} onValue={setReason} />
        <FormError message={error ?? (lookups.isError ? errorMessage(lookups.error) : null)} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

export function ActivityModal({
  open,
  leadId,
  initialType = 'note',
  onClose,
}: {
  open: boolean;
  leadId: string;
  initialType?: ActivityType;
  onClose: () => void;
}) {
  const toast = useToast();
  const invalidate = useLeadInvalidation();
  const [type, setType] = useState<ActivityType>(initialType);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType(initialType);
      setSubject('');
      setBody('');
      setError(null);
    }
  }, [open, initialType]);

  const submit = async () => {
    if (!body.trim()) {
      setError('Enter activity notes.');
      return;
    }
    setBusy(true);
    try {
      await leadsApi.addActivity(leadId, {
        type,
        body: body.trim(),
        ...(subject.trim() ? { subject: subject.trim() } : {}),
      });
      await invalidate(leadId);
      toast.success('Activity logged');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Add activity"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="stack">
        <SelectField
          label="Type"
          value={type}
          onValue={(v) => setType(v as ActivityType)}
          options={ACTIVITY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
        />
        <TextField label="Subject (optional)" value={subject} maxLength={160} onValue={setSubject} />
        <TextArea label="Activity notes" required value={body} maxLength={4000} rows={4} onValue={setBody} />
        <FormError message={error} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Comms: click-to-call, WhatsApp, SMS (logged through the API)        */
/* ------------------------------------------------------------------ */

function launch(uri: string) {
  if (uri.startsWith('https:')) window.open(uri, '_blank', 'noopener,noreferrer');
  else window.location.href = uri;
}

export function useCommsResultHandler(leadId: string) {
  const toast = useToast();
  const invalidate = useLeadInvalidation();
  return async (result: CommsResult) => {
    const outcome = commsOutcome(result);
    if (outcome.warning) toast.info(outcome.warning);
    if (outcome.kind === 'launch') launch(outcome.uri);
    else if (outcome.message) toast.success(outcome.message);
    await invalidate(leadId);
  };
}

export function CommsActions({ lead, compact }: { lead: Lead; compact?: boolean }) {
  const { can } = useAuth();
  const toast = useToast();
  const handle = useCommsResultHandler(lead.id);
  const [confirmCall, setConfirmCall] = useState(false);
  const [notes, setNotes] = useState('');
  const [calling, setCalling] = useState(false);
  const [compose, setCompose] = useState<CommsChannel | null>(null);
  const hasPhone = !!lead.primaryPhone?.trim();
  const canLog = can(P.activityCreate);
  const size = compact ? ' btn-sm' : '';

  const call = async () => {
    setCalling(true);
    try {
      const result = await commsApi.call(lead.id, notes.trim() || undefined);
      setConfirmCall(false);
      await handle(result);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCalling(false);
    }
  };

  return (
    <>
      <div className="btn-row leads-comms">
        {canLog ? (
          <>
            <button
              type="button"
              className={`btn btn-primary${size}`}
              disabled={!hasPhone}
              title={hasPhone ? undefined : 'No phone number on this lead'}
              onClick={() => {
                setNotes('');
                setConfirmCall(true);
              }}
            >
              📞 Call
            </button>
            <button type="button" className={`btn btn-ghost${size}`} disabled={!hasPhone} onClick={() => setCompose('whatsapp')}>
              💬 WhatsApp
            </button>
            <button type="button" className={`btn btn-ghost${size}`} disabled={!hasPhone} onClick={() => setCompose('sms')}>
              ✉ SMS
            </button>
            {hasPhone ? null : <span className="muted small leads-comms-hint">No phone number on this lead</span>}
          </>
        ) : hasPhone ? (
          <a className={`btn btn-ghost${size}`} href={`tel:${lead.primaryPhone}`}>
            📞 {lead.primaryPhone}
          </a>
        ) : null}
        {lead.primaryEmail ? (
          <a className={`btn btn-ghost${size}`} href={`mailto:${lead.primaryEmail}`}>
            ✉ Email
          </a>
        ) : null}
      </div>

      <Modal
        open={confirmCall}
        title="Click to call"
        onClose={() => setConfirmCall(false)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmCall(false)} disabled={calling}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={call} disabled={calling}>
              {calling ? 'Calling…' : 'Call'}
            </button>
          </>
        }
      >
        <div className="stack">
          <p>
            Call <strong>{lead.primaryPhone}</strong>? The call is logged on the lead’s timeline.
          </p>
          <TextField label="Notes (optional)" value={notes} maxLength={1000} onValue={setNotes} />
        </div>
      </Modal>

      <ComposeModal lead={lead} channel={compose} onClose={() => setCompose(null)} onSent={handle} />
    </>
  );
}

function ComposeModal({
  lead,
  channel,
  onClose,
  onSent,
}: {
  lead: Lead;
  channel: CommsChannel | null;
  onClose: () => void;
  onSent: (r: CommsResult) => Promise<void>;
}) {
  const { me } = useAuth();
  const staffName = me?.fullName || 'INTRA LEADS';
  const templates = useQuery({
    queryKey: ['comms', 'templates', channel],
    queryFn: () => commsApi.templates(channel!),
    enabled: !!channel,
    staleTime: 5 * 60_000,
  });
  const [templateCode, setTemplateCode] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill with the first template once loaded, like the mobile composer.
  useEffect(() => {
    if (!channel) return;
    const first = templates.data?.[0];
    setTemplateCode(first?.code ?? '');
    setBody(first ? fillMessageTemplate(first.body, lead, staffName) : '');
    setError(null);
  }, [channel, templates.data, lead, staffName]);

  const send = async () => {
    if (!channel) return;
    const text = body.trim();
    if (channel === 'sms' && !text) {
      setError('Enter an SMS message.');
      return;
    }
    setBusy(true);
    try {
      const result = await commsApi.message(lead.id, channel, { templateCode: templateCode || undefined, body: text });
      onClose();
      await onSent(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!channel}
      title={channel === 'sms' ? 'Send SMS' : 'Send WhatsApp'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={send} disabled={busy}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted small">To {lead.primaryPhone} · {displayName(lead)}</p>
        {templates.isError ? <FormError message={errorMessage(templates.error)} /> : null}
        {templates.data && templates.data.length > 0 ? (
          <SelectField
            label="Message template"
            value={templateCode}
            onValue={(code) => {
              setTemplateCode(code);
              const match = templates.data?.find((t) => t.code === code);
              if (match) setBody(fillMessageTemplate(match.body, lead, staffName));
            }}
            options={templates.data.map((t) => ({ value: t.code, label: t.name }))}
          />
        ) : null}
        <TextArea label="Message" value={body} maxLength={4096} rows={5} onValue={setBody} />
        <FormError message={error} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline tile                                                       */
/* ------------------------------------------------------------------ */

export function TimelineItem({ event, showLead }: { event: TimelineEvent; showLead?: boolean }) {
  return (
    <li className="leads-tl-item">
      <span className="leads-tl-icon" aria-hidden>
        {timelineIcon(event.eventCode)}
      </span>
      <div className="leads-tl-body">
        <div className="list-row">
          <strong>{event.title || event.subject || humanize(event.eventCode)}</strong>
          <span className="muted small">{formatDateTime(event.occurredAt)}</span>
        </div>
        {showLead && event.lead ? (
          <Link to={`/leads/${event.lead.id}`} className="small">
            {event.lead.leadNumber} · {event.lead.customerName || event.lead.title}
          </Link>
        ) : null}
        {event.subject && event.title && event.subject !== event.title ? <div className="small">{event.subject}</div> : null}
        {event.body ? <p className="prewrap small">{event.body}</p> : null}
        {event.actorName ? <span className="muted small">{event.actorName}</span> : null}
      </div>
    </li>
  );
}

/** Horizontal stage stepper (mobile "Status Pipeline"). */
export function StageStepper({ stages, activeIndex, lost }: { stages: PipelineStage[]; activeIndex: number; lost: boolean }) {
  return (
    <ol className="leads-stepper">
      {stages.map((s, i) => {
        const state = i < activeIndex ? 'done' : i === activeIndex ? (lost ? 'lost' : 'current') : 'todo';
        return (
          <li key={s.id} className={`leads-step leads-step-${state}`}>
            <span className="leads-step-dot" aria-hidden>
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span className="leads-step-label">{s.name}</span>
          </li>
        );
      })}
    </ol>
  );
}
