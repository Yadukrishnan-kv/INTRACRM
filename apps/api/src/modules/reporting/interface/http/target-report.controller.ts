import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { TargetsService } from '../../../targets/application/targets.service';
import { TargetReportQuery } from '../../../targets/interface/http/dto/target.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class TargetReportController {
  constructor(private readonly targets: TargetsService) {}

  @Get('targets')
  @RequirePermissions(PERMISSION.targetRead)
  report(@CurrentUser() actor: AuthUser, @Query() query: TargetReportQuery) {
    return this.targets.report(actor, query);
  }
}
