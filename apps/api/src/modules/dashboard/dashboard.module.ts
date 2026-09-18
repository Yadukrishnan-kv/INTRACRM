import { Module } from '@nestjs/common';
import { PerformanceModule } from '../performance/performance.module';
import { TargetsModule } from '../targets/targets.module';
import { DashboardService } from './application/dashboard.service';
import { DashboardController } from './interface/http/dashboard.controller';

@Module({
  imports: [PerformanceModule, TargetsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
