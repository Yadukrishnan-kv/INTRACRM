import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { AttendanceService } from '../../application/attendance.service';
import { AttendanceDayQuery, PunchAttendanceRequest } from './dto/attendance.dto';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('today')
  @RequirePermissions(PERMISSION.attendanceRead)
  today(@CurrentUser() actor: AuthUser) {
    return this.attendance.today(actor);
  }

  @Get('days')
  @RequirePermissions(PERMISSION.attendanceRead)
  days(@CurrentUser() actor: AuthUser, @Query() query: AttendanceDayQuery) {
    return this.attendance.days(actor, query);
  }

  @Post('punch-in')
  @RequirePermissions(PERMISSION.attendancePunch)
  punchIn(@CurrentUser() actor: AuthUser, @Body() dto: PunchAttendanceRequest) {
    return this.attendance.punchIn(actor, dto);
  }

  @Post('punch-out')
  @RequirePermissions(PERMISSION.attendancePunch)
  punchOut(@CurrentUser() actor: AuthUser, @Body() dto: PunchAttendanceRequest) {
    return this.attendance.punchOut(actor, dto);
  }
}
