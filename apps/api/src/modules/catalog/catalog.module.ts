import { Module } from '@nestjs/common';
import { CrmLeadsModule } from '../crm-leads/crm-leads.module';
import { CatalogService } from './application/catalog.service';
import { CatalogController } from './interface/http/catalog.controller';

@Module({
  imports: [CrmLeadsModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
