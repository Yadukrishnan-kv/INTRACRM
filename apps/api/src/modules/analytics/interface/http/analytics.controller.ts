import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { AnalyticsService } from '../../application/analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('catalog')
  @RequirePermissions(PERMISSION.dashboardRead)
  catalog() {
    return this.analytics.catalog();
  }

  @Get('me')
  @RequirePermissions(PERMISSION.dashboardSelf)
  mine(@CurrentUser() actor: AuthUser) {
    return this.analytics.mine(actor);
  }

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

  @Get()
  @RequirePermissions(PERMISSION.dashboardRead)
  overview(@CurrentUser() actor: AuthUser) {
    return this.analytics.overview(actor);
  }

  @Get(':metricCode')
  @RequirePermissions(PERMISSION.dashboardRead)
  widget(@CurrentUser() actor: AuthUser, @Param('metricCode') metricCode: string) {
    return this.analytics.widget(actor, metricCode);
  }
}
