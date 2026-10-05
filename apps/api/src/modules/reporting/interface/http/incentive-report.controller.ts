import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { IncentivesService } from '../../../incentives/application/incentives.service';
import { IncentiveReportQuery } from '../../../incentives/interface/http/dto/incentive.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class IncentiveReportController {
  constructor(private readonly incentives: IncentivesService) {}

  @Get('incentives')
  @RequirePermissions(PERMISSION.incentiveRead)
  report(@CurrentUser() actor: AuthUser, @Query() query: IncentiveReportQuery) {
    return this.incentives.report(actor, query);
  }
}
