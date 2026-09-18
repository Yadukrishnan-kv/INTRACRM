import {
  Body,
  Controller,
  Delete,
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
import { CursorPageQueryDto } from '../../../../common/pagination/cursor-page';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { TrackListQuery } from '../../../audit/interface/http/dto/track.dto';
import { LeadsService } from '../../application/leads.service';
import {
  AssignLeadRequest,
  CompleteFollowUpRequest,
  CreateActivityRequest,
  CreateFollowUpRequest,
  CreateLeadRequest,
  LeadListQuery,
  UpdateLeadRequest,
} from './dto/lead.dto';

@ApiTags('leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get('lookups')
  @RequirePermissions(PERMISSION.leadRead)
  lookups(@CurrentUser() actor: AuthUser) {
    return this.leads.lookups(actor);
  }

  @Get()
  @RequirePermissions(PERMISSION.leadRead)
  list(@CurrentUser() actor: AuthUser, @Query() query: LeadListQuery) {
    return this.leads.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSION.leadCreate)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateLeadRequest) {
    return this.leads.create(actor, dto);
  }

  @Get(':leadId')
  @RequirePermissions(PERMISSION.leadRead)
  get(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.leads.get(actor, leadId);
  }

  @Patch(':leadId')
  @RequirePermissions(PERMISSION.leadUpdate)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: UpdateLeadRequest,
  ) {
    return this.leads.update(actor, leadId, dto);
  }

  @Post(':leadId/assign')
  @RequirePermissions(PERMISSION.leadAssign)
  assign(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: AssignLeadRequest,
  ) {
    return this.leads.assign(actor, leadId, dto);
  }

  @Delete(':leadId')
  @RequirePermissions(PERMISSION.leadUpdate)
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.leads.remove(actor, leadId);
  }

  @Get(':leadId/assignments')
  @RequirePermissions(PERMISSION.leadRead)
  listAssignments(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.leads.listAssignments(actor, leadId);
  }

  @Get(':leadId/tracks')
  @RequirePermissions(PERMISSION.auditRead)
  listTracks(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Query() query: TrackListQuery,
  ) {
    return this.leads.listTracks(actor, leadId, query);
  }

  @Get(':leadId/activities')
  @RequirePermissions(PERMISSION.activityRead)
  listActivities(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Query() query: CursorPageQueryDto,
  ) {
    return this.leads.listActivities(actor, leadId, query);
  }

  @Post(':leadId/activities')
  @RequirePermissions(PERMISSION.activityCreate)
  addActivity(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: CreateActivityRequest,
  ) {
    return this.leads.addActivity(actor, leadId, dto);
  }

  @Get(':leadId/follow-ups')
  @RequirePermissions(PERMISSION.followUpRead)
  listFollowUps(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.leads.listFollowUps(actor, leadId);
  }

  @Post(':leadId/follow-ups')
  @RequirePermissions(PERMISSION.followUpCreate)
  addFollowUp(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: CreateFollowUpRequest,
  ) {
    return this.leads.addFollowUp(actor, leadId, dto);
  }

  @Post(':leadId/follow-ups/:followUpId/complete')
  @RequirePermissions(PERMISSION.followUpComplete)
  completeFollowUp(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Param('followUpId', ParseUUIDPipe) followUpId: string,
    @Body() dto: CompleteFollowUpRequest,
  ) {
    return this.leads.completeFollowUp(actor, leadId, followUpId, dto);
  }
}
