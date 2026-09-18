import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { StaffReportService } from '../../../directory/application/staff-report.service';

@ApiTags('reports')
@ApiBearerAuth()
@RequirePermissions(PERMISSION.tenantManageUsers)
@Controller('reports')
export class StaffReportController {
  constructor(private readonly reports: StaffReportService) {}

  @Get('staff')
  staff(@CurrentUser() actor: AuthUser) {
    return this.reports.build(actor);
  }
}
