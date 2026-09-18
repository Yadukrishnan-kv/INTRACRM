import { Module } from '@nestjs/common';
import { SearchService } from './application/search.service';
import { SearchController } from './interface/http/search.controller';

@Module({
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
