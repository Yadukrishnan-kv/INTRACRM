import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequireAnyPermission } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { SearchService } from '../../application/search.service';
import { SearchQueryDto } from './dto/search.dto';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('catalog')
  @RequireAnyPermission(PERMISSION.leadRead, PERMISSION.quotationRead)
  catalog() {
    return this.search.catalog();
  }

  @Get()
  @RequireAnyPermission(PERMISSION.leadRead, PERMISSION.quotationRead)
  query(@CurrentUser() actor: AuthUser, @Query() query: SearchQueryDto) {
    return this.search.search(actor, query);
  }
}
