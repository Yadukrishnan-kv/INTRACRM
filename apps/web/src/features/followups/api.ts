import { request } from '../../api/client';
import type {
  CalendarMonth,
  CommsResult,
  CompleteBody,
  CreateFollowUpBody,
  EngineDashboard,
  EngineRunResult,
  FollowUp,
  FollowUpGap,
  FollowUpListParams,
  InboxNotification,
  LeadOption,
  NotificationPreference,
  RescheduleBody,
  StaffOption,
  UpdateFollowUpBody,
} from './types';

/** Query keys shared by every page in this feature, so mutations can invalidate them. */
export const keys = {
  all: ['follow-ups'] as const,
  list: (params: FollowUpListParams) => ['follow-ups', 'list', params] as const,
  detail: (id: string) => ['follow-ups', 'detail', id] as const,
  calendar: (month: string, assignee: string, type: string) => ['follow-ups', 'calendar', month, assignee, type] as const,
  day: (day: string, assignee: string, type: string) => ['follow-ups', 'day', day, assignee, type] as const,
  dashboard: ['follow-ups', 'engine', 'dashboard'] as const,
  gaps: ['follow-ups', 'engine', 'gaps'] as const,
  notifications: ['notifications'] as const,
  inbox: ['notifications', 'inbox'] as const,
  preferences: ['notifications', 'preferences'] as const,
  staff: ['follow-ups', 'staff-options'] as const,
};

export const followUpsApi = {
  list: (params: FollowUpListParams, cursor?: string, limit = 30) =>
    request<FollowUp[]>('/follow-ups', {
      query: {
        ...params,
        overdue: params.overdue ? 'true' : undefined,
        cursor,
        limit,
      },
    }),
  get: (id: string) => request<FollowUp>(`/follow-ups/${id}`).then((r) => r.data),
  create: (body: CreateFollowUpBody) => request<FollowUp>('/follow-ups', { method: 'POST', body }).then((r) => r.data),
  update: (id: string, body: UpdateFollowUpBody) =>
    request<FollowUp>(`/follow-ups/${id}`, { method: 'PATCH', body }).then((r) => r.data),
  reschedule: (id: string, body: RescheduleBody) =>
    request<FollowUp>(`/follow-ups/${id}/reschedule`, { method: 'POST', body }).then((r) => r.data),
  complete: (id: string, body: CompleteBody) =>
    request<FollowUp>(`/follow-ups/${id}/complete`, { method: 'POST', body }).then((r) => r.data),
  calendar: (month: string | undefined, assignedToMembershipId?: string, type?: string) =>
    request<CalendarMonth>('/follow-ups/calendar', { query: { month, assignedToMembershipId, type } }).then((r) => r.data),
  dashboard: () => request<EngineDashboard>('/follow-ups/engine/dashboard').then((r) => r.data),
  gaps: () => request<FollowUpGap[]>('/follow-ups/engine/gaps').then((r) => r.data),
  run: () => request<EngineRunResult>('/follow-ups/engine/run', { method: 'POST' }).then((r) => r.data),
};

export const lookupApi = {
  /** Assignee options; the API gates /staff behind tenant:manage_users, like mobile's owner picker. */
  staff: () => request<StaffOption[]>('/staff', { query: { status: 'active', limit: 100 } }).then((r) => r.data),
  leads: (q: string) =>
    request<LeadOption[]>('/leads', { query: { q: q || undefined, status: 'open', limit: 20 } }).then((r) => r.data),
  lead: (id: string) => request<LeadOption>(`/leads/${id}`).then((r) => r.data),
  /** Logs the call on the lead timeline (mobile's comms bar does the same) and returns a tel: URI. */
  call: (leadId: string) =>
    request<CommsResult>(`/leads/${leadId}/comms/call`, { method: 'POST', body: {} }).then((r) => r.data),
};

export const notificationsApi = {
  list: (cursor?: string) => request<InboxNotification[]>('/notifications', { query: { cursor, limit: 30 } }),
  markRead: (id: string) => request<InboxNotification>(`/notifications/${id}/read`, { method: 'POST' }).then((r) => r.data),
  preferences: () => request<NotificationPreference[]>('/notifications/preferences').then((r) => r.data),
  updatePreference: (body: { eventType: string; inAppEnabled: boolean; pushEnabled: boolean }) =>
    request<NotificationPreference>('/notifications/preferences', { method: 'PUT', body }).then((r) => r.data),
};
