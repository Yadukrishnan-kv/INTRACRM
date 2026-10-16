import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useCursorList } from '../../lib/hooks';
import { formatDateTime, humanize } from '../../lib/format';
import { keys, notificationsApi } from './api';
import { notificationLink, unreadIds } from './logic';
import type { InboxNotification } from './types';
import './followups.css';

const inboxKey = keys.inbox;

/** In-app inbox (mobile's NotificationsPage): tap marks read and opens the target. */
export function NotificationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const list = useCursorList(inboxKey, (cursor) => notificationsApi.list(cursor));
  const unread = unreadIds(list.items);

  const refresh = () => qc.invalidateQueries({ queryKey: inboxKey });

  const open = async (item: InboxNotification) => {
    const target = notificationLink(item.resourceType, item.resourceId);
    if (!item.readAt) {
      try {
        await notificationsApi.markRead(item.id);
      } catch (error) {
        toast.error(errorMessage(error));
      }
      void refresh();
    }
    if (target) navigate(target);
  };

  const markAll = async () => {
    setBusy(true);
    try {
      const results = await Promise.allSettled(unread.map((id) => notificationsApi.markRead(id)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) toast.error(`${failed} notification${failed === 1 ? '' : 's'} couldn’t be marked read.`);
      else toast.success('All notifications marked read');
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={unread.length ? `${unread.length} unread` : undefined}
        actions={
          <div className="btn-row">
            <Link className="btn btn-ghost" to="/settings/notifications">
              Preferences
            </Link>
            <button type="button" className="btn btn-ghost" onClick={() => list.refetch()} disabled={list.isFetching}>
              Refresh
            </button>
            <button type="button" className="btn btn-primary" onClick={markAll} disabled={busy || unread.length === 0}>
              {busy ? 'Marking…' : 'Mark all read'}
            </button>
          </div>
        }
      />
      {list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.items.length === 0 ? (
        <EmptyState>Lead assigned, follow-up, and quotation alerts will show up here.</EmptyState>
      ) : (
        <div className="card followups-list-card">
          <ul className="followups-inbox">
            {list.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`followups-inbox-item${item.readAt ? '' : ' followups-inbox-unread'}`}
                  aria-label={item.readAt ? undefined : `Unread: ${item.title}`}
                  onClick={() => open(item)}
                >
                  <span className="followups-inbox-dot" aria-hidden />
                  <span className="followups-inbox-body">
                    <span className="followups-inbox-row">
                      <span className="followups-inbox-title">{item.title}</span>
                      <span className="muted small">{formatDateTime(item.createdAt)}</span>
                    </span>
                    <span className="muted small">{item.body ?? humanize(item.eventType)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {list.hasNextPage ? (
            <div className="table-footer">
              <button type="button" className="btn btn-ghost" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
