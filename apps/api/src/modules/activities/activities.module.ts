import { Module } from '@nestjs/common';
import { TimelineService } from './application/timeline.service';
import { TimelineWriter } from './application/timeline.writer';
import { TimelineController } from './interface/http/timeline.controller';

@Module({
  controllers: [TimelineController],
  providers: [TimelineWriter, TimelineService],
  exports: [TimelineWriter, TimelineService],
})
export class ActivitiesModule {}
