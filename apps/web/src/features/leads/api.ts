import { request } from '../../api/client';
import type {
  ActivityType,
  BillingCustomer,
  BillingSnapshot,
  CommsChannel,
  CommsResult,
  CommsTemplate,
  Lead,
  LeadActivity,
  LeadAssignment,
  LeadDetail,
  LeadFollowUp,
  LeadLookups,
  LeadQuotation,
  LeadSiteVisit,
  LeadStatus,
  LeadWarranty,
  PipelineBoard,
  PipelineCard,
  SearchCatalog,
  SearchField,
  SearchResult,
  StageChange,
  TimelineCatalogItem,
  TimelineEvent,
  TrackRow,
} from './types';

const id = (value: string) => encodeURIComponent(value);
const data = <T,>(p: Promise<{ data: T }>) => p.then((r) => r.data);

export type LeadListFilters = {
  q?: string;
  status?: LeadStatus;
  quality?: string;
  sourceId?: string;
  ownerMembershipId?: string;
};

/** Query keys shared by every lead page so mutations can invalidate them. */
export const leadKeys = {
  all: ['leads'] as const,
  list: (filters: LeadListFilters) => ['leads', 'list', filters] as const,
  lookups: ['leads', 'lookups'] as const,
  detail: (leadId: string) => ['lead', leadId] as const,
  sub: (leadId: string, part: string) => ['lead', leadId, part] as const,
  board: ['leads', 'pipeline-board'] as const,
  timeline: (eventCode: string) => ['timeline', eventCode] as const,
};

export const leadsApi = {
  list: (filters: LeadListFilters, cursor?: string) =>
    request<Lead[]>('/leads', { query: { ...filters, cursor, limit: 50 } }),
  lookups: () => data(request<LeadLookups>('/leads/lookups')),
  get: (leadId: string) => data(request<LeadDetail>(`/leads/${id(leadId)}`)),
  create: (body: Record<string, unknown>) => data(request<LeadDetail>('/leads', { method: 'POST', body })),
  update: (leadId: string, body: Record<string, unknown>) =>
    data(request<LeadDetail>(`/leads/${id(leadId)}`, { method: 'PATCH', body })),
  remove: (leadId: string) => data(request<{ id: string; deleted: boolean }>(`/leads/${id(leadId)}`, { method: 'DELETE' })),
  assign: (leadId: string, ownerMembershipId: string, reason?: string) =>
    data(
      request<LeadDetail>(`/leads/${id(leadId)}/assign`, {
        method: 'POST',
        body: { ownerMembershipId, ...(reason ? { reason } : {}) },
      }),
    ),
  assignments: (leadId: string) => data(request<LeadAssignment[]>(`/leads/${id(leadId)}/assignments`)),
  tracks: (leadId: string, cursor?: string) =>
    request<TrackRow[]>(`/leads/${id(leadId)}/tracks`, { query: { cursor, limit: 50 } }),
  activities: (leadId: string, cursor?: string) =>
    request<LeadActivity[]>(`/leads/${id(leadId)}/activities`, { query: { cursor, limit: 50 } }),
  addActivity: (leadId: string, input: { type: ActivityType; subject?: string; body?: string }) =>
    data(request<LeadActivity>(`/leads/${id(leadId)}/activities`, { method: 'POST', body: input })),
  followUps: (leadId: string) => data(request<LeadFollowUp[]>(`/leads/${id(leadId)}/follow-ups`)),
  completeFollowUp: (leadId: string, followUpId: string, version?: number) =>
    data(
      request<LeadFollowUp>(`/leads/${id(leadId)}/follow-ups/${id(followUpId)}/complete`, {
        method: 'POST',
        body: version ? { version } : {},
      }),
    ),
  stageChanges: (leadId: string) => data(request<StageChange[]>(`/leads/${id(leadId)}/stage-changes`)),
  changeStage: (leadId: string, input: { stageId: string; version?: number; lostReasonId?: string; reason?: string }) =>
    data(request<PipelineCard>(`/leads/${id(leadId)}/stage-changes`, { method: 'POST', body: input })),
  board: () => data(request<PipelineBoard>('/pipelines/board')),
  siteVisits: (leadId: string) => data(request<LeadSiteVisit[]>(`/leads/${id(leadId)}/site-visits`)),
  quotations: (leadId: string) => data(request<LeadQuotation[]>(`/leads/${id(leadId)}/quotations`)),
  warranties: (leadId: string) => data(request<LeadWarranty[]>(`/leads/${id(leadId)}/warranties`)),
  billing: (leadId: string) => data(request<BillingSnapshot>(`/leads/${id(leadId)}/billing`)),
  syncBillingCustomer: (leadId: string) =>
    data(request<BillingCustomer>(`/leads/${id(leadId)}/billing/customers/sync`, { method: 'POST' })),
  leadTimeline: (leadId: string, cursor?: string) =>
    request<TimelineEvent[]>(`/leads/${id(leadId)}/timeline`, { query: { cursor, limit: 50 } }),
};

export const timelineApi = {
  catalog: () => data(request<TimelineCatalogItem[]>('/timeline/catalog')),
  list: (eventCode: string | undefined, cursor?: string) =>
    request<TimelineEvent[]>('/timeline', { query: { eventCode, cursor, limit: 30 } }),
};

export const searchApi = {
  catalog: () => data(request<SearchCatalog>('/search/catalog')),
  search: (q: string, by: SearchField | undefined, signal?: AbortSignal) =>
    data(request<SearchResult>('/search', { query: { q, by, limit: 20 }, signal })),
};

export const commsApi = {
  templates: (channel: CommsChannel) => data(request<CommsTemplate[]>('/comms/templates', { query: { channel } })),
  call: (leadId: string, notes?: string) =>
    data(request<CommsResult>(`/leads/${id(leadId)}/comms/call`, { method: 'POST', body: notes ? { notes } : {} })),
  message: (leadId: string, channel: CommsChannel, input: { templateCode?: string; body?: string }) =>
    data(
      request<CommsResult>(`/leads/${id(leadId)}/comms/${channel}`, {
        method: 'POST',
        body: {
          ...(input.templateCode ? { templateCode: input.templateCode } : {}),
          ...(input.body !== undefined ? { body: input.body } : {}),
        },
      }),
    ),
};
