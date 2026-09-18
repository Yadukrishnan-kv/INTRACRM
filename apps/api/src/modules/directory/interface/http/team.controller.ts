import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { TeamService } from '../../application/team.service';
import {
  CreateTeamRequest,
  ReplaceTeamMembersRequest,
  TeamListQuery,
  UpdateTeamRequest,
} from './dto/staff.dto';

@ApiTags('teams')
@ApiBearerAuth()
@RequirePermissions(PERMISSION.tenantManageUsers)
@Controller('teams')
export class TeamController {
  constructor(private readonly teams: TeamService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query() _query: TeamListQuery) {
    return this.teams.list(actor.tenantId ?? '');
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateTeamRequest) {
    return this.teams.create(actor, dto);
  }

  @Get(':teamId')
  get(
    @CurrentUser() actor: AuthUser,
    @Param('teamId', ParseUUIDPipe) teamId: string,
  ) {
    return this.teams.get(actor.tenantId ?? '', teamId);
  }

  @Patch(':teamId')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: UpdateTeamRequest,
  ) {
    return this.teams.update(actor, teamId, dto);
  }

  @Delete(':teamId')
  @HttpCode(200)
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('teamId', ParseUUIDPipe) teamId: string,
  ) {
    return this.teams.remove(actor, teamId);
  }

  @Put(':teamId/members')
  replaceMembers(
    @CurrentUser() actor: AuthUser,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: ReplaceTeamMembersRequest,
  ) {
    return this.teams.replaceMembers(actor, teamId, dto);
  }
}
