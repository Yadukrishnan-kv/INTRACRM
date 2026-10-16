import { downloadFile, request } from '../../api/client';
import type { DashboardKpis } from '../../api/endpoints';
import type {
  AnalyticsDashboard,
  AnalyticsMetricDetail,
  ComputeResult,
  DashboardOverview,
  DashboardWidgetDetail,
  IncentivePayout,
  IncentivePlan,
  IncentiveReport,
  IncentiveSlab,
  PerformanceBoard,
  PerformanceCard,
  PerformanceCatalog,
  SalesBoard,
  StaffDashboard,
  Target,
  TargetCatalog,
  TargetProgress,
} from './types';

const enc = encodeURIComponent;
const data = <T,>(p: Promise<{ data: T }>) => p.then((r) => r.data);

export type TargetListQuery = {
  periodType?: string;
  scopeType?: string;
  hasProduct?: boolean;
  cursor?: string;
  limit?: number;
};

export type PerformanceQuery = { periodType?: string; periodStart?: string; teamId?: string };

export const perfApi = {
  // Dashboard
  kpis: () => data(request<DashboardKpis>('/dashboard/kpis')),
  dashboard: () => data(request<DashboardOverview>('/dashboard')),
  dashboardMine: () => data(request<StaffDashboard>('/dashboard/me')),
  dashboardWidget: (code: string) => data(request<DashboardWidgetDetail>(`/dashboard/${enc(code)}`)),

  // Analytics
  analytics: () => data(request<AnalyticsDashboard>('/analytics')),
  analyticsMine: () => data(request<AnalyticsDashboard>('/analytics/me')),
  analyticsMetric: (code: string) => data(request<AnalyticsMetricDetail>(`/analytics/${enc(code)}`)),
  exportAnalytics: (format: 'xlsx' | 'pdf' | 'csv') =>
    downloadFile('/reports/analytics/export', `analytics-report.${format}`, { format }),

  // Targets
  targetCatalog: () => data(request<TargetCatalog>('/targets/catalog')),
  targetProgress: () => data(request<TargetProgress>('/targets/progress')),
  targets: (q: TargetListQuery) =>
    request<Target[]>('/targets', {
      query: { ...q, hasProduct: q.hasProduct ? 'true' : undefined, limit: q.limit ?? 20 },
    }),
  target: (id: string) => data(request<Target>(`/targets/${enc(id)}`)),
  createTarget: (body: Record<string, unknown>) => data(request<Target>('/targets', { method: 'POST', body })),
  updateTarget: (id: string, body: Record<string, unknown>) =>
    data(request<Target>(`/targets/${enc(id)}`, { method: 'PATCH', body })),
  deleteTarget: (id: string) => data(request<unknown>(`/targets/${enc(id)}`, { method: 'DELETE' })),
  salesBoard: (q: { period?: string; scope?: string }) =>
    data(request<SalesBoard>('/targets/sales-board', { query: q })),

  // Performance
  performanceCatalog: () => data(request<PerformanceCatalog>('/performance/catalog')),
  leaderboard: (q: PerformanceQuery) =>
    data(request<PerformanceBoard>('/performance/leaderboard', { query: { ...q, limit: 200 } })),
  performanceOf: (membershipId: string, q: PerformanceQuery) =>
    data(request<PerformanceCard>(`/performance/${enc(membershipId)}`, { query: q })),

  // Incentives
  plans: (q: { status?: string; cursor?: string }) =>
    request<IncentivePlan[]>('/incentives/plans', { query: { ...q, limit: 50 } }),
  plan: (id: string) => data(request<IncentivePlan>(`/incentives/plans/${enc(id)}`)),
  createPlan: (body: Record<string, unknown>) =>
    data(request<IncentivePlan>('/incentives/plans', { method: 'POST', body })),
  updatePlan: (id: string, body: Record<string, unknown>) =>
    data(request<IncentivePlan>(`/incentives/plans/${enc(id)}`, { method: 'PATCH', body })),
  deletePlan: (id: string) => data(request<unknown>(`/incentives/plans/${enc(id)}`, { method: 'DELETE' })),
  addSlab: (planId: string, body: Record<string, unknown>) =>
    data(request<IncentiveSlab>(`/incentives/plans/${enc(planId)}/slabs`, { method: 'POST', body })),
  updateSlab: (planId: string, slabId: string, body: Record<string, unknown>) =>
    data(request<IncentiveSlab>(`/incentives/plans/${enc(planId)}/slabs/${enc(slabId)}`, { method: 'PATCH', body })),
  deleteSlab: (planId: string, slabId: string) =>
    data(request<unknown>(`/incentives/plans/${enc(planId)}/slabs/${enc(slabId)}`, { method: 'DELETE' })),
  compute: (body: { planId: string; periodStart?: string; periodEnd?: string }) =>
    data(request<ComputeResult>('/incentives/compute', { method: 'POST', body })),
  payouts: (q: { planId?: string; status?: string; from?: string; to?: string }) =>
    data(request<IncentiveReport>('/reports/incentives', { query: q })),
  approvePayout: (id: string, body: { notes?: string; version?: number }) =>
    data(request<IncentivePayout>(`/incentives/payouts/${enc(id)}/approve`, { method: 'POST', body })),
  payPayout: (id: string, body: { notes?: string; paidAmount?: number; version?: number }) =>
    data(request<IncentivePayout>(`/incentives/payouts/${enc(id)}/pay`, { method: 'POST', body })),
};

/** React Query keys, so mutations can invalidate whole areas. */
export const perfKeys = {
  kpis: ['dashboard', 'kpis'] as const,
  dashboard: ['dashboard', 'overview'] as const,
  dashboardMine: ['dashboard', 'me'] as const,
  dashboardWidget: (code: string) => ['dashboard', 'widget', code] as const,
  analytics: (mine: boolean) => ['analytics', mine ? 'me' : 'all'] as const,
  analyticsMetric: (code: string) => ['analytics', 'metric', code] as const,
  targets: ['targets'] as const,
  targetList: (q: TargetListQuery) => ['targets', 'list', q] as const,
  targetProgress: ['targets', 'progress'] as const,
  targetCatalog: ['targets', 'catalog'] as const,
  target: (id: string) => ['targets', 'detail', id] as const,
  salesBoard: (q: { period?: string; scope?: string }) => ['targets', 'sales-board', q] as const,
  performance: ['performance'] as const,
  performanceCatalog: ['performance', 'catalog'] as const,
  leaderboard: (q: PerformanceQuery) => ['performance', 'leaderboard', q] as const,
  performanceOf: (id: string, q: PerformanceQuery) => ['performance', 'member', id, q] as const,
  incentives: ['incentives'] as const,
  plans: ['incentives', 'plans'] as const,
  plan: (id: string) => ['incentives', 'plan', id] as const,
};
