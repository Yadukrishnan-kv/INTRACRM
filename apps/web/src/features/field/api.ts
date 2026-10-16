import { request } from '../../api/client';
import type {
  AttendanceDays,
  AttendanceSession,
  AttendanceTeamReport,
  AttendanceToday,
  ChangeStageBody,
  CreateSiteVisitBody,
  GeoPoint,
  LeadLookups,
  LeadOption,
  PipelineBoard,
  PipelineCard,
  SiteVisit,
  SiteVisitPhotoContent,
  SiteVisitStatus,
} from './types';

const enc = encodeURIComponent;
const visitPath = (id: string, tail = '') => `/site-visits/${enc(id)}${tail}`;

export type VisitListQuery = { status?: SiteVisitStatus; overdue?: boolean; leadId?: string; cursor?: string };

export const fieldApi = {
  // Site visits
  visits: (q: VisitListQuery) =>
    request<SiteVisit[]>('/site-visits', {
      query: { limit: 20, cursor: q.cursor, status: q.status, leadId: q.leadId, overdue: q.overdue ? 'true' : undefined },
    }),
  visit: (id: string) => request<SiteVisit>(visitPath(id)).then((r) => r.data),
  createVisit: (body: CreateSiteVisitBody) =>
    request<SiteVisit>('/site-visits', { method: 'POST', body }).then((r) => r.data),
  checkIn: (id: string, body: { location: GeoPoint; version: number; notes?: string }) =>
    request<SiteVisit>(visitPath(id, '/check-in'), { method: 'POST', body }).then((r) => r.data),
  checkOut: (id: string, body: { location: GeoPoint; version: number; notes?: string }) =>
    request<SiteVisit>(visitPath(id, '/check-out'), { method: 'POST', body }).then((r) => r.data),
  saveNotes: (id: string, body: { notes: string; version: number }) =>
    request<SiteVisit>(visitPath(id, '/notes'), { method: 'POST', body }).then((r) => r.data),
  saveFeedback: (id: string, body: { customerFeedback?: string; customerRating?: number; version: number }) =>
    request<SiteVisit>(visitPath(id, '/feedback'), { method: 'POST', body }).then((r) => r.data),
  complete: (
    id: string,
    body: { version: number; outcome?: string; customerFeedback?: string; customerRating?: number; location?: GeoPoint },
  ) => request<SiteVisit>(visitPath(id, '/complete'), { method: 'POST', body }).then((r) => r.data),
  cancel: (id: string, body: { version: number; reason?: string }) =>
    request<SiteVisit>(visitPath(id, '/cancel'), { method: 'POST', body }).then((r) => r.data),
  noShow: (id: string, body: { version: number; reason?: string }) =>
    request<SiteVisit>(visitPath(id, '/no-show'), { method: 'POST', body }).then((r) => r.data),
  addPhoto: (
    id: string,
    body: { contentType: string; contentBase64: string; caption?: string; fileName?: string; location?: GeoPoint },
  ) => request<SiteVisit>(visitPath(id, '/photos'), { method: 'POST', body }).then((r) => r.data),
  photoContent: (visitId: string, photoId: string) =>
    request<SiteVisitPhotoContent>(visitPath(visitId, `/photos/${enc(photoId)}`)).then((r) => r.data),
  removePhoto: (visitId: string, photoId: string) =>
    request<SiteVisit>(visitPath(visitId, `/photos/${enc(photoId)}`), { method: 'DELETE' }).then((r) => r.data),

  // Lead helpers for the schedule form
  leadOptions: (q: string) =>
    request<LeadOption[]>('/leads', { query: { q: q || undefined, limit: 20 } }).then((r) => r.data),
  lead: (id: string) => request<LeadOption>(`/leads/${enc(id)}`).then((r) => r.data),
  lookups: () => request<LeadLookups>('/leads/lookups').then((r) => r.data),

  // Attendance
  attendanceToday: () => request<AttendanceToday>('/attendance/today').then((r) => r.data),
  attendanceDays: (q: { from?: string; to?: string; membershipId?: string }) =>
    request<AttendanceDays>('/attendance/days', { query: q }).then((r) => r.data),
  punchIn: (body: { location: GeoPoint; notes?: string }) =>
    request<AttendanceSession>('/attendance/punch-in', { method: 'POST', body }).then((r) => r.data),
  punchOut: (body: { location: GeoPoint; notes?: string }) =>
    request<AttendanceSession>('/attendance/punch-out', { method: 'POST', body }).then((r) => r.data),
  attendanceTeam: (q: { from?: string; to?: string }) =>
    request<AttendanceTeamReport>('/reports/attendance', { query: q }).then((r) => r.data),

  // Pipeline
  board: (pipelineId?: string) =>
    request<PipelineBoard>('/pipelines/board', { query: { pipelineId, limit: 50 } }).then((r) => r.data),
  changeStage: (leadId: string, body: ChangeStageBody) =>
    request<PipelineCard>(`/leads/${enc(leadId)}/stage-changes`, { method: 'POST', body }).then((r) => r.data),
};
