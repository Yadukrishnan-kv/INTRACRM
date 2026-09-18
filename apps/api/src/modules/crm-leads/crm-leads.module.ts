import { Module } from '@nestjs/common';
import { LeadCatalogService } from './application/lead-catalog.service';
import { LeadsService } from './application/leads.service';
import { LeadsController } from './interface/http/leads.controller';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TasksModule, NotificationsModule, AuditModule],
  controllers: [LeadsController],
  providers: [LeadCatalogService, LeadsService],
  exports: [LeadCatalogService, LeadsService],
})
export class CrmLeadsModule {}
