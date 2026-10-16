import { useCursorList } from '../../lib/hooks';
import { keys, notificationsApi } from './api';

/** Nav badge: unread items in the loaded inbox pages, like the mobile dashboard bell. */
export function UnreadBadge() {
  const { items } = useCursorList(keys.inbox, (cursor) => notificationsApi.list(cursor));
  const unread = items.filter((n) => !n.readAt).length;
  return unread > 0 ? <span className="nav-badge">{unread > 99 ? '99+' : unread}</span> : null;
}
