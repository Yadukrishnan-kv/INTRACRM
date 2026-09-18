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
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { CommsService } from '../../application/comms.service';
import {
  CommsTemplateQuery,
  CreateMessageTemplateRequest,
  SendCallRequest,
  SendMessageRequest,
  UpdateMessageTemplateRequest,
} from './dto/comms.dto';

@ApiTags('comms')
@ApiBearerAuth()
@Controller()
export class CommsController {
  constructor(private readonly comms: CommsService) {}

  @Get('comms/capabilities')
  @RequireAnyPermission(PERMISSION.activityCreate, PERMISSION.activityRead)
  capabilities() {
    return this.comms.capabilities();
  }

  @Get('comms/templates')
  @RequireAnyPermission(PERMISSION.activityCreate, PERMISSION.activityRead)
  listTemplates(@CurrentUser() actor: AuthUser, @Query() query: CommsTemplateQuery) {
    return this.comms.listTemplates(actor, query.channel);
  }

  @Post('comms/templates')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  createTemplate(@CurrentUser() actor: AuthUser, @Body() dto: CreateMessageTemplateRequest) {
    return this.comms.createTemplate(actor, dto);
  }

  @Patch('comms/templates/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  updateTemplate(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMessageTemplateRequest,
  ) {
    return this.comms.updateTemplate(actor, id, dto);
  }

  @Delete('comms/templates/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  deleteTemplate(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.comms.deleteTemplate(actor, id);
  }

  @Post('leads/:leadId/comms/call')
  @RequirePermissions(PERMISSION.activityCreate)
  call(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: SendCallRequest = new SendCallRequest(),
  ) {
    return this.comms.call(actor, leadId, dto);
  }

  @Post('leads/:leadId/comms/whatsapp')
  @RequirePermissions(PERMISSION.activityCreate)
  whatsapp(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: SendMessageRequest = new SendMessageRequest(),
  ) {
    return this.comms.whatsapp(actor, leadId, dto);
  }

  @Post('leads/:leadId/comms/sms')
  @RequirePermissions(PERMISSION.activityCreate)
  sms(
    @CurrentUser() actor: AuthUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: SendMessageRequest = new SendMessageRequest(),
  ) {
    return this.comms.sms(actor, leadId, dto);
  }
}
