import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { QuotationsService } from '../../application/quotations.service';
import { QuotationFollowUpService } from '../../application/quotation-follow-up.service';
import {
  ChangeQuotationStatusRequest,
  CreateQuotationRequest,
  QuotationListQuery,
  ScheduleQuotationFollowUpRequest,
  SendQuotationBody,
  UpdateQuotationRequest,
} from './dto/quotation.dto';

@ApiTags('quotations')
@ApiBearerAuth()
@Controller('quotations')
export class QuotationsController {
  constructor(
    private readonly quotations: QuotationsService,
    private readonly followUp: QuotationFollowUpService,
  ) {}

  @Get('catalog')
  @RequirePermissions(PERMISSION.quotationRead)
  catalog(@CurrentUser() actor: AuthUser) {
    return this.quotations.catalog(actor);
  }

  @Get('engine/dashboard')
  @RequirePermissions(PERMISSION.quotationRead)
  dashboard(@CurrentUser() actor: AuthUser) {
    return this.followUp.dashboard(actor);
  }

  @Post('engine/run')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  run(@CurrentUser() actor: AuthUser) {
    return this.followUp.tickForActor(actor);
  }

  @Get()
  @RequirePermissions(PERMISSION.quotationRead)
  list(@CurrentUser() actor: AuthUser, @Query() query: QuotationListQuery) {
    return this.quotations.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSION.quotationCreate)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateQuotationRequest) {
    return this.quotations.create(actor, dto);
  }

  @Get(':quotationId')
  @RequirePermissions(PERMISSION.quotationRead)
  get(
    @CurrentUser() actor: AuthUser,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
  ) {
    return this.quotations.get(actor, quotationId);
  }

  @Patch(':quotationId')
  @RequirePermissions(PERMISSION.quotationCreate)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: UpdateQuotationRequest,
  ) {
    return this.quotations.update(actor, quotationId, dto);
  }

  @Delete(':quotationId')
  @RequirePermissions(PERMISSION.quotationCreate)
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
  ) {
    return this.quotations.remove(actor, quotationId);
  }

  @Post(':quotationId/send')
  @RequirePermissions(PERMISSION.quotationSend)
  send(
    @CurrentUser() actor: AuthUser,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: SendQuotationBody,
  ) {
    return this.quotations.send(actor, quotationId, dto);
  }

  @Post(':quotationId/follow-up')
  @RequirePermissions(PERMISSION.quotationSend)
  scheduleFollowUp(
    @CurrentUser() actor: AuthUser,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: ScheduleQuotationFollowUpRequest,
  ) {
    return this.quotations.scheduleFollowUp(actor, quotationId, dto);
  }

  @Post(':quotationId/status')
  @RequirePermissions(PERMISSION.quotationAccept)
  changeStatus(
    @CurrentUser() actor: AuthUser,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: ChangeQuotationStatusRequest,
  ) {
    return this.quotations.changeStatus(actor, quotationId, dto);
  }
}
