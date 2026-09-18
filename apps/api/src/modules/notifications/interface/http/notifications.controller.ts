import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { CursorPageQueryDto } from '../../../../common/pagination/cursor-page';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { NotificationsService } from '../../application/notifications.service';
import { PushTokensService } from '../../application/push-tokens.service';
import {
  RegisterDevicePushTokenRequest,
  UpdateNotificationPreferenceRequest,
} from './dto/notification.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly tokens: PushTokensService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSION.notificationRead)
  list(@CurrentUser() actor: AuthUser, @Query() query: CursorPageQueryDto) {
    return this.notifications.list(actor, query);
  }

  @Get('catalog')
  @RequirePermissions(PERMISSION.notificationRead)
  catalog() {
    return this.notifications.catalog();
  }

  @Get('preferences')
  @RequirePermissions(PERMISSION.notificationRead)
  listPreferences(@CurrentUser() actor: AuthUser) {
    return this.notifications.listPreferences(actor);
  }

  @Put('preferences')
  @RequirePermissions(PERMISSION.notificationRead)
  upsertPreference(
    @CurrentUser() actor: AuthUser,
    @Body() dto: UpdateNotificationPreferenceRequest,
  ) {
    return this.notifications.upsertPreference(actor, dto);
  }

  @Post('devices')
  @RequirePermissions(PERMISSION.notificationRead)
  registerDevice(
    @CurrentUser() actor: AuthUser,
    @Body() dto: RegisterDevicePushTokenRequest,
  ) {
    return this.tokens.register(actor, dto);
  }

  @Delete('devices/:deviceId')
  @RequirePermissions(PERMISSION.notificationRead)
  revokeDevice(@CurrentUser() actor: AuthUser, @Param('deviceId') deviceId: string) {
    return this.tokens.revokeDevice(actor, deviceId);
  }

  @Post(':notificationId/read')
  @RequirePermissions(PERMISSION.notificationRead)
  markRead(
    @CurrentUser() actor: AuthUser,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notifications.markRead(actor, notificationId);
  }
}
