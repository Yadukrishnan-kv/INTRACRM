import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { CatalogService } from '../../application/catalog.service';
import {
  CatalogListQuery,
  CatalogNamedRequest,
  CreateCategoryRequest,
  CreateLeadStatusRequest,
  CreateProductRequest,
  CreateWarrantyPeriodRequest,
  UpdateCatalogNamedRequest,
  UpdateCategoryRequest,
  UpdateLeadStatusRequest,
  UpdateProductRequest,
  UpdateWarrantyPeriodRequest,
  CreateTaxRequest,
  UpdateTaxRequest,
  TaxBatchRequest,
} from './dto/catalog.dto';

const CATALOG_READ = [
  PERMISSION.tenantManageSettings,
  PERMISSION.leadRead,
  PERMISSION.quotationRead,
  PERMISSION.warrantyRead,
  PERMISSION.targetRead,
] as const;

@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequireAnyPermission(...CATALOG_READ)
  overview(@CurrentUser() actor: AuthUser) {
    return this.catalog.overview(actor);
  }

  @Get('lookups')
  @RequireAnyPermission(...CATALOG_READ)
  lookups(@CurrentUser() actor: AuthUser) {
    return this.catalog.lookups(actor);
  }

  @Get('products')
  @RequireAnyPermission(...CATALOG_READ)
  listProducts(@CurrentUser() actor: AuthUser, @Query() query: CatalogListQuery) {
    return this.catalog.listProducts(actor, query.includeInactive !== false);
  }

  @Post('products')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  createProduct(@CurrentUser() actor: AuthUser, @Body() dto: CreateProductRequest) {
    return this.catalog.createProduct(actor, dto);
  }

  @Patch('products/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  updateProduct(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductRequest,
  ) {
    return this.catalog.updateProduct(actor, id, dto);
  }

  @Delete('products/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  deleteProduct(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteProduct(actor, id);
  }

  @Get('categories')
  @RequireAnyPermission(...CATALOG_READ)
  listCategories(@CurrentUser() actor: AuthUser, @Query() query: CatalogListQuery) {
    return this.catalog.listCategories(actor, query.includeInactive !== false);
  }

  @Post('categories')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  createCategory(@CurrentUser() actor: AuthUser, @Body() dto: CreateCategoryRequest) {
    return this.catalog.createCategory(actor, dto);
  }

  @Patch('categories/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  updateCategory(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryRequest,
  ) {
    return this.catalog.updateCategory(actor, id, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  deleteCategory(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteCategory(actor, id);
  }

  @Get('sources')
  @RequireAnyPermission(...CATALOG_READ)
  listSources(@CurrentUser() actor: AuthUser, @Query() query: CatalogListQuery) {
    return this.catalog.listSources(actor, query.includeInactive !== false);
  }

  @Post('sources')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  createSource(@CurrentUser() actor: AuthUser, @Body() dto: CatalogNamedRequest) {
    return this.catalog.createSource(actor, dto);
  }

  @Patch('sources/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  updateSource(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogNamedRequest,
  ) {
    return this.catalog.updateSource(actor, id, dto);
  }

  @Delete('sources/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  deleteSource(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteSource(actor, id);
  }

  @Get('lead-qualities')
  @RequireAnyPermission(...CATALOG_READ)
  listQualities(@CurrentUser() actor: AuthUser, @Query() query: CatalogListQuery) {
    return this.catalog.listQualities(actor, query.includeInactive !== false);
  }

  @Post('lead-qualities')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  createQuality(@CurrentUser() actor: AuthUser, @Body() dto: CatalogNamedRequest) {
    return this.catalog.createQuality(actor, dto);
  }

  @Patch('lead-qualities/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  updateQuality(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogNamedRequest,
  ) {
    return this.catalog.updateQuality(actor, id, dto);
  }

  @Delete('lead-qualities/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  deleteQuality(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteQuality(actor, id);
  }

  @Get('lead-statuses')
  @RequireAnyPermission(...CATALOG_READ)
  listLeadStatuses(@CurrentUser() actor: AuthUser) {
    return this.catalog.listLeadStatuses(actor);
  }

  @Post('lead-statuses')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  createLeadStatus(@CurrentUser() actor: AuthUser, @Body() dto: CreateLeadStatusRequest) {
    return this.catalog.createLeadStatus(actor, dto);
  }

  @Patch('lead-statuses/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  updateLeadStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadStatusRequest,
  ) {
    return this.catalog.updateLeadStatus(actor, id, dto);
  }

  @Delete('lead-statuses/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  deleteLeadStatus(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteLeadStatus(actor, id);
  }

  @Get('warranty-periods')
  @RequireAnyPermission(...CATALOG_READ)
  listWarrantyPeriods(@CurrentUser() actor: AuthUser, @Query() query: CatalogListQuery) {
    return this.catalog.listWarrantyPeriods(actor, query.includeInactive !== false);
  }

  @Post('warranty-periods')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  createWarrantyPeriod(@CurrentUser() actor: AuthUser, @Body() dto: CreateWarrantyPeriodRequest) {
    return this.catalog.createWarrantyPeriod(actor, dto);
  }

  @Patch('warranty-periods/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  updateWarrantyPeriod(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarrantyPeriodRequest,
  ) {
    return this.catalog.updateWarrantyPeriod(actor, id, dto);
  }

  @Delete('warranty-periods/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  deleteWarrantyPeriod(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteWarrantyPeriod(actor, id);
  }

  @Get('taxes')
  @RequireAnyPermission(...CATALOG_READ)
  listTaxes(@CurrentUser() actor: AuthUser, @Query() query: CatalogListQuery) {
    return this.catalog.listTaxes(actor, query.includeInactive !== false);
  }

  @Post('taxes/batch')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  saveTaxes(@CurrentUser() actor: AuthUser, @Body() dto: TaxBatchRequest) {
    return this.catalog.saveTaxes(actor, dto);
  }

  @Post('taxes')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  createTax(@CurrentUser() actor: AuthUser, @Body() dto: CreateTaxRequest) {
    return this.catalog.createTax(actor, dto);
  }

  @Patch('taxes/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  updateTax(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxRequest,
  ) {
    return this.catalog.updateTax(actor, id, dto);
  }

  @Delete('taxes/:id')
  @RequirePermissions(PERMISSION.tenantManageSettings)
  deleteTax(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteTax(actor, id);
  }
}
