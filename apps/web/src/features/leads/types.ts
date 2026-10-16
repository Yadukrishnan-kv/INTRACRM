// Shapes mirror apps/api (crm-leads, activities, pipeline, comms, billing, search, audit).

export type LeadStatus = 'open' | 'won' | 'lost' | 'unqualified' | 'recycled';
export const LEAD_STATUSES: LeadStatus[] = ['open', 'won', 'lost', 'unqualified', 'recycled'];

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
  lastActivityAt?: string | null;
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

export type FollowUpType = 'call' | 'whatsapp' | 'visit' | 'meeting';
export const FOLLOW_UP_TYPES: Array<{ value: FollowUpType; label: string }> = [
  { value: 'call', label: 'Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'visit', label: 'Visit' },
  { value: 'meeting', label: 'Meeting' },
];

export type LeadFollowUp = {
  id: string;
  type: string;
  title: string;
  notes: string | null;
  status: string;
  dueAt: string;
  priority: number;
  assignedToMembershipId: string | null;
  assigneeName: string | null;
  completedAt: string | null;
  rescheduleCount: number;
  overdue: boolean;
  version: number;
};

export type LeadDetail = Lead & {
  pipelineId: string;
  stageId: string;
  createdAt: string;
  activities: LeadActivity[];
  followUps: LeadFollowUp[];
};

export type LookupStage = { id: string; name: string; sortOrder: number };
export type LeadLookups = {
  qualities: Array<{ code: string; name: string }>;
  sources: Array<{ id: string; code: string; name: string }>;
  pipelines: Array<{ id: string; name: string; isDefault: boolean; stages: LookupStage[] }>;
  staff: Array<{ id: string; fullName: string; designation: string | null }>;
};

export type ActivityType = 'note' | 'call' | 'email' | 'meeting' | 'sms' | 'whatsapp';
export const ACTIVITY_TYPES: Array<{ value: ActivityType; label: string }> = [
  { value: 'note', label: 'Note' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

export type StageChange = {
  id: string;
  fromStageId: string | null;
  fromStageName: string | null;
  toStageId: string;
  toStageName: string;
  fromLifecycleStatus: string | null;
  toLifecycleStatus: string;
  reason: string | null;
  changedByName: string | null;
  changedAt: string;
};

export type PipelineStage = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
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

export type PipelineColumn = { stage: PipelineStage; count: number; valueMinor: number; leads: PipelineCard[] };
export type LossReason = { id: string; code: string; name: string };

export type PipelineBoard = {
  pipeline: { id: string; name: string; code: string };
  columns: PipelineColumn[];
  totals: { leads: number; open: number; won: number; lost: number; pipelineValueMinor: number };
  lossReasons: LossReason[];
};

export type LeadAssignment = {
  id: string;
  fromMembershipId: string | null;
  fromName: string | null;
  toMembershipId: string;
  toName: string | null;
  byMembershipId: string | null;
  byName: string | null;
  reason: string | null;
  isCurrent: boolean;
  assignedAt: string;
};

export type TrackRow = {
  id: string;
  action: string;
  actionName: string;
  resourceType: string;
  resourceId: string;
  actorName: string | null;
  actorType: string;
  summary: string | null;
  number: string | null;
  from: unknown;
  to: unknown;
  createdAt: string;
};

export type TimelineEvent = {
  id: string;
  eventCode: string;
  title: string;
  subject: string | null;
  body: string | null;
  occurredAt: string;
  actorName: string | null;
  lead: { id: string; leadNumber: string; title: string; customerName: string | null } | null;
};

export type TimelineCatalogItem = { code: string; title: string };

export type SearchField = 'customer' | 'mobile' | 'lead_id' | 'quotation_number';
export type SearchHit = {
  type: 'lead' | 'quotation' | string;
  id: string;
  leadId: string;
  quotationId: string | null;
  title: string;
  subtitle: string;
  leadNumber: string | null;
  quotationNumber: string | null;
  customerName: string | null;
  primaryPhone: string | null;
  status: string | null;
  matchedBy: string;
  score: number;
};
export type SearchResult = {
  q: string;
  by: SearchField | null;
  classifiedAs: string | null;
  strategy: string | null;
  hits: SearchHit[];
};
export type SearchCatalog = {
  fields: Array<{ code: SearchField; name: string; description: string; placeholder: string }>;
  auto: { name: string; description: string };
};

export type CommsChannel = 'whatsapp' | 'sms';
export type CommsTemplate = { id: string; channel: string; code: string; name: string; body: string };
export type CommsResult = {
  id: string;
  channel: string;
  to: string;
  body: string | null;
  status: string;
  mode: string;
  provider: string;
  launchUri: string | null;
  activityId: string | null;
  warning: string | null;
};

export type BillingPayment = {
  id: string;
  amountMinor: number;
  currency: string;
  method: string | null;
  status: string | null;
  paidOn: string;
};
export type BillingInvoice = {
  id: string;
  quotationId: string | null;
  invoiceNumber: string;
  status: string;
  paymentStatus: string;
  currency: string;
  totalMinor: number;
  balanceMinor: number;
  issuedOn: string | null;
  dueOn: string | null;
  syncStatus: string;
  warning: string | null;
  payments: BillingPayment[];
};
export type BillingCustomer = {
  id: string;
  provider: string;
  externalId: string;
  displayName: string;
  syncStatus: string;
  lastSyncedAt: string | null;
  warning: string | null;
};
export type BillingSnapshot = { customer: BillingCustomer | null; invoices: BillingInvoice[] };

export type LeadSiteVisit = {
  id: string;
  status: string;
  purpose: string | null;
  scheduledAt: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  city: string | null;
  assigneeName: string | null;
  outcome: string | null;
};

export type LeadQuotation = {
  id: string;
  quotationNumber: string;
  title: string | null;
  status: string;
  currency: string;
  totalMinor: number;
  validUntilOn: string | null;
  sentAt: string | null;
  assigneeName: string | null;
};

export type LeadWarranty = {
  id: string;
  cardNumber: string;
  status: string;
  statusLabel: string | null;
  serialNumber: string | null;
  warrantyStartOn: string | null;
  warrantyEndOn: string | null;
  quotationNumber: string | null;
};
