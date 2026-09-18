import { Module } from '@nestjs/common';
import { SyncService } from './application/sync.service';
import { SyncController } from './interface/http/sync.controller';

@Module({
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
