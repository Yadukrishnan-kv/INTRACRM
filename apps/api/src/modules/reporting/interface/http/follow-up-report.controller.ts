import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { FollowUpsService } from '../../../tasks/application/follow-ups.service';
import { FollowUpReportQuery } from '../../../tasks/interface/http/dto/follow-up.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class FollowUpReportController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Get('follow-ups')
  @RequirePermissions(PERMISSION.followUpRead)
  report(@CurrentUser() actor: AuthUser, @Query() query: FollowUpReportQuery) {
    return this.followUps.report(actor, query);
  }
}
