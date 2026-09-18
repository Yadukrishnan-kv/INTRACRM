import { Module } from '@nestjs/common';
import { CommsGateway } from './application/comms.gateway';
import { CommsService } from './application/comms.service';
import { CommsController } from './interface/http/comms.controller';

@Module({
  controllers: [CommsController],
  providers: [CommsGateway, CommsService],
  exports: [CommsService],
})
export class CommsModule {}
