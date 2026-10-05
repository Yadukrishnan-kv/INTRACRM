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
import { IncentivesService } from '../../application/incentives.service';
import {
  ComputeIncentiveRequest,
  CreateIncentivePlanRequest,
  IncentivePlanListQuery,
  MyIncentiveQuery,
  PayoutDecisionRequest,
  UpdateIncentivePlanRequest,
  UpsertSlabRequest,
} from './dto/incentive.dto';

@ApiTags('incentives')
@ApiBearerAuth()
@Controller('incentives')
export class IncentivesController {
  constructor(private readonly incentives: IncentivesService) {}

  @Get('catalog')
  @RequirePermissions(PERMISSION.incentiveRead)
  catalog() {
    return this.incentives.catalog();
  }

  @Get('me')
  @RequirePermissions(PERMISSION.incentiveRead)
  mine(@CurrentUser() actor: AuthUser, @Query() query: MyIncentiveQuery) {
    return this.incentives.mine(actor, query);
  }

  @Get('plans')
  @RequirePermissions(PERMISSION.incentiveRead)
  listPlans(@CurrentUser() actor: AuthUser, @Query() query: IncentivePlanListQuery) {
    return this.incentives.listPlans(actor, query);
  }

  @Post('plans')
  @RequirePermissions(PERMISSION.incentiveManage)
  createPlan(@CurrentUser() actor: AuthUser, @Body() dto: CreateIncentivePlanRequest) {
    return this.incentives.createPlan(actor, dto);
  }

  @Get('plans/:planId')
  @RequirePermissions(PERMISSION.incentiveRead)
  getPlan(@CurrentUser() actor: AuthUser, @Param('planId', ParseUUIDPipe) planId: string) {
    return this.incentives.getPlan(actor, planId);
  }

  @Patch('plans/:planId')
  @RequirePermissions(PERMISSION.incentiveManage)
  updatePlan(
    @CurrentUser() actor: AuthUser,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: UpdateIncentivePlanRequest,
  ) {
    return this.incentives.updatePlan(actor, planId, dto);
  }

  @Delete('plans/:planId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.incentiveManage)
  removePlan(@CurrentUser() actor: AuthUser, @Param('planId', ParseUUIDPipe) planId: string) {
    return this.incentives.removePlan(actor, planId);
  }

  @Post('plans/:planId/slabs')
  @RequirePermissions(PERMISSION.incentiveManage)
  addSlab(
    @CurrentUser() actor: AuthUser,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: UpsertSlabRequest,
  ) {
    return this.incentives.addSlab(actor, planId, dto);
  }

  @Patch('plans/:planId/slabs/:slabId')
  @RequirePermissions(PERMISSION.incentiveManage)
  updateSlab(
    @CurrentUser() actor: AuthUser,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('slabId', ParseUUIDPipe) slabId: string,
    @Body() dto: UpsertSlabRequest,
  ) {
    return this.incentives.updateSlab(actor, planId, slabId, dto);
  }

  @Delete('plans/:planId/slabs/:slabId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.incentiveManage)
  removeSlab(
    @CurrentUser() actor: AuthUser,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('slabId', ParseUUIDPipe) slabId: string,
  ) {
    return this.incentives.removeSlab(actor, planId, slabId);
  }

  @Post('compute')
  @RequirePermissions(PERMISSION.incentiveManage)
  compute(@CurrentUser() actor: AuthUser, @Body() dto: ComputeIncentiveRequest) {
    return this.incentives.compute(actor, dto);
  }

  @Post('payouts/:payoutId/approve')
  @RequirePermissions(PERMISSION.incentiveManage)
  approve(
    @CurrentUser() actor: AuthUser,
    @Param('payoutId', ParseUUIDPipe) payoutId: string,
    @Body() dto: PayoutDecisionRequest,
  ) {
    return this.incentives.approve(actor, payoutId, dto);
  }

  @Post('payouts/:payoutId/pay')
  @RequirePermissions(PERMISSION.incentiveManage)
  pay(
    @CurrentUser() actor: AuthUser,
    @Param('payoutId', ParseUUIDPipe) payoutId: string,
    @Body() dto: PayoutDecisionRequest,
  ) {
    return this.incentives.markPaid(actor, payoutId, dto);
  }
}
