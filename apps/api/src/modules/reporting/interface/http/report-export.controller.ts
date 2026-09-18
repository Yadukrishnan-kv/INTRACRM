import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../../../common/auth/require-permissions.decorator';
import { PERMISSION } from '../../../identity/domain/system-roles';
import { ExportDataset } from '../../domain/export-types';
import { ReportExportService } from '../../application/report-export.service';
import { ReportExportQuery } from './dto/report-export.dto';

@ApiTags('reports')
@ApiBearerAuth()
@ApiProduces(
  'text/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
)
@Controller('reports')
export class ReportExportController {
  constructor(private readonly exports: ReportExportService) {}

  @Get('leads/export')
  @RequirePermissions(PERMISSION.leadRead)
  leads(
    @CurrentUser() actor: AuthUser,
    @Query() query: ReportExportQuery,
    @Res() res: Response,
  ) {
    return this.send(actor, 'leads', query, res);
  }

  @Get('follow-ups/export')
  @RequirePermissions(PERMISSION.followUpRead)
  followUps(
    @CurrentUser() actor: AuthUser,
    @Query() query: ReportExportQuery,
    @Res() res: Response,
  ) {
    return this.send(actor, 'follow-ups', query, res);
  }

  @Get('quotations/export')
  @RequirePermissions(PERMISSION.quotationRead)
  quotations(
    @CurrentUser() actor: AuthUser,
    @Query() query: ReportExportQuery,
    @Res() res: Response,
  ) {
    return this.send(actor, 'quotations', query, res);
  }

  @Get('sales/export')
  @RequirePermissions(PERMISSION.quotationRead)
  sales(
    @CurrentUser() actor: AuthUser,
    @Query() query: ReportExportQuery,
    @Res() res: Response,
  ) {
    return this.send(actor, 'sales', query, res);
  }

  @Get('performance/export')
  @RequirePermissions(PERMISSION.performanceRead)
  performance(
    @CurrentUser() actor: AuthUser,
    @Query() query: ReportExportQuery,
    @Res() res: Response,
  ) {
    return this.send(actor, 'performance', query, res);
  }

  @Get('analytics/export')
  @RequirePermissions(PERMISSION.dashboardRead)
  analytics(
    @CurrentUser() actor: AuthUser,
    @Query() query: ReportExportQuery,
    @Res() res: Response,
  ) {
    return this.send(actor, 'analytics', query, res);
  }

  @Get('funnel/export')
  @RequirePermissions(PERMISSION.dashboardRead)
  funnel(
    @CurrentUser() actor: AuthUser,
    @Query() query: ReportExportQuery,
    @Res() res: Response,
  ) {
    return this.send(actor, 'funnel', query, res);
  }

  @Get('tracks/export')
  @RequirePermissions(PERMISSION.auditRead)
  tracks(
    @CurrentUser() actor: AuthUser,
    @Query() query: ReportExportQuery,
    @Res() res: Response,
  ) {
    return this.send(actor, 'tracks', query, res);
  }

  private async send(
    actor: AuthUser,
    dataset: ExportDataset,
    query: ReportExportQuery,
    res: Response,
  ) {
    const file = await this.exports.build(actor, dataset, query);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(file.bytes);
  }
}
