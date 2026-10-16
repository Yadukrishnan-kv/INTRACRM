// Response shapes for dashboard, analytics, targets, performance and incentives.
// Mirrors apps/api/src/modules/{dashboard,analytics,targets,performance,incentives}.

export type Period = { start: string; end: string; label: string };

export type SeriesPoint = { date: string; label: string; value: number };
export type MixSlice = { code: string; label: string; value: number };
export type WidgetMetric = { code: string; label: string; value: number };

export type DashboardWidget = {
  code: string;
  title: string;
  primary: number;
  primaryLabel: string;
  previous: number;
  deltaBps: number | null;
  month: number;
  metrics: WidgetMetric[];
  series: SeriesPoint[];
  mix: MixSlice[];
};

export type DashboardOverview = {
  generatedAt: string;
  timezone: string;
  today: string;
  month: Period;
  widgets: Record<string, DashboardWidget>;
};

export type DashboardWidgetDetail = {
  generatedAt: string;
  timezone: string;
  today: string;
  month: Period;
  widget: DashboardWidget;
};

export type PersonalKpi = { code: string; title: string; detail: string; valueBps: number | null };

export type StaffDashboard = {
  generatedAt: string;
  timezone: string;
  today: string;
  month: Period;
  membership: {
    id: string;
    name: string;
    designation: string | null;
    teamName: string | null;
    rank: number;
    teamRank: number | null;
    rankedOutOf: number;
    scoreBps: number | null;
    scoreBand: string;
  };
  kpis: PersonalKpi[];
  targets: Target[];
  widgets: Record<string, DashboardWidget>;
};

// Analytics
export type FunnelStep = {
  code: string;
  label: string;
  value: number;
  conversionFromPreviousBps: number | null;
  dropOffCount: number | null;
};
export type FunnelConversion = {
  leadToQualifiedBps: number | null;
  qualifiedToQuotationBps: number | null;
  quotationToWonBps: number | null;
  overallBps: number | null;
};
export type Funnel = { steps: FunnelStep[]; conversion: FunnelConversion };

export type AnalyticsDashboard = {
  generatedAt: string;
  timezone: string;
  today: string;
  month: Period;
  funnel: Funnel & { today?: Funnel; month?: Funnel };
  widgets: Record<string, DashboardWidget>;
};

export type AnalyticsMetricDetail = {
  generatedAt: string;
  timezone: string;
  today: string;
  month: Period;
  funnel: Funnel & { today?: Funnel; month?: Funnel };
  widget: DashboardWidget;
};

// Targets
export type TargetMetric = { code: string; name: string; unit: string; description: string | null };

export type TargetCatalog = {
  periods: Array<{ code: string; title: string }>;
  scopes: Array<{ code: string; title: string }>;
  metrics: TargetMetric[];
  teams: Array<{ id: string; code: string; name: string }>;
  products: Array<{ id: string; sku: string | null; name: string }>;
  staff: Array<{ membershipId: string; name: string; teamId: string | null }>;
};

export type Target = {
  id: string;
  scopeType: string;
  scopeId: string | null;
  scopeName: string | null;
  productId: string | null;
  productName: string | null;
  productSku: string | null;
  metricCode: string;
  metricName: string;
  metricUnit: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  kinds: string[];
  targetValue: number;
  achievedValue: number;
  balance: number | null;
  remaining: number;
  achievementBps: number | null;
  attainmentBps: number | null;
  elapsedBps: number | null;
  daysTotal: number;
  daysElapsed: number;
  daysRemaining: number;
  plannedDaily: number;
  dailyRequired: number | null;
  expectedValue: number;
  variance: number;
  forecastValue: number | null;
  forecastBps: number | null;
  forecastBand: string | null;
  onTrack: boolean;
  notes: string | null;
  version: number;
};

export type TargetProgress = {
  generatedAt: string;
  timeZone: string;
  month: { periodStart: string; periodEnd: string; items: Target[] };
  today: { periodStart: string; periodEnd: string; items: Target[] };
  products: Target[];
  teams: Target[];
  totals: {
    count: number;
    onTrack: number;
    behind: number;
    averageAttainmentBps: number | null;
  };
};

export type SalesBoardCard = {
  membershipId: string | null;
  name: string;
  targetValue: number;
  achievedValue: number;
  remaining: number;
  dailyAverage: number;
  achievementBps: number | null;
  daysRemaining: number;
  dailyRequired: number | null;
  forecastValue: number | null;
  forecastBps: number | null;
  forecastBand: string | null;
  forecastDelta: number | null;
  onTrack: boolean;
  rank: number | null;
  rankOf: number;
  pace: { status: string; title: string; detail: string };
};

