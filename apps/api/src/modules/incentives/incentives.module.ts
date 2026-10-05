import { Module } from '@nestjs/common';
import { TargetsModule } from '../targets/targets.module';
import { IncentivesService } from './application/incentives.service';
import { IncentivesController } from './interface/http/incentives.controller';

@Module({
  imports: [TargetsModule],
  controllers: [IncentivesController],
  providers: [IncentivesService],
  exports: [IncentivesService],
})
export class IncentivesModule {}
