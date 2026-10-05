import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CrmLeadsModule } from '../crm-leads/crm-leads.module';
import { DirectoryModule } from '../directory/directory.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { PipelineReportController } from './interface/http/pipeline-report.controller';
import { SiteVisitReportController } from './interface/http/site-visit-report.controller';
import { QuotationReportController } from './interface/http/quotation-report.controller';
import { StaffReportController } from './interface/http/staff-report.controller';
import { SiteVisitsModule } from '../site-visits/site-visits.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { IncentivesModule } from '../incentives/incentives.module';
import { TargetsModule } from '../targets/targets.module';
import { PerformanceModule } from '../performance/performance.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { WarrantiesModule } from '../warranties/warranties.module';
import { TasksModule } from '../tasks/tasks.module';
import { IncentiveReportController } from './interface/http/incentive-report.controller';
import { TargetReportController } from './interface/http/target-report.controller';
import { PerformanceReportController } from './interface/http/performance-report.controller';
import { DashboardReportController } from './interface/http/dashboard-report.controller';
import { AnalyticsReportController } from './interface/http/analytics-report.controller';
import { WarrantyReportController } from './interface/http/warranty-report.controller';
import { AttendanceReportController } from './interface/http/attendance-report.controller';
import { LeadReportController } from './interface/http/lead-report.controller';
import { FollowUpReportController } from './interface/http/follow-up-report.controller';
import { SalesReportController } from './interface/http/sales-report.controller';
import { ReportExportController } from './interface/http/report-export.controller';
import { TrackReportController } from './interface/http/track-report.controller';
import { ReportExportService } from './application/report-export.service';

@Module({
  imports: [
    AuditModule,
    DirectoryModule,
    CrmLeadsModule,
    PipelineModule,
    TasksModule,
    SiteVisitsModule,
    AttendanceModule,
    QuotationsModule,
    TargetsModule,
    IncentivesModule,
    PerformanceModule,
    DashboardModule,
    AnalyticsModule,
    WarrantiesModule,
  ],
  controllers: [
    ReportExportController,
    StaffReportController,
    LeadReportController,
    FollowUpReportController,
    PipelineReportController,
    SiteVisitReportController,
    QuotationReportController,
    SalesReportController,
    TargetReportController,
    IncentiveReportController,
    PerformanceReportController,
    DashboardReportController,
    AnalyticsReportController,
    WarrantyReportController,
    AttendanceReportController,
    TrackReportController,
  ],
  providers: [ReportExportService],
})
export class ReportingModule {}
