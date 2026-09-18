import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { QuotationsService } from '../../application/quotations.service';

@ApiTags('quotations')
@ApiBearerAuth()
@Controller('leads')
export class LeadQuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get(':leadId/quotations')
  @RequirePermissions(PERMISSION.quotationRead)
  listForLead(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.quotations.listForLead(actor, leadId);
  }
}
