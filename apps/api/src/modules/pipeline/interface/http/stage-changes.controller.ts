import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { PipelineService } from '../../application/pipeline.service';
import { ChangeStageRequest } from './dto/pipeline.dto';

@ApiTags('leads')
@ApiBearerAuth()
@Controller('leads')
export class StageChangesController {
  constructor(private readonly pipeline: PipelineService) {}

  @Get(':leadId/stage-changes')
  @RequirePermissions(PERMISSION.leadRead)
  history(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.pipeline.history(actor, leadId);
  }

  @Post(':leadId/stage-changes')
  @RequirePermissions(PERMISSION.leadChangeStage)
  change(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: ChangeStageRequest,
  ) {
    return this.pipeline.changeStage(actor, leadId, dto);
  }
}
