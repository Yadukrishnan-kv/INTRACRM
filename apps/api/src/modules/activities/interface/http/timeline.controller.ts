import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { TimelineService } from '../../application/timeline.service';
import {
  CreateSiteVisitRequest,
  SendQuotationRequest,
  TimelineQuery,
} from './dto/timeline.dto';

@ApiTags('timeline')
@ApiBearerAuth()
@Controller()
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Get('timeline/catalog')
  @RequirePermissions(PERMISSION.activityRead)
  catalog() {
    return this.timeline.catalog();
  }

  @Get('timeline')
  @RequirePermissions(PERMISSION.activityRead)
  list(@CurrentUser() actor: AuthUser, @Query() query: TimelineQuery) {
    return this.timeline.list(actor, query);
  }

  @Get('leads/:leadId/timeline')
  @RequirePermissions(PERMISSION.activityRead)
  leadTimeline(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Query() query: TimelineQuery,
  ) {
    return this.timeline.list(actor, { ...query, leadId });
  }

  @Post('leads/:leadId/site-visits')
  @RequirePermissions(PERMISSION.siteVisitCreate)
  addSiteVisit(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: CreateSiteVisitRequest,
  ) {
    return this.timeline.addSiteVisit(actor, leadId, dto);
  }

  @Post('leads/:leadId/quotations')
  @RequirePermissions(PERMISSION.quotationSend)
  sendQuotation(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: SendQuotationRequest,
  ) {
    return this.timeline.sendQuotation(actor, leadId, dto);
  }
}
