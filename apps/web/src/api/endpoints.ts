import { deviceId, deviceName, sessionStore } from '../auth/session';
import { request, sessionFromTokens } from './client';

// Shapes mirror apps/api; see the Swagger contract at /api/docs.

export type Me = {
  id: string;
  fullName: string;
  email: string;
  status: string;
  tenantId: string | null;
  tenants: Array<{ id: string; name: string }>;
  membershipId: string | null;
  roles: string[];
  permissions: string[];
};

export type LeadStatus = 'open' | 'won' | 'lost' | 'unqualified' | 'recycled';

export type Lead = {
  id: string;
  leadNumber: string;
  title: string;
  customerName: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  city: string | null;
  requirement: string | null;
  sourceId: string | null;
  sourceName: string | null;
  quality: string | null;
  estimatedValueMinor: number | null;
  currency: string;
  ownerMembershipId: string | null;
  ownerName: string | null;
  lifecycleStatus: LeadStatus;
  stageName: string;
  nextFollowUpAt: string | null;
  version: number;
  updatedAt: string;
};

export type LeadActivity = {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  occurredAt: string;
  actorName: string | null;
};

export type LeadFollowUp = {
  id: string;
  type: string;
  title: string;
  notes: string | null;
  status: string;
  dueAt: string;
  priority: number;
  assigneeName: string | null;
  overdue: boolean;
};

export type LeadDetail = Lead & {
  pipelineId: string;
  stageId: string;
  createdAt: string;
  lastActivityAt: string | null;
  activities: LeadActivity[];
  followUps: LeadFollowUp[];
};

export type KpiItem = {
  code: string;
  title: string;
  value: number;
  format: 'count' | 'money' | 'percent';
  deltaBps: number | null;
  detail: string;
};

export type DashboardKpis = {
  generatedAt: string;
  timezone: string;
  today: string;
  month: { start: string; end: string; label: string };
  items: KpiItem[];
};

export type Staff = {
  id: string;
  status: string;
  active: boolean;
  designation: string | null;
  employeeCode: string | null;
  user: { id: string; fullName: string; email: string | null; lastLoginAt: string | null };
  roles: Array<{ id: string; code: string; name: string }>;
  teams: Array<{ id: string; code: string; name: string }>;
};

export async function login(email: string, password: string, tenantId?: string): Promise<void> {
  const { data } = await request<Parameters<typeof sessionFromTokens>[0]>('/auth/login', {
    method: 'POST',
    body: { email, password, deviceId: deviceId(), deviceName: deviceName(), tenantId },
  });
  sessionStore.set(sessionFromTokens(data));
}

export async function logout(): Promise<void> {
  const session = sessionStore.get();
  try {
    if (session) await request('/auth/logout', { method: 'POST', body: { refreshToken: session.refreshToken } });
  } finally {
    sessionStore.set(null);
  }
}

export const api = {
  me: () => request<Me>('/me').then((r) => r.data),
  kpis: () => request<DashboardKpis>('/dashboard/kpis').then((r) => r.data),
  leads: (query: { q?: string; status?: LeadStatus; cursor?: string; limit?: number }) =>
    request<Lead[]>('/leads', { query }),
  lead: (id: string) => request<LeadDetail>(`/leads/${encodeURIComponent(id)}`).then((r) => r.data),
  staff: (query: { q?: string; status?: string }) => request<Staff[]>('/staff', { query }).then((r) => r.data),
};
