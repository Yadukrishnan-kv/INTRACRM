// Shapes mirror apps/api site-visits, attendance and pipeline modules.

export type GeoPoint = { latitude: number; longitude: number; accuracyMeters?: number | null };

export type SiteVisitStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

export type SiteVisitPhoto = {
  id: string;
  caption: string | null;
  contentType: string;
  byteSize: number;
  capturedAt: string;
  location: GeoPoint | null;
  sortOrder: number;
};

export type SiteVisit = {
  id: string;
  status: SiteVisitStatus;
  purpose: string | null;
  notes: string | null;
  outcome: string | null;
  scheduledAt: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  scheduledLocation: GeoPoint | null;
  checkInLocation: GeoPoint | null;
  checkOutLocation: GeoPoint | null;
  customerFeedback: string | null;
  customerRating: number | null;
  feedbackCapturedAt: string | null;
  photoCount: number;
  photos: SiteVisitPhoto[];
  assignedToMembershipId: string;
  assigneeName: string | null;
  leadId: string;
  leadNumber: string | null;
  leadTitle: string | null;
  customerName: string | null;
  version: number;
};

export type SiteVisitPhotoContent = {
  id: string;
  contentType: string;
  fileName: string | null;
  contentBase64: string;
};

export type CreateSiteVisitBody = {
  leadId: string;
  scheduledAt: string;
  purpose?: string;
  notes?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  assignedToMembershipId?: string;
  scheduledLocation?: GeoPoint;
};

export type AttendanceDayStatus = 'present' | 'late' | 'open' | 'absent';

export type AttendanceSession = {
  id: string;
  membershipId: string;
  staffName: string | null;
  workDate: string;
  punchedInAt: string;
  punchedOutAt: string | null;
  inLocation: GeoPoint | null;
  outLocation: GeoPoint | null;
  minutesWorked: number;
  status: 'open' | 'closed';
  notes: string | null;
  version: number;
};

export type AttendanceDay = {
  date: string;
  membershipId: string;
  staffName: string | null;
  firstInAt: string | null;
  lastOutAt: string | null;
  minutesWorked: number;
  status: AttendanceDayStatus;
  sessions: AttendanceSession[];
};

export type AttendanceToday = {
  timezone: string;
  lateAfter: string;
  open: AttendanceSession | null;
  today: AttendanceDay;
};

export type AttendanceDays = {
  timezone: string;
  lateAfter: string;
  from: string;
  to: string;
  items: AttendanceDay[];
};

export type AttendanceTeamReport = {
  generatedAt: string;
  from: string;
  to: string;
  timezone: string;
  lateAfter: string;
  totals: { presentDays: number; lateDays: number; openNow: number; hoursWorked: number; staffCount: number };
  byStaff: Array<{
    membershipId: string;
    name: string | null;
    presentDays: number;
    lateDays: number;
    openNow: number;
    minutesWorked: number;
  }>;
};

export type PipelineStage = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  winProbabilityBps: number;
  isOpen: boolean;
  isWon: boolean;
  isLost: boolean;
};

export type PipelineCard = {
  id: string;
  leadNumber: string;
  title: string;
  customerName: string | null;
  primaryPhone: string | null;
  quality: string | null;
  estimatedValueMinor: number | null;
  currency: string;
  ownerMembershipId: string | null;
  ownerName: string | null;
  stageId: string;
  stageName: string;
  lifecycleStatus: string;
  version: number;
  updatedAt: string;
};

export type PipelineColumn = {
  stage: PipelineStage;
  count: number;
  valueMinor: number;
  hasMore: boolean;
  leads: PipelineCard[];
};

export type LossReason = { id: string; code: string; name: string };

export type PipelineBoard = {
  pipeline: { id: string; name: string; code: string };
  columns: PipelineColumn[];
  totals: { leads: number; open: number; won: number; lost: number; pipelineValueMinor: number };
  lossReasons: LossReason[];
};

export type ChangeStageBody = {
  stageId: string;
  version: number;
  lostReasonId?: string;
  reason?: string;
};

export type LeadLookups = {
  pipelines: Array<{ id: string; name: string; isDefault: boolean; stages: Array<{ id: string; name: string; sortOrder: number }> }>;
  staff: Array<{ id: string; fullName: string; designation: string | null }>;
};

export type LeadOption = {
  id: string;
  leadNumber: string;
  title: string;
  customerName: string | null;
  city: string | null;
};
