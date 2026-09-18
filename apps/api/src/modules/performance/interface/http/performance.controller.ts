import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { PerformanceService } from '../../application/performance.service';
import { PerformanceBoardQuery } from './dto/performance.dto';

@ApiTags('performance')
@ApiBearerAuth()
@Controller('performance')
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Get('catalog')
  @RequirePermissions(PERMISSION.performanceRead)
  catalog(@CurrentUser() actor: AuthUser) {
    return this.performance.catalog(actor);
  }

  @Get('leaderboard')
  @RequirePermissions(PERMISSION.performanceRead)
  board(@CurrentUser() actor: AuthUser, @Query() query: PerformanceBoardQuery) {
    return this.performance.board(actor, query);
  }

  @Get('me')
  @RequirePermissions(PERMISSION.performanceRead)
  me(@CurrentUser() actor: AuthUser, @Query() query: PerformanceBoardQuery) {
    return this.performance.me(actor, query);
  }

  @Get(':membershipId')
  @RequirePermissions(PERMISSION.performanceRead)
  get(
    @CurrentUser() actor: AuthUser,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Query() query: PerformanceBoardQuery,
  ) {
    return this.performance.get(actor, membershipId, query);
  }
}
