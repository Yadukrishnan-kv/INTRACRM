import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { PipelineService } from '../../../pipeline/application/pipeline.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class PipelineReportController {
  constructor(private readonly pipeline: PipelineService) {}

  @Get('pipeline')
  @RequirePermissions(PERMISSION.leadRead)
  analytics(@CurrentUser() actor: AuthUser, @Query('pipelineId') pipelineId?: string) {
    return this.pipeline.analytics(actor, pipelineId);
  }
}
