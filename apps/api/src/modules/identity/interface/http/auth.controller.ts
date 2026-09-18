import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser, AuthUser } from '../../../../common/auth/current-user.decorator';
import { Public } from '../../../../common/auth/public.decorator';
import { SkipTenant } from '../../../../common/tenancy/skip-tenant.decorator';
import { AuthService } from '../../application/auth.service';
import {
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginRequest,
  LogoutRequest,
  RefreshRequest,
  ResetPasswordRequest,
} from './dto/auth.dto';
import { requestMeta } from './request-meta';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginRequest, @Req() req: Request) {
    return this.auth.login(dto, requestMeta(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshRequest, @Req() req: Request) {
    return this.auth.refresh(dto, requestMeta(req));
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordRequest, @Req() req: Request) {
    return this.auth.forgotPassword(dto, requestMeta(req));
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordRequest) {
    return this.auth.resetPassword(dto);
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Post('logout')
  @HttpCode(200)
  logout(
    @CurrentUser() actor: AuthUser,
    @Body() dto: LogoutRequest,
  ) {
    return this.auth.logout(actor, dto.refreshToken);
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Post('change-password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() actor: AuthUser,
    @Body() dto: ChangePasswordRequest,
  ) {
    return this.auth.changePassword(actor, dto);
  }
}