export type SalesBoardStanding = {
  membershipId: string;
  name: string;
  designation: string | null;
  teamName: string | null;
  rank: number;
  targetValue: number;
  achievedValue: number;
  achievementBps: number | null;
  onTrack: boolean;
};

export type SalesBoard = {
  generatedAt: string;
  timeZone: string;
  today: string;
  period: { code: string; title: string; start: string; end: string; label: string };
  periods: Array<{ code: string; title: string }>;
  scopes: Array<{ code: string; title: string }>;
  scope: string;
  metric: { code: string; name: string; unit: string };
  me: SalesBoardCard | null;
  overall: SalesBoardCard;
  standings: SalesBoardStanding[];
  podium: SalesBoardStanding[];
  insights: Array<{ date: string; value: number; cumulative: number; runningAverage: number }>;
  suggestions: Array<{ code: string; title: string; detail: string }>;
};

// Performance
export type StaffPerformance = {
  membershipId: string;
  name: string;
  designation: string | null;
  teamId: string | null;
  teamName: string | null;
  leadsCreated: number;
  leadsWon: number;
  leadsLost: number;
  followUpsDue: number;
  followUpsCompleted: number;
  quotationsSent: number;
  quotationsWon: number;
  quotationsLost: number;
  revenueMinor: number;
  salesTargetMinor: number | null;
  leadConversionBps: number | null;
  followUpCompletionBps: number | null;
  salesAchievementBps: number | null;
  quotationConversionBps: number | null;
  scoreBps: number | null;
  scoreBand: string;
  rank: number;
  teamRank: number | null;
  rankedOutOf: number;
};

export type PerformancePeriod = { type: string; start: string; end: string; label: string };

export type Leaderboards = {
  overall: StaffPerformance[];
  leadConversion: StaffPerformance[];
  followUpCompletion: StaffPerformance[];
  salesAchievement: StaffPerformance[];
  quotationConversion: StaffPerformance[];
};

export type PerformanceBoard = {
  generatedAt: string;
  period: PerformancePeriod;
  rankedOutOf: number;
  standings: StaffPerformance[];
  leaderboards: Leaderboards;
};

export type PerformanceCard = {
  generatedAt: string;
  period: PerformancePeriod;
  staff: StaffPerformance;
  neighbors: StaffPerformance[];
};

export type PerformanceCatalog = {
  periods: Array<{ code: string; title: string }>;
  kpis: Array<{ code: string; title: string; weightBps: number }>;
  teams: Array<{ id: string; code: string; name: string }>;
};

// Incentives
export type PayoutKind = 'percent' | 'flat' | 'per_unit';

export type IncentiveSlab = {
  id: string;
  planId: string;
  label: string | null;
  fromBps: number;
  toBps: number | null;
  payoutKind: PayoutKind;
  rateBps: number | null;
  amount: number | null;
  perUnitAmount: number | null;
  bonusAmount: number;
};

export type IncentivePlan = {
  id: string;
  name: string;
  description: string | null;
  metricCode: string;
  metricName: string;
  metricUnit: string;
  periodType: string;
  scopeType: string;
  basis: string;
  status: 'draft' | 'active' | 'archived';
  holdBps: number;
  minAttainmentBps: number;
  payoutCap: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  slabs: IncentiveSlab[];
  coverageIssues: string[];
  version: number;
};

export type PayoutStatus = 'draft' | 'approved' | 'paid' | 'void';

export type IncentivePayout = {
  id: string;
  planId: string;
  planName: string;
  membershipId: string | null;
  membershipName: string | null;
  periodStart: string;
  periodEnd: string;
  targetValue: number;
  achievedValue: number;
  attainmentBps: number | null;
  slabLabel: string | null;
  earnedAmount: number;
  holdAmount: number;
  payableAmount: number;
  paidAmount: number;
  status: PayoutStatus;
  notes: string | null;
  version: number;
};

export type IncentiveReport = {
  generatedAt: string;
  totals: {
    count: number;
    targetValue: number;
    achievedValue: number;
    earnedAmount: number;
    holdAmount: number;
    payableAmount: number;
    paidAmount: number;
    wonOrders: number;
    completionBps: number | null;
    averageAttainmentBps: number | null;
  };
  byStatus: Array<{ status: string; count: number; earnedAmount: number }>;
  items: IncentivePayout[];
};

export type ComputeResult = {
  planId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  computed: number;
  skipped: number;
};
