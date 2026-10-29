import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { AnalyticsService } from '../../application/analytics.service';
import { AnalyticsRangeQuery } from './dto/analytics.dto';

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
  mine(@CurrentUser() actor: AuthUser, @Query() range: AnalyticsRangeQuery) {
    return this.analytics.mine(actor, range);
  }

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

  @Get()
  @RequirePermissions(PERMISSION.dashboardRead)
  overview(@CurrentUser() actor: AuthUser, @Query() range: AnalyticsRangeQuery) {
    return this.analytics.overview(actor, undefined, range);
  }

  @Get(':metricCode')
  @RequirePermissions(PERMISSION.dashboardRead)
  widget(
    @CurrentUser() actor: AuthUser,
    @Param('metricCode') metricCode: string,
    @Query() range: AnalyticsRangeQuery,
  ) {
    return this.analytics.widget(actor, metricCode, range);
  }
}
