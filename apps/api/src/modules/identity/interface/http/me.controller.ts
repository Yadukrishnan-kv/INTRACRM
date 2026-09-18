import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../../../common/auth/current-user.decorator';
import { SkipTenant } from '../../../../common/tenancy/skip-tenant.decorator';
import { AuthService } from '../../application/auth.service';

@ApiTags('me')
@ApiBearerAuth()
@SkipTenant()
@Controller('me')
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  me(@CurrentUser() actor: AuthUser) {
    return this.auth.me(actor);
  }
}
