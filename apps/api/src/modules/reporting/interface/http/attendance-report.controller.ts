import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { AttendanceService } from '../../../attendance/application/attendance.service';
import { AttendanceDayQuery } from '../../../attendance/interface/http/dto/attendance.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class AttendanceReportController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('attendance')
  @RequirePermissions(PERMISSION.attendanceRead)
  report(@CurrentUser() actor: AuthUser, @Query() query: AttendanceDayQuery) {
    return this.attendance.report(actor, query);
  }
}
