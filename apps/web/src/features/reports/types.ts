// Response shapes for GET /reports/* (see apps/api/src/modules/reporting and the
// services each controller delegates to). Money is integer minor units, percents are bps.

export type LeadReport = {
  generatedAt: string;
  totals: {
    total: number;
    open: number;
    won: number;
    lost: number;
    unqualified: number;
    recycled: number;
    unassigned: number;
    estimatedValueMinor: number;
    wonValueMinor: number;
    winRateBps: number | null;
  };
  byLifecycle: { status: string; count: number; valueMinor: number }[];
  byQuality: { quality: string; count: number }[];
  bySource: { sourceId: string | null; name: string | null; count: number; valueMinor: number }[];
  byOwner: {
    membershipId: string | null;
    name: string | null;
    total: number;
    open: number;
    won: number;
    lost: number;
    valueMinor: number;
  }[];
  byStage?: { stageId?: string; stageName: string; count: number; valueMinor?: number }[];
  byCity?: { city: string; count: number }[];
};

export type FollowUpReport = {
  generatedAt: string;
  totals: {
    total: number;
    pending: number;
    completed: number;
    cancelled: number;
    skipped: number;
    overdue: number;
    today: number;
    upcoming: number;
    rescheduled: number;
    completionRateBps: number | null;
  };
  byStatus: { status: string; count: number }[];
  byType: { type: string; count: number; completed: number }[];
  byAssignee: {
    membershipId: string;
    name: string | null;
    total: number;
    pending: number;
    completed: number;
    overdue: number;
  }[];
};

export type QuotationReport = {
  generatedAt: string;
  totals: {
    total: number;
    draft: number;
    sent: number;
    followUp: number;
    customerDeciding: number;
    negotiation: number;
    approved: number;
    won: number;
    lost: number;
    openValueMinor: number;
    wonValueMinor: number;
    lostValueMinor: number;
    winRateBps: number | null;
    pending: number;
    pendingValueMinor: number;
    overdueReminders: number;
    closingSoon: number;
    closingOverdue: number;
    noFollowUp: number;
    averagePredictionBps: number | null;
  };
  byStatus: { status: string; count: number; valueMinor: number }[];
  byAssignee: {
    membershipId: string | null;
    name: string | null;
    total: number;
    won: number;
    lost: number;
    wonValueMinor: number;
  }[];
};

export type SalesReport = {
  generatedAt: string;
  totals: {
    deals: number;
    revenueMinor: number;
    averageDealMinor: number | null;
    lostDeals: number;
    lostValueMinor: number;
    closedDeals: number;
    winRateBps: number | null;
  };
  byAssignee: {
    membershipId: string | null;
    name: string | null;
    deals: number;
    revenueMinor: number;
    lostDeals: number;
  }[];
  byMonth: { month: string; deals: number; revenueMinor: number }[];
};

export type PipelineStageStat = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  winProbabilityBps: number | null;
  isWon: boolean;
  isLost: boolean;
  currentCount: number;
  currentValueMinor: number;
  reachedCount: number;
  conversionFromPreviousBps: number | null;
  dropOffCount: number | null;
};

export type PipelineAnalytics = {
  generatedAt: string;
  pipeline: { id: string; name: string };
  totals: {
    open: number;
    won: number;
    lost: number;
    pipelineValueMinor: number;
    wonValueMinor: number;
    leads: number;
    winRateBps: number | null;
    conversionBps: number | null;
  };
  stages: PipelineStageStat[];
};

export type ChartPoint = { code?: string; date?: string; label: string; value: number };

export type FunnelStage = {
  code: string;
  label: string;
  rank: number;
  currentCount: number;
  reachedCount: number;
  currentValueMinor: number;
  reachedValueMinor: number;
  conversionFromPreviousBps: number | null;
  dropOffCount: number | null;
  series: ChartPoint[];
};

export type FunnelTrendPoint = { date: string; label: string } & Record<string, number | string>;

export type FunnelReport = {
  generatedAt: string;
  timezone: string;
  today: string;
  month: { start: string; end: string; label: string };
  /** Applied from/to filter; null when the report covers every live lead. */
  range: { from: string; to: string } | null;
  stages: FunnelStage[];
  conversion: {
    leadToQualifiedBps: number | null;
    qualifiedToQuotationBps: number | null;
    quotationToNegotiationBps: number | null;
    negotiationToWonBps: number | null;
    overallBps: number | null;
  };
  charts: {
    funnel: ChartPoint[];
    current: ChartPoint[];
    conversion: ChartPoint[];
    trend: FunnelTrendPoint[];
  };
};

