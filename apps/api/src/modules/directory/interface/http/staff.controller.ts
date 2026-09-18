import {
  Body,
  Controller,
  Get,
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
import { StaffService } from '../../application/staff.service';
import {
  AssignStaffRolesRequest,
  AssignStaffTeamsRequest,
  CreateStaffRequest,
  StaffQuery,
  StaffStatusRequest,
  UpdateStaffRequest,
} from './dto/staff.dto';

@ApiTags('staff')
@ApiBearerAuth()
@RequirePermissions(PERMISSION.tenantManageUsers)
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query() query: StaffQuery) {
    return this.staff.list(actor, query);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateStaffRequest) {
    return this.staff.create(actor, dto);
  }

  @Get(':staffId')
  get(
    @CurrentUser() actor: AuthUser,
    @Param('staffId', ParseUUIDPipe) staffId: string,
  ) {
    return this.staff.get(actor, staffId);
  }

  @Patch(':staffId')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Body() dto: UpdateStaffRequest,
  ) {
    return this.staff.update(actor, staffId, dto);
  }

  @Post(':staffId/status')
  setStatus(
    @CurrentUser() actor: AuthUser,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Body() dto: StaffStatusRequest,
  ) {
    return this.staff.setStatus(actor, staffId, dto);
  }

  @Put(':staffId/roles')
  assignRoles(
    @CurrentUser() actor: AuthUser,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Body() dto: AssignStaffRolesRequest,
  ) {
    return this.staff.assignRoles(actor, staffId, dto);
  }

  @Put(':staffId/teams')
  assignTeams(
    @CurrentUser() actor: AuthUser,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Body() dto: AssignStaffTeamsRequest,
  ) {
    return this.staff.assignTeams(actor, staffId, dto);
  }
}
