import { Module } from '@nestjs/common';
import { PerformanceService } from './application/performance.service';
import { PerformanceController } from './interface/http/performance.controller';

@Module({
  controllers: [PerformanceController],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
