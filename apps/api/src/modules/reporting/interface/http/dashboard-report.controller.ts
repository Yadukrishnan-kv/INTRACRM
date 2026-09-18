import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { DashboardService } from '../../../dashboard/application/dashboard.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class DashboardReportController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard/me')
  @RequirePermissions(PERMISSION.dashboardSelf)
  mine(@CurrentUser() actor: AuthUser) {
    return this.dashboard.mine(actor);
  }

  @Get('dashboard')
  @RequirePermissions(PERMISSION.dashboardRead)
  report(@CurrentUser() actor: AuthUser) {
    return this.dashboard.report(actor);
  }
}
