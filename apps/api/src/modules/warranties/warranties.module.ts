import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { WarrantiesService } from './application/warranties.service';
import { LeadWarrantiesController } from './interface/http/lead-warranties.controller';
import { PublicWarrantyController } from './interface/http/public-warranty.controller';
import { WarrantiesController } from './interface/http/warranties.controller';

@Module({
  imports: [ActivitiesModule],
  controllers: [WarrantiesController, LeadWarrantiesController, PublicWarrantyController],
  providers: [WarrantiesService],
  exports: [WarrantiesService],
})
export class WarrantiesModule {}
