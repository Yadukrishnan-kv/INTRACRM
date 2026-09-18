import { Module } from '@nestjs/common';
import { AuditWriter } from './application/audit.writer';
import { TracksService } from './application/tracks.service';
import { TracksController } from './interface/http/tracks.controller';

@Module({
  controllers: [TracksController],
  providers: [AuditWriter, TracksService],
  exports: [AuditWriter, TracksService],
})
export class AuditModule {}
