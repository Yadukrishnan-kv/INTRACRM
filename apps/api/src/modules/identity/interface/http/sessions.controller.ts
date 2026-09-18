import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../../../common/auth/current-user.decorator';
import { SkipTenant } from '../../../../common/tenancy/skip-tenant.decorator';
import { AuthService } from '../../application/auth.service';

@ApiTags('sessions')
@ApiBearerAuth()
@SkipTenant()
@Controller('auth')
export class SessionsController {
  constructor(private readonly auth: AuthService) {}

  @Get('sessions')
  listSessions(@CurrentUser() actor: AuthUser) {
    return this.auth.listSessions(actor);
  }

  @Post('sessions/revoke-others')
  @HttpCode(200)
  revokeOthers(@CurrentUser() actor: AuthUser) {
    return this.auth.revokeOtherSessions(actor.userId, actor.sessionId);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(200)
  revokeSession(
    @CurrentUser() actor: AuthUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.auth.revokeSession(actor, sessionId);
  }

  @Get('login-history')
  loginHistory(@CurrentUser() actor: AuthUser) {
    return this.auth.loginHistory(actor);
  }
}
