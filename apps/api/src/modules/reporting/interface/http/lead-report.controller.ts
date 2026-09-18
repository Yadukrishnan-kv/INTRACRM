import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { LeadsService } from '../../../crm-leads/application/leads.service';
import { LeadReportQuery } from '../../../crm-leads/interface/http/dto/lead.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class LeadReportController {
  constructor(private readonly leads: LeadsService) {}

  @Get('leads')
  @RequirePermissions(PERMISSION.leadRead)
  report(@CurrentUser() actor: AuthUser, @Query() query: LeadReportQuery) {
    return this.leads.report(actor, query);
  }
}
