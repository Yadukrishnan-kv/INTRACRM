import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { MembershipGuard } from './common/auth/membership.guard';
import { PermissionsGuard } from './common/auth/permissions.guard';
import { RateLimitGuard } from './common/security/rate-limit.guard';
import { buildConfiguration } from './common/config/configuration';
import { validateEnv } from './common/config/env.schema';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggerModule } from './common/logging/logger.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthSecurityMiddleware } from './common/security/auth-security.middleware';
import { TenantGuard } from './common/tenancy/tenant.guard';
import { TenancyModule } from './common/tenancy/tenancy.module';
import { RequestContextMiddleware } from './common/http/request-context.middleware';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { AuditModule } from './modules/audit/audit.module';
import { CrmAccountsModule } from './modules/crm-accounts/crm-accounts.module';
import { CrmContactsModule } from './modules/crm-contacts/crm-contacts.module';
import { CrmLeadsModule } from './modules/crm-leads/crm-leads.module';
import { DirectoryModule } from './modules/directory/directory.module';
import { FilesModule } from './modules/files/files.module';
import { IdentityModule } from './modules/identity/identity.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { TargetsModule } from './modules/targets/targets.module';
import { IncentivesModule } from './modules/incentives/incentives.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { WarrantiesModule } from './modules/warranties/warranties.module';
import { SearchModule } from './modules/search/search.module';
import { SyncModule } from './modules/sync/sync.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CommsModule } from './modules/comms/comms.module';
import { BillingModule } from './modules/billing/billing.module';
import { SiteVisitsModule } from './modules/site-visits/site-visits.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validate: (config) => buildConfiguration(validateEnv(config)),
    }),
    LoggerModule,
    PrismaModule,
    RedisModule,
    TenancyModule,
    JobsModule,
    HealthModule,
    IdentityModule,
    DirectoryModule,
    CrmLeadsModule,
    CrmContactsModule,
    CrmAccountsModule,
    PipelineModule,
    ActivitiesModule,
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
    FilesModule,
    NotificationsModule,
    SearchModule,
    SyncModule,
    CatalogModule,
    CommsModule,
    BillingModule,
    RealtimeModule,
    ReportingModule,
    AuditModule,
    PlatformAdminModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      provide: APP_GUARD,
      useClass: MembershipGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, AuthSecurityMiddleware)
      .forRoutes('*');
  }
}
