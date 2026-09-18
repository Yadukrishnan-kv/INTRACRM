import { Module } from '@nestjs/common';
import { AttendanceService } from './application/attendance.service';
import { AttendanceController } from './interface/http/attendance.controller';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
