import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { SiteVisitsService } from '../../../site-visits/application/site-visits.service';
import { SiteVisitReportQuery } from '../../../site-visits/interface/http/dto/site-visit.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class SiteVisitReportController {
  constructor(private readonly visits: SiteVisitsService) {}

  @Get('site-visits')
  @RequirePermissions(PERMISSION.siteVisitRead)
  report(@CurrentUser() actor: AuthUser, @Query() query: SiteVisitReportQuery) {
    return this.visits.report(actor, query);
  }
}
