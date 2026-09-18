import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { FollowUpEngineService } from '../../application/follow-up-engine.service';
import { FollowUpsService } from '../../application/follow-ups.service';
import {
  CompleteFollowUpRequest,
  CreateFollowUpRequest,
  FollowUpListQuery,
  RescheduleFollowUpRequest,
  UpdateFollowUpRequest,
} from './dto/follow-up.dto';

@ApiTags('follow-ups')
@ApiBearerAuth()
@Controller('follow-ups')
export class FollowUpsController {
  constructor(
    private readonly followUps: FollowUpsService,
    private readonly engine: FollowUpEngineService,
  ) {}

  @Get('catalog')
  @RequirePermissions(PERMISSION.followUpRead)
  catalog() {
    return this.followUps.catalog();
  }

  @Get('engine/dashboard')
  @RequirePermissions(PERMISSION.followUpRead)
  dashboard(@CurrentUser() actor: AuthUser) {
    return this.engine.dashboard(actor);
  }

  @Get('engine/gaps')
  @RequirePermissions(PERMISSION.followUpRead)
  gaps(@CurrentUser() actor: AuthUser) {
    return this.engine.gaps(actor);
  }

  @Post('engine/run')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  run(@CurrentUser() actor: AuthUser) {
    return this.engine.tickForActor(actor);
  }

  @Get()
  @RequirePermissions(PERMISSION.followUpRead)
  list(@CurrentUser() actor: AuthUser, @Query() query: FollowUpListQuery) {
    return this.followUps.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSION.followUpCreate)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateFollowUpRequest) {
    return this.followUps.create(actor, dto);
  }

  @Get(':followUpId')
  @RequirePermissions(PERMISSION.followUpRead)
  get(
    @CurrentUser() actor: AuthUser,
    @Param('followUpId', ParseUUIDPipe) followUpId: string,
  ) {
    return this.followUps.get(actor, followUpId);
  }

  @Patch(':followUpId')
  @RequirePermissions(PERMISSION.followUpUpdate)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('followUpId', ParseUUIDPipe) followUpId: string,
    @Body() dto: UpdateFollowUpRequest,
  ) {
    return this.followUps.update(actor, followUpId, dto);
  }

  @Post(':followUpId/reschedule')
  @RequirePermissions(PERMISSION.followUpUpdate)
  reschedule(
    @CurrentUser() actor: AuthUser,
    @Param('followUpId', ParseUUIDPipe) followUpId: string,
    @Body() dto: RescheduleFollowUpRequest,
  ) {
    return this.followUps.reschedule(actor, followUpId, dto);
  }

  @Post(':followUpId/complete')
  @RequirePermissions(PERMISSION.followUpComplete)
  complete(
    @CurrentUser() actor: AuthUser,
    @Param('followUpId', ParseUUIDPipe) followUpId: string,
    @Body() dto: CompleteFollowUpRequest,
  ) {
    return this.followUps.complete(actor, followUpId, dto);
  }
}
