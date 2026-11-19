// Shapes mirror apps/api/src/modules/{quotations,warranties}/application/*.mapper.ts.
// Money is integer paise; percentages are basis points (1800 = 18%).

export const QUOTATION_STATUSES = [
  'draft',
  'sent',
  'follow_up',
  'customer_deciding',
  'negotiation',
  'approved',
  'won',
  'lost',
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  follow_up: 'Follow-up',
  customer_deciding: 'Customer Deciding',
  negotiation: 'Negotiation',
  approved: 'Approved',
  won: 'Won',
  lost: 'Lost',
};

export const QUOTATION_BUCKETS = [
  'pending',
  'overdue',
  'today',
  'upcoming',
  'closing_soon',
  'closing_overdue',
  'no_follow_up',
] as const;
export type QuotationBucket = (typeof QUOTATION_BUCKETS)[number];

export type QuotationItem = {
  id: string;
  productId: string | null;
  productName: string | null;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxBps: number;
  taxRateIds: string[];
  itemCode: string | null;
  width: number | null;
  height: number | null;
  unit: string;
  /** Purchase (vendor) price per unit — internal. */
  vendorPriceMinor: number | null;
  marginType: MarginType | null;
  marginValue: number;
  lineTotalMinor: number;
  sortOrder: number;
};

export type MarginType = 'percent' | 'fixed';

export type QuotationSpec = { label: string; value: string };

export type QuotationCharge = {
  description: string;
  amountMinor: number;
  taxBps: number;
};

export type QuotationRevision = {
  revision: number;
  savedAt: string;
  status: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
};

export type ClosingPrediction = {
  probabilityBps: number;
  band: string;
  expectedCloseOn: string | null;
  reasons: string[];
};

export type Quotation = {
  id: string;
  quotationNumber: string;
  title: string | null;
  status: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  validUntilOn: string | null;
  notes: string | null;
  terms: string | null;
  sentAt: string | null;
  followUpAt: string | null;
  customerDecidingAt: string | null;
  negotiationAt: string | null;
  approvedAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  nextFollowUpAt: string | null;
  remindAt: string | null;
  expectedCloseOn: string | null;
  lastFollowedUpAt: string | null;
  followUpNote: string | null;
  reminderBucket: string | null;
  closingSoon: boolean;
  closingOverdue: boolean;
  closingPrediction: ClosingPrediction | null;
  assignedToMembershipId: string | null;
  assigneeName: string | null;
  leadId: string;
  leadNumber: string | null;
  leadTitle: string | null;
  customerName: string | null;
  customerPhone: string | null;
  /** The linked lead's lifecycle (open / won / lost) — drives the "mark lead lost too?" prompt. */
  leadLifecycleStatus?: string | null;
  nextStatuses: string[];
  items: QuotationItem[];
  charges: QuotationCharge[];
  /** Entered prices already include GST. */
  gstInclusive: boolean;
  specs: QuotationSpec[];
  /** Internal: margin on purchase-priced lines less the total discount. */
  profitMinor: number;
  revision: number;
  revisions: QuotationRevision[];
  version: number;
};

export type QuotationProduct = {
  id: string;
  sku: string | null;
  name: string;
  unitPriceMinor: number | null;
  currency: string;
};

export type QuotationTax = {
  id: string;
  name: string;
  code: string;
  rateBps: number;
  ratePercent: number;
};

export type QuotationCatalog = {
  products: QuotationProduct[];
  taxes: QuotationTax[];
  defaultGstBps: number;
  roundingStepMinor: number;
  companyName: string;
  address: string;
  bankDetails: string;
  defaultTerms: string;
  defaultSpecs: QuotationSpec[];
};

export type QuotationSettings = Omit<QuotationCatalog, 'products' | 'taxes'> & { logoDataUrl: string };

export type QuotationItemInput = {
  productId?: string;
  description: string;
  quantity: number;
  /** Exactly one price source is sent: vendor+margin, GST-inclusive, or pre-GST. */
  itemCode?: string;
  width?: number;
  height?: number;
  unit?: string;
  unitPriceMinor?: number;
  vendorPriceMinor?: number;
  marginType?: MarginType;
  marginValue?: number;
  taxBps?: number;
};

export type QuotationChargeInput = {
  description: string;
  amountMinor: number;
  taxBps?: number;
};

export type QuotationInput = {
  leadId?: string;
  title?: string;
  notes?: string;
  terms?: string;
  validUntilOn?: string;
  expectedCloseOn?: string;
  assignedToMembershipId?: string;
  items: QuotationItemInput[];
  charges?: QuotationChargeInput[];
  gstInclusive?: boolean;
  specs?: QuotationSpec[];
  /** Total discount before GST, in paise. */
  discountMinor?: number;
  version?: number;
};

export type QuotationEngineWidget = {
  code: string;
  title: string;
  count: number;
  items: Quotation[];
};

export type QuotationSummary = {
  total: number;
  pending: number;
  totalValueMinor: number;
  byStatus: Record<string, { count: number; valueMinor: number }>;
};

export type QuotationEngineDashboard = {
  generatedAt: string;
  timezone: string;
  pendingValueMinor: number;
  widgets: QuotationEngineWidget[];
};

export const WARRANTY_STATUSES = ['active', 'expired', 'claimed', 'void'] as const;
export const WARRANTY_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  expired: 'Expired',
  claimed: 'Claimed',
  void: 'Void',
};

export type WarrantyItem = {
  id: string;
  productId: string | null;
  productName: string | null;
  description: string;
  serialNumber: string | null;
  quantity: number;
};

export type Warranty = {
  id: string;
  cardNumber: string;
  status: string;
  storedStatus: string;
  statusLabel: string;
  serialNumber: string | null;
  purchasedOn: string | null;
  warrantyStartOn: string;
  warrantyEndOn: string;
  coverageNotes: string | null;
  verifyUrl: string;
  leadId: string | null;
  leadNumber: string | null;
  leadTitle: string | null;
  customerName: string | null;
  quotationId: string | null;
  quotationNumber: string | null;
  issuedByName: string | null;
  nextStatuses: string[];
  items: WarrantyItem[];
  version: number;
};

export type WarrantyProduct = { id: string; sku: string; name: string; warrantyMonths: number | null };
export type WarrantyCatalog = { products: WarrantyProduct[] };

export type WarrantyItemInput = {
  productId?: string;
  description: string;
  quantity: number;
  serialNumber?: string;
};

export type WarrantyInput = {
  leadId?: string;
  quotationId?: string;
  serialNumber?: string;
  purchasedOn?: string;
  warrantyStartOn: string;
  warrantyEndOn?: string;
  coverageNotes?: string;
  items: WarrantyItemInput[];
  version?: number;
};

/** Both /warranties/:id/qr and /warranties/:id/pdf return base64 inside the JSON envelope. */
export type WarrantyFile = {
  fileName?: string;
  cardNumber?: string;
  mimeType: string;
  verifyUrl?: string;
  contentBase64: string;
};

export type PublicWarranty = {
  valid: boolean;
  cardNumber: string;
  status: string;
  statusLabel: string;
  serialNumber: string | null;
  customerName: string | null;
  tenantName: string | null;
  purchasedOn: string | null;
  warrantyStartOn: string;
  warrantyEndOn: string;
  coverageNotes: string | null;
  items: Array<{ description: string; serialNumber: string | null; quantity: number }>;
};

export type LeadOption = {
  id: string;
  leadNumber: string;
  title: string;
  customerName: string | null;
  primaryPhone?: string | null;
  city?: string | null;
  district?: string | null;
};

export type StaffLookup = { id: string; fullName: string; designation: string | null };
