import { Injectable } from '@nestjs/common';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AnalyticsService } from '../../analytics/application/analytics.service';
import { TracksService } from '../../audit/application/tracks.service';
import { LeadsService } from '../../crm-leads/application/leads.service';
import { FollowUpsService } from '../../tasks/application/follow-ups.service';
import { QuotationsService } from '../../quotations/application/quotations.service';
import { PerformanceService } from '../../performance/application/performance.service';
import { renderCsv } from '../domain/export-csv';
import { renderPdf } from '../domain/export-pdf';
import { renderXlsx } from '../domain/export-xlsx';
import {
  ExportDataset,
  ExportDocument,
  ExportFile,
  ExportFormat,
  fileNameFor,
  mimeTypeFor,
} from '../domain/export-types';
import {
  followUpExportDocument,
  leadExportDocument,
  performanceExportDocument,
  quotationExportDocument,
  salesExportDocument,
  analyticsExportDocument,
  funnelExportDocument,
  tracksExportDocument,
} from '../domain/report-export-tables';
import { ReportExportQuery } from '../interface/http/dto/report-export.dto';

@Injectable()
export class ReportExportService {
  constructor(
    private readonly leads: LeadsService,
    private readonly followUps: FollowUpsService,
    private readonly quotations: QuotationsService,
    private readonly performance: PerformanceService,
    private readonly analytics: AnalyticsService,
    private readonly tracks: TracksService,
  ) {}

  async build(actor: AuthUser, dataset: ExportDataset, query: ReportExportQuery): Promise<ExportFile> {
    const document = await this.document(actor, dataset, query);
    const bytes = await this.render(document, query.format);
    return {
      fileName: fileNameFor(document.fileStem, query.format),
      mimeType: mimeTypeFor(query.format),
      bytes,
    };
  }

  private async document(
    actor: AuthUser,
    dataset: ExportDataset,
    query: ReportExportQuery,
  ): Promise<ExportDocument> {
    const range = this.range(query);
    switch (dataset) {
      case 'leads':
        return leadExportDocument(await this.leads.report(actor, range));
      case 'follow-ups':
        return followUpExportDocument(await this.followUps.report(actor, range));
      case 'quotations':
        return quotationExportDocument(await this.quotations.report(actor, range));
      case 'sales':
        return salesExportDocument(await this.quotations.salesReport(actor, range));
      case 'performance':
        return performanceExportDocument(
          await this.performance.report(actor, {
            ...(query.periodType ? { periodType: query.periodType } : {}),
            ...(query.periodStart ? { periodStart: query.periodStart } : {}),
          }),
        );
      case 'analytics':
        return analyticsExportDocument(await this.analytics.report(actor));
      case 'funnel':
        return funnelExportDocument(await this.analytics.funnelReport(actor));
      case 'tracks':
        return tracksExportDocument(await this.tracks.report(actor, range));
    }
  }

  private range(query: ReportExportQuery) {
    return {
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
    };
  }

  private async render(document: ExportDocument, format: ExportFormat): Promise<Buffer> {
    switch (format) {
      case 'csv':
        return renderCsv(document);
      case 'xlsx':
        return renderXlsx(document);
      case 'pdf':
        return renderPdf(document);
    }
  }
}
