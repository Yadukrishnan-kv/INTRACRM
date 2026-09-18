import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequireAnyPermission } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { SyncService } from '../../application/sync.service';
import { SyncQueryDto } from './dto/sync.dto';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get()
  @RequireAnyPermission(PERMISSION.leadRead, PERMISSION.followUpRead, PERMISSION.activityRead)
  pull(@CurrentUser() actor: AuthUser, @Query() query: SyncQueryDto) {
    return this.sync.pull(actor, query);
  }
}
