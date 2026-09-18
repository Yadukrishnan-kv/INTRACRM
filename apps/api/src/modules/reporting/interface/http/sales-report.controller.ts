import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { QuotationsService } from '../../../quotations/application/quotations.service';
import { SalesReportQuery } from '../../../quotations/interface/http/dto/quotation.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class SalesReportController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get('sales')
  @RequirePermissions(PERMISSION.quotationRead)
  report(@CurrentUser() actor: AuthUser, @Query() query: SalesReportQuery) {
    return this.quotations.salesReport(actor, query);
  }
}
