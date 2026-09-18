import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { TracksService } from '../../../audit/application/tracks.service';
import { TrackReportQuery } from '../../../audit/interface/http/dto/track.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class TrackReportController {
  constructor(private readonly tracks: TracksService) {}

  @Get('tracks')
  @RequirePermissions(PERMISSION.auditRead)
  report(@CurrentUser() actor: AuthUser, @Query() query: TrackReportQuery) {
    return this.tracks.report(actor, query);
  }
}
