import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { AuditModule } from '../audit/audit.module';
import { CrmLeadsModule } from '../crm-leads/crm-leads.module';
import { PipelineService } from './application/pipeline.service';
import { PipelineController } from './interface/http/pipeline.controller';
import { StageChangesController } from './interface/http/stage-changes.controller';

@Module({
  imports: [CrmLeadsModule, ActivitiesModule, AuditModule],
  controllers: [PipelineController, StageChangesController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
