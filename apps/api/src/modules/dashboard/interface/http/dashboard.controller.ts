import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { DashboardService } from '../../application/dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('catalog')
  @RequirePermissions(PERMISSION.dashboardRead)
  catalog() {
    return this.dashboard.catalog();
  }

  @Get('me')
  @RequirePermissions(PERMISSION.dashboardSelf)
  mine(@CurrentUser() actor: AuthUser) {
    return this.dashboard.mine(actor);
  }

  @Get()
  @RequirePermissions(PERMISSION.dashboardRead)
  overview(@CurrentUser() actor: AuthUser) {
    return this.dashboard.overview(actor);
  }

  @Get(':widgetCode')
  @RequirePermissions(PERMISSION.dashboardRead)
  widget(@CurrentUser() actor: AuthUser, @Param('widgetCode') widgetCode: string) {
    return this.dashboard.widget(actor, widgetCode);
  }
}
