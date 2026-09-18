import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { WarrantiesService } from '../../application/warranties.service';

@ApiTags('warranties')
@ApiBearerAuth()
@Controller('leads')
export class LeadWarrantiesController {
  constructor(private readonly warranties: WarrantiesService) {}

  @Get(':leadId/warranties')
  @RequirePermissions(PERMISSION.warrantyRead)
  listForLead(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.warranties.listForLead(actor, leadId);
  }
}
