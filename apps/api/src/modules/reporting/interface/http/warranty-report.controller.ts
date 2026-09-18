import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { WarrantiesService } from '../../../warranties/application/warranties.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class WarrantyReportController {
  constructor(private readonly warranties: WarrantiesService) {}

  @Get('warranties')
  @RequirePermissions(PERMISSION.warrantyRead)
  report(@CurrentUser() actor: AuthUser) {
    return this.warranties.report(actor);
  }
}
