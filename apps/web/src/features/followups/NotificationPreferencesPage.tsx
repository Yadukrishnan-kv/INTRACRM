import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useApiMutation } from '../../lib/hooks';
import { keys, notificationsApi } from './api';
import type { NotificationPreference } from './types';
import './followups.css';

type Channels = { eventType: string; inAppEnabled: boolean; pushEnabled: boolean };

/** Per-event in-app / push toggles (mobile's NotificationPreferencesPage). */
export function NotificationPreferencesPage() {
  const prefs = useQuery({ queryKey: keys.preferences, queryFn: notificationsApi.preferences });
  const mutation = useApiMutation((body: Channels) => notificationsApi.updatePreference(body), {
    success: 'Preference saved',
    invalidate: [keys.preferences],
  });

  const pendingType = mutation.isPending ? mutation.variables?.eventType : undefined;
  const toggle = (item: NotificationPreference, patch: Partial<Channels>) =>
    mutation.mutate({ eventType: item.eventType, inAppEnabled: item.inAppEnabled, pushEnabled: item.pushEnabled, ...patch });

  return (
    <>
      <Link className="back-link" to="/notifications">
        ← Notifications
      </Link>
      <PageHeader title="Notification preferences" subtitle="Choose how each alert reaches you." />
      {prefs.isLoading ? (
        <Spinner />
      ) : prefs.isError ? (
        <ErrorState error={prefs.error} onRetry={() => prefs.refetch()} />
      ) : (prefs.data ?? []).length === 0 ? (
        <EmptyState>Lead, follow-up, and quotation alerts can be toggled here.</EmptyState>
      ) : (
        <div className="card followups-list-card">
          <ul className="followups-prefs">
            {(prefs.data ?? []).map((item) => {
              const busy = pendingType === item.eventType;
              return (
                <li key={item.eventType}>
                  <div className="followups-prefs-text">
                    <strong>{item.name}</strong>
                    <div className="muted small">{item.description}</div>
                  </div>
                  <div className="followups-prefs-toggles">
                    <label className="followups-toggle">
                      <input
                        type="checkbox"
                        checked={item.inAppEnabled}
                        disabled={busy}
                        onChange={(e) => toggle(item, { inAppEnabled: e.target.checked })}
                      />
                      In-app
                    </label>
                    <label className="followups-toggle">
                      <input
                        type="checkbox"
                        checked={item.pushEnabled}
                        disabled={busy}
                        onChange={(e) => toggle(item, { pushEnabled: e.target.checked })}
                      />
                      Push
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
