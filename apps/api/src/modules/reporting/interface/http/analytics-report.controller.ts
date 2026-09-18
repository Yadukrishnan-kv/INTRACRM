import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { AnalyticsService } from '../../../analytics/application/analytics.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class AnalyticsReportController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('funnel/me')
  @RequirePermissions(PERMISSION.dashboardSelf)
  mineFunnel(@CurrentUser() actor: AuthUser) {
    return this.analytics.mineFunnel(actor);
  }

  @Get('funnel')
  @RequirePermissions(PERMISSION.dashboardRead)
  funnel(@CurrentUser() actor: AuthUser) {
    return this.analytics.funnelReport(actor);
  }

  @Get('analytics/me')
  @RequirePermissions(PERMISSION.dashboardSelf)
  mine(@CurrentUser() actor: AuthUser) {
    return this.analytics.mine(actor);
  }

  @Get('analytics')
  @RequirePermissions(PERMISSION.dashboardRead)
  report(@CurrentUser() actor: AuthUser) {
    return this.analytics.report(actor);
  }
}
