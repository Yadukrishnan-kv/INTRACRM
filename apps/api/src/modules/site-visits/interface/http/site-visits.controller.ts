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
import { PERMISSION } from '../../../identity/domain/system-roles';
import { SiteVisitsService } from '../../application/site-visits.service';
import {
  AddSiteVisitPhotoRequest,
  CancelSiteVisitRequest,
  CheckInSiteVisitRequest,
  CheckOutSiteVisitRequest,
  CompleteSiteVisitRequest,
  CreateSiteVisitBody,
  SiteVisitFeedbackRequest,
  SiteVisitListQuery,
  SiteVisitNotesRequest,
  UpdateSiteVisitRequest,
} from './dto/site-visit.dto';

@ApiTags('site-visits')
@ApiBearerAuth()
@Controller('site-visits')
export class SiteVisitsController {
  constructor(private readonly visits: SiteVisitsService) {}

  @Get('catalog')
  @RequirePermissions(PERMISSION.siteVisitRead)
  catalog() {
    return this.visits.catalog();
  }

  @Get()
  @RequirePermissions(PERMISSION.siteVisitRead)
  list(@CurrentUser() actor: AuthUser, @Query() query: SiteVisitListQuery) {
    return this.visits.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSION.siteVisitCreate)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateSiteVisitBody) {
    return this.visits.create(actor, dto);
  }

  @Get(':visitId')
  @RequirePermissions(PERMISSION.siteVisitRead)
  get(@CurrentUser() actor: AuthUser, @Param('visitId', ParseUUIDPipe) visitId: string) {
    return this.visits.get(actor, visitId);
  }

  @Patch(':visitId')
  @RequirePermissions(PERMISSION.siteVisitCreate)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() dto: UpdateSiteVisitRequest,
  ) {
    return this.visits.update(actor, visitId, dto);
  }

  @Post(':visitId/check-in')
  @RequirePermissions(PERMISSION.siteVisitComplete)
  checkIn(
    @CurrentUser() actor: AuthUser,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() dto: CheckInSiteVisitRequest,
  ) {
    return this.visits.checkIn(actor, visitId, dto);
  }

  @Post(':visitId/check-out')
  @RequirePermissions(PERMISSION.siteVisitComplete)
  checkOut(
    @CurrentUser() actor: AuthUser,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() dto: CheckOutSiteVisitRequest,
  ) {
    return this.visits.checkOut(actor, visitId, dto);
  }

  @Post(':visitId/notes')
  @RequirePermissions(PERMISSION.siteVisitComplete)
  notes(
    @CurrentUser() actor: AuthUser,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() dto: SiteVisitNotesRequest,
  ) {
    return this.visits.saveNotes(actor, visitId, dto);
  }

  @Post(':visitId/feedback')
  @RequirePermissions(PERMISSION.siteVisitComplete)
  feedback(
    @CurrentUser() actor: AuthUser,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() dto: SiteVisitFeedbackRequest,
  ) {
    return this.visits.saveFeedback(actor, visitId, dto);
  }

  @Post(':visitId/complete')
  @RequirePermissions(PERMISSION.siteVisitComplete)
  complete(
    @CurrentUser() actor: AuthUser,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() dto: CompleteSiteVisitRequest,
  ) {
    return this.visits.complete(actor, visitId, dto);
  }

  @Post(':visitId/cancel')
  @RequirePermissions(PERMISSION.siteVisitComplete)
  cancel(
    @CurrentUser() actor: AuthUser,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() dto: CancelSiteVisitRequest,
  ) {
    return this.visits.cancel(actor, visitId, dto);
  }

  @Post(':visitId/no-show')
  @RequirePermissions(PERMISSION.siteVisitComplete)
  noShow(
    @CurrentUser() actor: AuthUser,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() dto: CancelSiteVisitRequest,
  ) {
    return this.visits.markNoShow(actor, visitId, dto);
  }

  @Post(':visitId/photos')
  @RequirePermissions(PERMISSION.siteVisitComplete)
  addPhoto(
    @CurrentUser() actor: AuthUser,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() dto: AddSiteVisitPhotoRequest,
  ) {
    return this.visits.addPhoto(actor, visitId, dto);
  }

  @Get(':visitId/photos/:photoId')
  @RequirePermissions(PERMISSION.siteVisitRead)
  photo(
    @CurrentUser() actor: AuthUser,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    return this.visits.photoContent(actor, visitId, photoId);
  }

  @Delete(':visitId/photos/:photoId')
  @RequirePermissions(PERMISSION.siteVisitComplete)
  removePhoto(
    @CurrentUser() actor: AuthUser,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    return this.visits.removePhoto(actor, visitId, photoId);
  }
}
