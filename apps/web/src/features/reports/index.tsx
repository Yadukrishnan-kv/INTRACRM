import { P } from '../../auth/permissions';
import { guarded, type FeatureModule } from '../types';
import { FollowUpReportPage, LeadReportPage, QuotationReportPage, SalesReportPage } from './CrmReports';
import { FunnelReportPage, IncentiveReportPage, PerformanceReportPage, PipelineAnalyticsPage, TargetReportPage } from './InsightReports';
import { AttendanceReportPage, SiteVisitReportPage, StaffReportPage, TrackReportPage, WarrantyReportPage } from './OpsReports';
import { ReportsHubPage } from './ReportsHubPage';
import { HUB_PERMISSIONS } from './logic';

// Gates match the API's @RequirePermissions on each GET /reports/* endpoint.
export const reportsModule: FeatureModule = {
  routes: [
    { path: 'reports', element: guarded(HUB_PERMISSIONS, <ReportsHubPage />) },
    { path: 'reports/leads', element: guarded([P.leadRead], <LeadReportPage />) },
    { path: 'reports/pipeline', element: guarded([P.leadRead], <PipelineAnalyticsPage />) },
    { path: 'reports/follow-ups', element: guarded([P.followUpRead], <FollowUpReportPage />) },
    { path: 'reports/quotations', element: guarded([P.quotationRead], <QuotationReportPage />) },
    { path: 'reports/sales', element: guarded([P.quotationRead], <SalesReportPage />) },
    { path: 'reports/warranties', element: guarded([P.warrantyRead], <WarrantyReportPage />) },
    { path: 'reports/site-visits', element: guarded([P.siteVisitRead], <SiteVisitReportPage />) },
    { path: 'reports/attendance', element: guarded([P.attendanceRead], <AttendanceReportPage />) },
    { path: 'reports/targets', element: guarded([P.targetRead], <TargetReportPage />) },
    { path: 'reports/performance', element: guarded([P.performanceRead], <PerformanceReportPage />) },
    { path: 'reports/incentives', element: guarded([P.incentiveRead], <IncentiveReportPage />) },
    { path: 'reports/staff', element: guarded([P.tenantManageUsers], <StaffReportPage />) },
    { path: 'reports/funnel', element: guarded([P.dashboardRead], <FunnelReportPage />) },
    { path: 'reports/funnel/me', element: guarded([P.dashboardSelf], <FunnelReportPage key="me" personal />) },
    { path: 'reports/tracks', element: guarded([P.auditRead], <TrackReportPage />) },
  ],
  nav: [{ to: '/reports', label: 'Reports', section: 'Insights', anyOf: HUB_PERMISSIONS, order: 50 }],
};