export type StaffReport = {
  generatedAt: string;
  totals: { total: number; active: number; inactive: number; invited: number };
  byRole: { roleId: string; roleCode: string; roleName: string; count: number }[];
  byTeam: { teamId: string; teamName: string; count: number }[];
  unassignedTeam: number;
  roster: {
    id: string;
    fullName: string;
    email: string | null;
    status: string;
    active: boolean;
    designation: string | null;
    roles: string[];
    teams: string[];
  }[];
};

export type AttendanceReport = {
  generatedAt: string;
  from: string;
  to: string;
  timezone: string;
  lateAfter: string;
  totals: {
    presentDays: number;
    lateDays: number;
    openNow: number;
    hoursWorked: number;
    staffCount: number;
  };
  byStaff: {
    membershipId: string;
    name: string | null;
    presentDays: number;
    lateDays: number;
    openNow: number;
    minutesWorked: number;
  }[];
  byDay: { date: string; present: number; late: number; open: number }[];
};

export type SiteVisitReport = {
  generatedAt: string;
  totals: {
    total: number;
    scheduled: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    noShow: number;
    withGps: number;
    withPhotos: number;
    withFeedback: number;
    averageRating: number | null;
  };
  byStatus: { status: string; count: number }[];
  byAssignee: {
    membershipId: string;
    name: string | null;
    total: number;
    completed: number;
    noShow: number;
    withGps: number;
    averageRating: number | null;
  }[];
};

type TargetGroup = { count: number; onTrack: number; averageAttainmentBps?: number | null };

export type TargetReport = {
  generatedAt: string;
  totals: {
    count: number;
    onTrack: number;
    behind: number;
    hit: number;
    missed: number;
    ahead: number;
    atRisk: number;
    averageAttainmentBps: number | null;
    averageForecastBps: number | null;
    targetValue: number;
    achievedValue: number;
    balance: number;
  };
  byPeriod: (TargetGroup & { periodType: string })[];
  byScope: (TargetGroup & { scopeType: string })[];
  byMetric: {
    metricCode: string;
    metricName: string | null;
    count: number;
    targetValue: number;
    achievedValue: number;
    balance: number;
  }[];
  byForecast: { band: string | null; count: number }[];
  products: (TargetGroup & { productId: string; productName: string | null })[];
  teams: (TargetGroup & { scopeId?: string; scopeName: string | null })[];
};

export type WarrantyReport = {
  generatedAt: string;
  totals: { total: number; active: number; expired: number; claimed: number; void: number };
  byStatus: { status: string; count: number }[];
};

export type PerformanceRow = {
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
  scoreBand: string | null;
  rank: number | null;
  teamRank: number | null;
  rankedOutOf: number | null;
};

export type PerformanceReport = {
  generatedAt: string;
  period: { type: string; start: string; end: string; label: string };
  totals: {
    staff: number;
    scored: number;
    averageScoreBps: number | null;
    outstanding: number;
    strong: number;
    average: number;
    needsWork: number;
    noData: number;
  };
  top: PerformanceRow[];
  byTeam: { teamId: string | null; teamName: string | null; count: number; averageScoreBps: number | null }[];
  leaderboards?: Record<string, PerformanceRow[]>;
};

export type TrackReport = {
  generatedAt: string;
  totals: {
    total: number;
    create: number;
    update: number;
    delete: number;
    assign: number;
    statusChange: number;
  };
  byAction: { action: string; name: string; count: number }[];
  byResource: { resourceType: string; count: number }[];
  byActor: { actorId: string | null; name: string | null; count: number }[];
  byDay: { date: string; count: number }[];
};

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
  status: string;
};

export type IncentiveReport = {
  generatedAt: string;
  timeZone: string;
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
  byStatus: { status: string; count: number; earnedAmount: number }[];
  byMember: {
    membershipId: string | null;
    membershipName: string | null;
    targetValue: number;
    achievedValue: number;
    earnedAmount: number;
    payableAmount: number;
    paidAmount: number;
    wonOrders: number;
    periods: number;
  }[];
  items: IncentivePayout[];
};

export type ReportLookups = {
  staff: { id: string; fullName: string; designation: string | null }[];
  pipelines: { id: string; name: string; isDefault: boolean }[];
};

export type IncentivePlanOption = { id: string; name: string };
