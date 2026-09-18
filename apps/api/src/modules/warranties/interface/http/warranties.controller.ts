import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { WarrantiesService } from '../../application/warranties.service';
import {
  ChangeWarrantyStatusRequest,
  CreateWarrantyRequest,
  UpdateWarrantyRequest,
  WarrantyListQuery,
} from './dto/warranty.dto';

@ApiTags('warranties')
@ApiBearerAuth()
@Controller('warranties')
export class WarrantiesController {
  constructor(private readonly warranties: WarrantiesService) {}

  @Get('catalog')
  @RequirePermissions(PERMISSION.warrantyRead)
  catalog(@CurrentUser() actor: AuthUser) {
    return this.warranties.catalog(actor);
  }

  @Get()
  @RequirePermissions(PERMISSION.warrantyRead)
  list(@CurrentUser() actor: AuthUser, @Query() query: WarrantyListQuery) {
    return this.warranties.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSION.warrantyCreate)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateWarrantyRequest) {
    return this.warranties.create(actor, dto);
  }

  @Get(':warrantyId/qr')
  @RequirePermissions(PERMISSION.warrantyRead)
  qr(@CurrentUser() actor: AuthUser, @Param('warrantyId', ParseUUIDPipe) warrantyId: string) {
    return this.warranties.qr(actor, warrantyId);
  }

  @Get(':warrantyId/pdf')
  @RequirePermissions(PERMISSION.warrantyRead)
  pdf(@CurrentUser() actor: AuthUser, @Param('warrantyId', ParseUUIDPipe) warrantyId: string) {
    return this.warranties.pdf(actor, warrantyId);
  }

  @Get(':warrantyId')
  @RequirePermissions(PERMISSION.warrantyRead)
  get(@CurrentUser() actor: AuthUser, @Param('warrantyId', ParseUUIDPipe) warrantyId: string) {
    return this.warranties.get(actor, warrantyId);
  }

  @Patch(':warrantyId')
  @RequirePermissions(PERMISSION.warrantyUpdate)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('warrantyId', ParseUUIDPipe) warrantyId: string,
    @Body() dto: UpdateWarrantyRequest,
  ) {
    return this.warranties.update(actor, warrantyId, dto);
  }

  @Post(':warrantyId/status')
  @RequirePermissions(PERMISSION.warrantyUpdate)
  changeStatus(
    @CurrentUser() actor: AuthUser,
    @Param('warrantyId', ParseUUIDPipe) warrantyId: string,
    @Body() dto: ChangeWarrantyStatusRequest,
  ) {
    return this.warranties.changeStatus(actor, warrantyId, dto);
  }
}
