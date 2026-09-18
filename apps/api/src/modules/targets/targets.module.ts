import { Module } from '@nestjs/common';
import { TargetsService } from './application/targets.service';
import { TargetsController } from './interface/http/targets.controller';

@Module({
  controllers: [TargetsController],
  providers: [TargetsService],
  exports: [TargetsService],
})
export class TargetsModule {}
