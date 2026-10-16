import { P } from '../../auth/permissions';
import { guarded, type FeatureModule } from '../types';
import { FollowUpCalendarPage } from './FollowUpCalendarPage';
import { FollowUpDetailPage } from './FollowUpDetailPage';
import { FollowUpFormPage } from './FollowUpFormPage';
import { FollowUpsPage } from './FollowUpsPage';
import { NotificationPreferencesPage } from './NotificationPreferencesPage';
import { NotificationsPage } from './NotificationsPage';
import { UnreadBadge } from './UnreadBadge';

export const followupsModule: FeatureModule = {
  routes: [
    { path: 'tasks', element: guarded([P.followUpRead], <FollowUpsPage />) },
    { path: 'tasks/create', element: guarded([P.followUpCreate], <FollowUpFormPage />) },
    { path: 'tasks/calendar', element: guarded([P.followUpRead], <FollowUpCalendarPage />) },
    { path: 'tasks/:followUpId', element: guarded([P.followUpRead], <FollowUpDetailPage />) },
    { path: 'tasks/:followUpId/edit', element: guarded([P.followUpUpdate], <FollowUpFormPage />) },
    { path: 'notifications', element: guarded([P.notificationRead], <NotificationsPage />) },
    { path: 'settings/notifications', element: guarded([P.notificationRead], <NotificationPreferencesPage />) },
  ],
  nav: [
    { to: '/tasks', label: 'Follow-ups', section: 'Main', anyOf: [P.followUpRead], order: 20, end: true },
    { to: '/tasks/calendar', label: 'Calendar', section: 'Main', anyOf: [P.followUpRead], order: 21 },
    { to: '/notifications', label: 'Notifications', section: 'Main', badge: UnreadBadge, anyOf: [P.notificationRead], order: 90 },
    { to: '/settings/notifications', label: 'Notification preferences', section: 'Account', anyOf: [P.notificationRead], order: 20 },
  ],
};
