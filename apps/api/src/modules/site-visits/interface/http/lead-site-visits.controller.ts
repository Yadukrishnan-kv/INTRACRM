import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { SiteVisitsService } from '../../application/site-visits.service';

@ApiTags('site-visits')
@ApiBearerAuth()
@Controller('leads')
export class LeadSiteVisitsController {
  constructor(private readonly visits: SiteVisitsService) {}

  @Get(':leadId/site-visits')
  @RequirePermissions(PERMISSION.siteVisitRead)
  listForLead(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.visits.listForLead(actor, leadId);
  }
}
