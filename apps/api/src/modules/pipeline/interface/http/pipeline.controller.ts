import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { PipelineService } from '../../application/pipeline.service';
import { PipelineBoardQuery } from './dto/pipeline.dto';

@ApiTags('pipeline')
@ApiBearerAuth()
@Controller('pipelines')
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  @Get('board')
  @RequirePermissions(PERMISSION.leadRead)
  board(@CurrentUser() actor: AuthUser, @Query() query: PipelineBoardQuery) {
    return this.pipeline.board(actor, query);
  }

  @Get('analytics')
  @RequirePermissions(PERMISSION.leadRead)
  analytics(@CurrentUser() actor: AuthUser, @Query('pipelineId') pipelineId?: string) {
    return this.pipeline.analytics(actor, pipelineId);
  }
}
