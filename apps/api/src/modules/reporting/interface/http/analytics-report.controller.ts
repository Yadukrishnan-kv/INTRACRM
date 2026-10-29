import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { AnalyticsService } from '../../../analytics/application/analytics.service';
import { AnalyticsRangeQuery } from '../../../analytics/interface/http/dto/analytics.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class AnalyticsReportController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('funnel/me')
  @RequirePermissions(PERMISSION.dashboardSelf)
  mineFunnel(@CurrentUser() actor: AuthUser, @Query() range: AnalyticsRangeQuery) {
    return this.analytics.mineFunnel(actor, range);
  }

  @Get('funnel')
  @RequirePermissions(PERMISSION.dashboardRead)
  funnel(@CurrentUser() actor: AuthUser, @Query() range: AnalyticsRangeQuery) {
    return this.analytics.funnelReport(actor, undefined, range);
  }

  @Get('analytics/me')
  @RequirePermissions(PERMISSION.dashboardSelf)
  mine(@CurrentUser() actor: AuthUser, @Query() range: AnalyticsRangeQuery) {
    return this.analytics.mine(actor, range);
  }

  @Get('analytics')
  @RequirePermissions(PERMISSION.dashboardRead)
  report(@CurrentUser() actor: AuthUser, @Query() range: AnalyticsRangeQuery) {
    return this.analytics.report(actor, undefined, range);
  }
}
