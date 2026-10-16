import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fileToBase64 } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { TextArea, TextField } from '../../components/form';
import { ConfirmModal, Modal } from '../../components/Modal';
import { useToast } from '../../components/toast';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { useApiMutation } from '../../lib/hooks';
import { fieldApi } from './api';
import { locate } from './location';
import {
  base64ToBlob,
  geoLabel,
  isOverdue,
  mapsUrl,
  MAX_PHOTOS,
  photoContentType,
  photoProblem,
  VISIT_STATUS_LABELS,
  VISIT_STATUS_TONE,
  visitActions,
  visitAddress,
  visitTitle,
} from './logic';
import type { GeoPoint, SiteVisit, SiteVisitPhoto } from './types';
import './field.css';

type Dialog = null | 'notes' | 'feedback' | 'complete' | 'cancel' | 'no_show';

export function SiteVisitDetailPage() {
  const { visitId = '' } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const key = ['site-visit', visitId];
  const query = useQuery({ queryKey: key, queryFn: () => fieldApi.visit(visitId) });

  const [dialog, setDialog] = useState<Dialog>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [completeLocation, setCompleteLocation] = useState<GeoPoint | undefined>(undefined);
  const [viewing, setViewing] = useState<SiteVisitPhoto | null>(null);
  const [removing, setRemoving] = useState<SiteVisitPhoto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onSaved = (visit: SiteVisit) => {
    qc.setQueryData(key, visit);
    setDialog(null);
  };
  const opts = (success: string) => ({ success, invalidate: [['site-visits']], onSuccess: onSaved });

  const checkIn = useApiMutation(
    (vars: { location: GeoPoint; version: number }) => fieldApi.checkIn(visitId, vars),
    opts('Checked in'),
  );
  const checkOut = useApiMutation(
    (vars: { location: GeoPoint; version: number }) => fieldApi.checkOut(visitId, vars),
    opts('Checked out'),
  );
  const saveNotes = useApiMutation(
    (vars: { notes: string; version: number }) => fieldApi.saveNotes(visitId, vars),
    opts('Notes saved'),
  );
  const saveFeedback = useApiMutation(
    (vars: { customerFeedback?: string; customerRating?: number; version: number }) => fieldApi.saveFeedback(visitId, vars),
    opts('Feedback saved'),
  );
  const complete = useApiMutation(
    (vars: { outcome?: string; version: number; location?: GeoPoint }) => fieldApi.complete(visitId, vars),
    opts('Visit completed'),
  );
  const cancel = useApiMutation(
    (vars: { reason?: string; version: number }) => fieldApi.cancel(visitId, vars),
    opts('Visit cancelled'),
  );
  const noShow = useApiMutation(
    (vars: { reason?: string; version: number }) => fieldApi.noShow(visitId, vars),
    opts('Marked as no show'),
  );
  const addPhoto = useApiMutation(
    (vars: Parameters<typeof fieldApi.addPhoto>[1]) => fieldApi.addPhoto(visitId, vars),
    opts('Photo added'),
  );
  const removePhoto = useApiMutation((photoId: string) => fieldApi.removePhoto(visitId, photoId), {
    success: 'Photo removed',
    invalidate: [['site-visits']],
    onSuccess: (visit) => {
      qc.setQueryData(key, visit);
      setRemoving(null);
    },
  });

  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const visit = query.data!;
  const actions = visitActions(visit.status, can(P.siteVisitComplete));
  const open = visit.status === 'scheduled' || visit.status === 'in_progress';
  const busy =
    geoBusy ||
    checkIn.isPending ||
    checkOut.isPending ||
    complete.isPending ||
    cancel.isPending ||
    noShow.isPending ||
    addPhoto.isPending;

  /** Mobile requires a GPS fix for check-in/out (and completing a visit that was never checked in). */
  const requireGps = async (): Promise<GeoPoint | null> => {
    setGeoBusy(true);
    const result = await locate();
    setGeoBusy(false);
    if (result.ok) {
      setGeoError(null);
      return result.point;
    }
    setGeoError(result.message);
    return null;
  };

  const doCheckIn = async () => {
    const location = await requireGps();
    if (location) checkIn.mutate({ location, version: visit.version });
  };
  const doCheckOut = async () => {
    const location = await requireGps();
    if (location) checkOut.mutate({ location, version: visit.version });
  };
  const startComplete = async () => {
    let location: GeoPoint | undefined;
    if (visit.status === 'scheduled') {
      const point = await requireGps();
      if (!point) return;
      location = point;
    }
    setCompleteLocation(location);
    setDialog('complete');
  };

  const onPickPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = photoProblem(file, visit.photos.length);
    if (problem) {
      toast.error(problem);
      return;
    }
    const contentBase64 = await fileToBase64(file);
    // Location is best effort for photos, like mobile.
    setGeoBusy(true);
    const loc = await locate();
    setGeoBusy(false);
    addPhoto.mutate({
      contentType: photoContentType(file)!,
      contentBase64,
      fileName: file.name,
      location: loc.ok ? loc.point : undefined,
    });
  };

  const facts: Array<[string, ReactNode]> = [
    ['Status', VISIT_STATUS_LABELS[visit.status] ?? visit.status],
    ['Scheduled', formatDateTime(visit.scheduledAt)],
    ['Checked in', formatDateTime(visit.checkedInAt)],
    ['Checked out', formatDateTime(visit.checkedOutAt)],
    ['Assignee', visit.assigneeName ?? '—'],
    ['Customer', visit.customerName ?? '—'],
    [
      'Lead',
      visit.leadId ? (
        <Link to={`/leads/${visit.leadId}`}>{[visit.leadNumber, visit.leadTitle].filter(Boolean).join(' ') || 'Open lead'}</Link>
      ) : (
        '—'
      ),
    ],
    ['Address', visitAddress(visit) || '—'],
  ];
  const gps: Array<[string, GeoPoint | null]> = [
    ['Planned', visit.scheduledLocation],
    ['Check-in', visit.checkInLocation],
    ['Check-out', visit.checkOutLocation],
  ];

  return (
    <>
      <Link to="/visits" className="back-link">
        ← Site visits
      </Link>
      <PageHeader
        title={visitTitle(visit)}
        subtitle={
          <>
            <Badge value={VISIT_STATUS_LABELS[visit.status] ?? visit.status} tone={VISIT_STATUS_TONE[visit.status]} />
            {isOverdue(visit) ? <Badge value="overdue" tone="danger" /> : null}
            <span>
              {[visit.leadNumber, visit.customerName, formatDateTime(visit.scheduledAt), visit.assigneeName]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </>
        }
        actions={
          visit.leadId ? (
            <Link to={`/leads/${visit.leadId}`} className="btn btn-ghost">
              Open lead
            </Link>
          ) : null
        }
      />

      {geoError ? (
        <div className="field-geo-alert" role="alert">
          <span>{geoError}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGeoError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {!open ? (
        <p className="notice" role="status">
          This visit is {(VISIT_STATUS_LABELS[visit.status] ?? visit.status).toLowerCase()}. Check in, complete, and cancel
          are only available while a visit is scheduled or in progress.
        </p>
      ) : null}

      {open && (actions.checkIn || actions.checkOut || actions.complete) ? (
        <section className="card field-actions">
          <div className="btn-row">
            {actions.checkIn ? (
              <button type="button" className="btn btn-primary" onClick={doCheckIn} disabled={busy}>
                {geoBusy || checkIn.isPending ? 'Checking in…' : 'Check in'}
              </button>
            ) : null}
            {actions.checkOut ? (
              <button type="button" className="btn btn-primary" onClick={doCheckOut} disabled={busy}>
                {geoBusy || checkOut.isPending ? 'Checking out…' : 'Check out'}
              </button>
            ) : null}
            {actions.complete ? (
              <button type="button" className="btn btn-ghost" onClick={startComplete} disabled={busy}>
                Complete visit
              </button>
            ) : null}
            {actions.noShow ? (
              <button type="button" className="btn btn-ghost" onClick={() => setDialog('no_show')} disabled={busy}>
                No show
              </button>
            ) : null}
            {actions.cancel ? (
              <button type="button" className="btn btn-ghost btn-ghost-danger" onClick={() => setDialog('cancel')} disabled={busy}>
                Cancel visit
              </button>
            ) : null}
          </div>
          <p className="muted small field-actions-note">
            Check-in and check-out record your current GPS location.
          </p>
        </section>
      ) : null}

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
          {visit.outcome ? (
            <>
              <h3>Outcome</h3>
              <p className="prewrap">{visit.outcome}</p>
            </>
          ) : null}
        </section>

        <section className="card">
          <h2>GPS location</h2>
          <ul className="list">
            {gps.map(([label, point]) => (
              <li key={label}>
                <div className="list-row">
                  <strong>{label}</strong>
                  {point ? (
                    <a href={mapsUrl(point)} target="_blank" rel="noreferrer" className="small">
                      Open map
                    </a>
                  ) : null}
                </div>
                <span className="muted small">{geoLabel(point)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Notes</h2>
            {actions.capture ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog('notes')}>
                Edit notes
              </button>
            ) : null}
          </div>
          <p className="prewrap">{visit.notes?.trim() ? visit.notes : <span className="muted">No notes yet</span>}</p>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Customer feedback</h2>
            {actions.capture ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog('feedback')}>
                {visit.customerRating != null || visit.customerFeedback ? 'Edit feedback' : 'Add feedback'}
              </button>
            ) : null}
          </div>
          {visit.customerRating == null && !visit.customerFeedback ? (
            <p className="muted">No feedback yet</p>
          ) : (
            <>
              {visit.customerRating != null ? (
                <p className="field-rating" aria-label={`${visit.customerRating} out of 5`}>
                  {'★'.repeat(visit.customerRating)}
                  <span className="muted">{'★'.repeat(Math.max(0, 5 - visit.customerRating))}</span>{' '}
                  <span className="small muted">{visit.customerRating}/5</span>
                </p>
              ) : null}
              {visit.customerFeedback ? <p className="prewrap">{visit.customerFeedback}</p> : null}
              {visit.feedbackCapturedAt ? (
                <span className="muted small">Captured {formatDateTime(visit.feedbackCapturedAt)}</span>
              ) : null}
            </>
          )}
        </section>

        <section className="card span-2">
          <div className="card-head">
            <h2>
              Photos <span className="muted small">({visit.photos.length}/{MAX_PHOTOS})</span>
            </h2>
            {actions.capture && visit.photos.length < MAX_PHOTOS ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  {addPhoto.isPending ? 'Uploading…' : 'Add photo'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  hidden
                  onChange={onPickPhoto}
                />
              </>
            ) : null}
          </div>
          {visit.photos.length === 0 ? (
            <EmptyState>No photos yet</EmptyState>
          ) : (
            <div className="field-photos">
              {[...visit.photos]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((photo) => (
                  <div key={photo.id} className="field-photo">
                    <button type="button" className="field-photo-open" onClick={() => setViewing(photo)} aria-label="View photo">
                      <PhotoImage visitId={visit.id} photo={photo} />
                    </button>
                    {actions.capture ? (
                      <button
                        type="button"
                        className="icon-btn field-photo-remove"
                        aria-label="Remove photo"
                        onClick={() => setRemoving(photo)}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>

      <NotesDialog
        open={dialog === 'notes'}
        initial={visit.notes ?? ''}
        busy={saveNotes.isPending}
        onClose={() => setDialog(null)}
        onSave={(notes) => saveNotes.mutate({ notes, version: visit.version })}
      />
      <FeedbackDialog
        open={dialog === 'feedback'}
        initialRating={visit.customerRating ?? 5}
        initialText={visit.customerFeedback ?? ''}
        busy={saveFeedback.isPending}
        onClose={() => setDialog(null)}
        onSave={(rating, text) =>
          saveFeedback.mutate({ customerRating: rating, customerFeedback: text || undefined, version: visit.version })
        }
      />
      <CompleteDialog
        open={dialog === 'complete'}
        initial={visit.outcome ?? ''}
        busy={complete.isPending}
        onClose={() => setDialog(null)}
        onSave={(outcome) => complete.mutate({ outcome: outcome || undefined, version: visit.version, location: completeLocation })}
      />
      <ReasonDialog
        open={dialog === 'cancel' || dialog === 'no_show'}
        title={dialog === 'no_show' ? 'Mark as no show' : 'Cancel visit'}
        confirmLabel={dialog === 'no_show' ? 'Mark no show' : 'Cancel visit'}
        busy={cancel.isPending || noShow.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(reason) =>
          (dialog === 'no_show' ? noShow : cancel).mutate({ reason: reason || undefined, version: visit.version })
        }
      />
      <ConfirmModal
        open={removing !== null}
        title="Remove photo"
        message="Remove this photo from the visit?"
        confirmLabel="Remove"
        danger
        busy={removePhoto.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && removePhoto.mutate(removing.id)}
      />
      <Modal open={viewing !== null} title={viewing?.caption ?? 'Photo'} wide onClose={() => setViewing(null)}>
        {viewing ? (
          <>
            <PhotoImage visitId={visit.id} photo={viewing} className="field-photo-view" />
            <p className="muted small">
              {formatDateTime(viewing.capturedAt)}
              {viewing.location ? ` · ${geoLabel(viewing.location)}` : ''}
            </p>
          </>
        ) : null}
      </Modal>
    </>
  );
}

function PhotoImage({ visitId, photo, className }: { visitId: string; photo: SiteVisitPhoto; className?: string }) {
  const content = useQuery({
    queryKey: ['site-visit-photo', visitId, photo.id],
    queryFn: () => fieldApi.photoContent(visitId, photo.id),
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!content.data) return;
    const objectUrl = URL.createObjectURL(base64ToBlob(content.data.contentBase64, content.data.contentType));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [content.data]);

  if (!url) {
    return <div className="field-photo-placeholder">{content.isError ? 'Unavailable' : 'Loading…'}</div>;
  }
  return <img src={url} alt={photo.caption ?? 'Site visit photo'} className={className} />;
}

function DialogFooter({ busy, onClose, label = 'Save' }: { busy: boolean; onClose: () => void; label?: string }) {
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
        Cancel
      </button>
      <button type="submit" form="field-dialog-form" className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : label}
      </button>
    </>
  );
}

function NotesDialog(props: { open: boolean; initial: string; busy: boolean; onClose: () => void; onSave: (notes: string) => void }) {
  const [text, setText] = useState(props.initial);
  useEffect(() => {
    if (props.open) setText(props.initial);
  }, [props.open, props.initial]);
  return (
    <Modal open={props.open} title="Visit notes" onClose={props.onClose} footer={<DialogFooter busy={props.busy} onClose={props.onClose} />}>
      <form
        id="field-dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          props.onSave(text.trim());
        }}
      >
        <TextArea label="Notes" value={text} onValue={setText} rows={6} maxLength={4000} autoFocus />
      </form>
    </Modal>
  );
}

function FeedbackDialog(props: {
  open: boolean;
  initialRating: number;
  initialText: string;
  busy: boolean;
  onClose: () => void;
  onSave: (rating: number, text: string) => void;
}) {
  const [rating, setRating] = useState(props.initialRating);
  const [text, setText] = useState(props.initialText);
  useEffect(() => {
    if (props.open) {
      setRating(props.initialRating);
      setText(props.initialText);
    }
  }, [props.open, props.initialRating, props.initialText]);
  return (
    <Modal
      open={props.open}
      title="Customer feedback"
      onClose={props.onClose}
      footer={<DialogFooter busy={props.busy} onClose={props.onClose} />}
    >
      <form
        id="field-dialog-form"
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          props.onSave(rating, text.trim());
        }}
      >
        <div className="field">
          <span>Rating</span>
          <div className="field-stars" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={rating === star}
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
                className="field-star"
                onClick={() => setRating(star)}
              >
                {star <= rating ? '★' : '☆'}
              </button>
            ))}
          </div>
        </div>
        <TextArea label="Feedback" value={text} onValue={setText} rows={4} maxLength={2000} />
      </form>
    </Modal>
  );
}

