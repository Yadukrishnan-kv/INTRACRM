// Shapes mirror apps/api/src/modules/tasks and apps/api/src/modules/notifications.

export const FOLLOW_UP_TYPES = ['call', 'whatsapp', 'visit', 'meeting'] as const;
export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];

export const FOLLOW_UP_TYPE_TITLES: Record<FollowUpType, string> = {
  call: 'Call',
  whatsapp: 'WhatsApp',
  visit: 'Visit',
  meeting: 'Meeting',
};

export const FOLLOW_UP_STATUSES = ['pending', 'completed', 'cancelled', 'skipped'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export type ListBucket = 'overdue' | 'today' | 'upcoming';
export type EngineBucket = ListBucket | 'no_follow_up';

export type FollowUp = {
  id: string;
  type: string;
  title: string;
  notes: string | null;
  dueAt: string;
  remindAt: string | null;
  priority: number;
  status: string;
  assignedToMembershipId: string;
  assigneeName: string | null;
  leadId: string;
  leadNumber: string | null;
  leadTitle: string | null;
  leadCustomerName: string | null;
  leadPhone: string | null;
  completedAt: string | null;
  rescheduleCount: number;
  lastRescheduledAt: string | null;
  overdue: boolean;
  engineBucket: EngineBucket | null;
  version: number;
};

export type FollowUpListParams = {
  status?: string;
  type?: string;
  leadId?: string;
  assignedToMembershipId?: string;
  overdue?: boolean;
  bucket?: ListBucket;
  dueOn?: string;
  dueFrom?: string;
  dueTo?: string;
};

export type CreateFollowUpBody = {
  leadId: string;
  type: FollowUpType;
  dueAt: string;
  remindAt?: string;
  title?: string;
  notes?: string;
  priority?: number;
  assignedToMembershipId?: string;
};

export type UpdateFollowUpBody = {
  type?: FollowUpType;
  title?: string;
  notes?: string;
  priority?: number;
  assignedToMembershipId?: string;
  version?: number;
};

export type RescheduleBody = { dueAt: string; remindAt?: string; reason?: string; version?: number };
export type CompleteBody = { notes?: string; version?: number };

export type DayBand = 'overdue' | 'due' | 'completed' | 'cancelled';

export type CalendarDay = {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  total: number;
  overdue: number;
  due: number;
  completed: number;
  cancelled: number;
  band: DayBand | null;
};

export type CalendarTotals = { total: number; overdue: number; due: number; completed: number; cancelled: number };

export type CalendarMonth = {
  month: string;
  timeZone: string;
  today: string;
  monthStart: string;
  monthEnd: string;
  gridStart: string;
  gridEnd: string;
  days: CalendarDay[];
  totals: CalendarTotals;
};

export type FollowUpGap = {
  leadId: string;
  leadNumber: string;
  leadTitle: string;
  ownerName: string | null;
  updatedAt?: string;
};

export type EngineWidget =
  | { code: ListBucket; title: string; count: number; items: FollowUp[] }
  | { code: 'no_follow_up'; title: string; count: number; items: FollowUpGap[] };

export type EscalationRule = { level: number; code: string; title: string; hours: number; audience: string };

export type EngineDashboard = {
  generatedAt: string;
  timezone: string;
  widgets: EngineWidget[];
  escalation: { overduePastManagerSla: number; overduePastAdminSla: number; rules: EscalationRule[] };
};

export type EngineRunResult = { tenants: number; notified: number };

export type StaffOption = {
  id: string;
  status: string;
  designation: string | null;
  user: { id: string; fullName: string; email: string };
};

export type LeadOption = { id: string; leadNumber: string; title: string; customerName: string | null };

export type CommsResult = { id: string; channel: string; mode?: string; launchUri?: string | null; warning?: string | null };

export type InboxNotification = {
  id: string;
  eventType: string;
  title: string;
  body: string | null;
  resourceType: string | null;
  resourceId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPreference = {
  eventType: string;
  name: string;
  description: string;
  resourceType: string;
  inAppEnabled: boolean;
  pushEnabled: boolean;
};
