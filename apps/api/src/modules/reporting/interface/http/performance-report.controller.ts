import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { PerformanceService } from '../../../performance/application/performance.service';
import { PerformanceReportQuery } from '../../../performance/interface/http/dto/performance.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class PerformanceReportController {
  constructor(private readonly performance: PerformanceService) {}

  @Get('performance')
  @RequirePermissions(PERMISSION.performanceRead)
  report(@CurrentUser() actor: AuthUser, @Query() query: PerformanceReportQuery) {
    return this.performance.report(actor, query);
  }
}
