import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { TracksService } from '../../application/tracks.service';
import { TrackListQuery } from './dto/track.dto';

@ApiTags('tracks')
@ApiBearerAuth()
@Controller('tracks')
export class TracksController {
  constructor(private readonly tracks: TracksService) {}

  @Get('catalog')
  @RequirePermissions(PERMISSION.auditRead)
  catalog() {
    return this.tracks.catalog();
  }

  @Get()
  @RequirePermissions(PERMISSION.auditRead)
  list(@CurrentUser() actor: AuthUser, @Query() query: TrackListQuery) {
    return this.tracks.list(actor, query);
  }
}
