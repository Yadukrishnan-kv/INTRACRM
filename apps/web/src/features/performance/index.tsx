import { P } from '../../auth/permissions';
import { guarded, type FeatureModule } from '../types';
import { AnalyticsDetailPage, AnalyticsPage } from './AnalyticsPage';
import { DashboardDetailPage } from './DashboardDetailPage';
import { DashboardPage } from './DashboardPage';
import { IncentivePlanFormPage } from './IncentivePlanFormPage';
import { IncentivePlansPage } from './IncentivePlansPage';
import { PerformanceDetailPage } from './PerformanceDetailPage';
import { PerformancePage } from './PerformancePage';
import { SalesBoardPage } from './SalesBoardPage';
import { StaffDashboardPage } from './StaffDashboardPage';
import { TargetDetailPage } from './TargetDetailPage';
import { TargetFormPage } from './TargetFormPage';
import { TargetsPage } from './TargetsPage';

const DASHBOARD_ANY = [P.dashboardRead, P.dashboardSelf] as const;

export const performanceModule: FeatureModule = {
  routes: [
    // `/dashboard` renders the personal dashboard for `dashboard:self`-only users, like mobile.
    { path: 'dashboard', element: guarded(DASHBOARD_ANY, <DashboardPage />) },
    { path: 'dashboard/me', element: guarded([P.dashboardSelf], <StaffDashboardPage />) },
    { path: 'dashboard/:widgetCode', element: guarded([P.dashboardRead], <DashboardDetailPage />) },

    { path: 'analytics', element: guarded(DASHBOARD_ANY, <AnalyticsPage />) },
    { path: 'analytics/me', element: guarded([P.dashboardSelf], <AnalyticsPage mine />) },
    { path: 'analytics/:metricCode', element: guarded(DASHBOARD_ANY, <AnalyticsDetailPage />) },

    { path: 'targets', element: guarded([P.targetRead], <TargetsPage />) },
    { path: 'targets/create', element: guarded([P.targetManage], <TargetFormPage />) },
    { path: 'targets/sales-board', element: guarded([P.targetRead], <SalesBoardPage />) },
    { path: 'targets/:targetId', element: guarded([P.targetRead], <TargetDetailPage />) },

    { path: 'performance', element: guarded([P.performanceRead], <PerformancePage />) },
    { path: 'performance/:membershipId', element: guarded([P.performanceRead], <PerformanceDetailPage />) },

    { path: 'incentives/plans', element: guarded([P.incentiveRead], <IncentivePlansPage />) },
    { path: 'incentives/plans/new', element: guarded([P.incentiveManage], <IncentivePlanFormPage />) },
    { path: 'incentives/plans/:planId/edit', element: guarded([P.incentiveManage], <IncentivePlanFormPage />) },
  ],
  nav: [
    { to: '/dashboard', label: 'Dashboard', section: 'Main', anyOf: DASHBOARD_ANY, order: 0, end: true },
    { to: '/analytics', label: 'Analytics', section: 'Insights', anyOf: DASHBOARD_ANY, order: 10 },
    { to: '/targets', label: 'Targets', section: 'Insights', anyOf: [P.targetRead], order: 20, end: true },
    { to: '/targets/sales-board', label: 'Sales board', section: 'Insights', anyOf: [P.targetRead], order: 21 },
    { to: '/performance', label: 'Performance', section: 'Insights', anyOf: [P.performanceRead], order: 30 },
    { to: '/incentives/plans', label: 'Incentive plans', section: 'Insights', anyOf: [P.incentiveRead], order: 40 },
  ],
};
