import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { StaffReportService } from './application/staff-report.service';
import { StaffService } from './application/staff.service';
import { TeamService } from './application/team.service';
import { StaffController } from './interface/http/staff.controller';
import { TeamController } from './interface/http/team.controller';

@Module({
  imports: [IdentityModule],
  controllers: [StaffController, TeamController],
  providers: [StaffService, TeamService, StaffReportService],
  exports: [StaffService, TeamService, StaffReportService],
})
export class DirectoryModule {}
