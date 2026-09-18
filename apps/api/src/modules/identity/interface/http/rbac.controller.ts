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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../../../common/auth/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../domain/system-roles';
import { RbacService } from '../../application/rbac.service';
import {
  AssignMembershipRolesRequest,
  AssignUserRequest,
  CreateRoleRequest,
  ReplaceRolePermissionsRequest,
  UpdateMembershipRequest,
  UpdateRoleRequest,
} from './dto/rbac.dto';

@ApiTags('rbac')
@ApiBearerAuth()
@Controller()
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('permissions')
  @RequirePermissions(PERMISSION.tenantManageRoles)
  listPermissions() {
    return this.rbac.listPermissions();
  }

  @Get('roles')
  @RequireAnyPermission(PERMISSION.tenantManageRoles, PERMISSION.tenantManageUsers)
  listRoles(@CurrentUser() actor: AuthUser) {
    return this.rbac.listRoles(this.tenantId(actor));
  }

  @Post('roles')
  @RequirePermissions(PERMISSION.tenantManageRoles)
  createRole(@CurrentUser() actor: AuthUser, @Body() dto: CreateRoleRequest) {
    return this.rbac.createRole(actor, dto);
  }

  @Get('roles/:roleId')
  @RequirePermissions(PERMISSION.tenantManageRoles)
  getRole(
    @CurrentUser() actor: AuthUser,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return this.rbac.getRole(this.tenantId(actor), roleId);
  }

  @Patch('roles/:roleId')
  @RequirePermissions(PERMISSION.tenantManageRoles)
  updateRole(
    @CurrentUser() actor: AuthUser,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: UpdateRoleRequest,
  ) {
    return this.rbac.updateRole(actor, roleId, dto);
  }

  @Delete('roles/:roleId')
  @HttpCode(200)
  @RequirePermissions(PERMISSION.tenantManageRoles)
  deleteRole(
    @CurrentUser() actor: AuthUser,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return this.rbac.deleteRole(actor, roleId);
  }

  @Put('roles/:roleId/permissions')
  @RequirePermissions(PERMISSION.tenantManageRoles)
  replacePermissions(
    @CurrentUser() actor: AuthUser,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: ReplaceRolePermissionsRequest,
  ) {
    return this.rbac.replacePermissions(actor, roleId, dto);
  }

  @Get('rbac/matrix')
  @RequirePermissions(PERMISSION.tenantManageRoles)
  matrix(@CurrentUser() actor: AuthUser) {
    return this.rbac.matrix(this.tenantId(actor));
  }

  @Get('memberships')
  @RequirePermissions(PERMISSION.tenantManageUsers)
  listMemberships(@CurrentUser() actor: AuthUser) {
    return this.rbac.listMemberships(this.tenantId(actor));
  }

  @Post('memberships')
  @RequirePermissions(PERMISSION.tenantManageUsers)
  assignUser(@CurrentUser() actor: AuthUser, @Body() dto: AssignUserRequest) {
    return this.rbac.assignUser(actor, dto);
  }

  @Patch('memberships/:membershipId')
  @RequirePermissions(PERMISSION.tenantManageUsers)
  updateMembership(
    @CurrentUser() actor: AuthUser,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateMembershipRequest,
  ) {
    return this.rbac.updateMembership(actor, membershipId, dto);
  }

  @Put('memberships/:membershipId/roles')
  @RequirePermissions(PERMISSION.tenantManageUsers)
  assignRoles(
    @CurrentUser() actor: AuthUser,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: AssignMembershipRolesRequest,
  ) {
    return this.rbac.assignRoles(actor, membershipId, dto);
  }

  private tenantId(actor: AuthUser): string {
    return actor.tenantId ?? '';
  }
}
