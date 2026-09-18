import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { SiteVisitsService } from './application/site-visits.service';
import { LocalFileStore } from './infrastructure/local-file-store';
import { LeadSiteVisitsController } from './interface/http/lead-site-visits.controller';
import { SiteVisitsController } from './interface/http/site-visits.controller';

@Module({
  imports: [ActivitiesModule],
  controllers: [SiteVisitsController, LeadSiteVisitsController],
  providers: [LocalFileStore, SiteVisitsService],
  exports: [SiteVisitsService],
})
export class SiteVisitsModule {}
