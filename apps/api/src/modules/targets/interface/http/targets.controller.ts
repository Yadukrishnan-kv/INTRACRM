import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { TargetsService } from '../../application/targets.service';
import {
  CreateTargetRequest,
  SalesBoardQuery,
  TargetListQuery,
  UpdateTargetRequest,
} from './dto/target.dto';

@ApiTags('targets')
@ApiBearerAuth()
@Controller('targets')
export class TargetsController {
  constructor(private readonly targets: TargetsService) {}

  @Get('catalog')
  @RequirePermissions(PERMISSION.targetRead)
  catalog(@CurrentUser() actor: AuthUser) {
    return this.targets.catalog(actor);
  }

  @Get('progress')
  @RequirePermissions(PERMISSION.targetRead)
  progress(@CurrentUser() actor: AuthUser) {
    return this.targets.progress(actor);
  }

  @Get('sales-board')
  @RequirePermissions(PERMISSION.targetRead)
  salesBoard(@CurrentUser() actor: AuthUser, @Query() query: SalesBoardQuery) {
    return this.targets.salesBoard(actor, query);
  }

  @Get()
  @RequirePermissions(PERMISSION.targetRead)
  list(@CurrentUser() actor: AuthUser, @Query() query: TargetListQuery) {
    return this.targets.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSION.targetManage)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateTargetRequest) {
    return this.targets.create(actor, dto);
  }

  @Get(':targetId')
  @RequirePermissions(PERMISSION.targetRead)
  get(@CurrentUser() actor: AuthUser, @Param('targetId', ParseUUIDPipe) targetId: string) {
    return this.targets.get(actor, targetId);
  }

  @Patch(':targetId')
  @RequirePermissions(PERMISSION.targetManage)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Body() dto: UpdateTargetRequest,
  ) {
    return this.targets.update(actor, targetId, dto);
  }

  @Delete(':targetId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.targetManage)
  remove(@CurrentUser() actor: AuthUser, @Param('targetId', ParseUUIDPipe) targetId: string) {
    return this.targets.remove(actor, targetId);
  }
}