function CompleteDialog(props: { open: boolean; initial: string; busy: boolean; onClose: () => void; onSave: (outcome: string) => void }) {
  const [text, setText] = useState(props.initial);
  useEffect(() => {
    if (props.open) setText(props.initial);
  }, [props.open, props.initial]);
  return (
    <Modal
      open={props.open}
      title="Complete visit"
      onClose={props.onClose}
      footer={<DialogFooter busy={props.busy} onClose={props.onClose} label="Complete" />}
    >
      <form
        id="field-dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          props.onSave(text.trim());
        }}
      >
        <TextArea label="Outcome" value={text} onValue={setText} rows={3} maxLength={2000} autoFocus />
      </form>
    </Modal>
  );
}

function ReasonDialog(props: {
  open: boolean;
  title: string;
  confirmLabel: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (props.open) setReason('');
  }, [props.open]);
  return (
    <Modal
      open={props.open}
      title={props.title}
      onClose={props.onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={props.onClose} disabled={props.busy}>
            Back
          </button>
          <button type="submit" form="field-dialog-form" className="btn btn-danger" disabled={props.busy}>
            {props.busy ? 'Working…' : props.confirmLabel}
          </button>
        </>
      }
    >
      <form
        id="field-dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          props.onConfirm(reason.trim());
        }}
      >
        <TextField label="Reason (optional)" value={reason} onValue={setReason} maxLength={500} autoFocus />
      </form>
    </Modal>
  );
}
