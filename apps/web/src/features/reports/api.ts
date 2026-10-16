import { downloadFile, request } from '../../api/client';
import type { IncentivePlanOption, ReportLookups } from './types';

export type ReportQuery = Record<string, string | undefined>;

/** Datasets with a GET /reports/:dataset/export endpoint (EXPORT_DATASETS in the API). */
export type ExportDataset =
  | 'leads'
  | 'follow-ups'
  | 'quotations'
  | 'sales'
  | 'performance'
  | 'analytics'
  | 'funnel'
  | 'tracks';

export type ExportFormat = 'xlsx' | 'pdf' | 'csv';

export const EXPORT_FORMATS: { format: ExportFormat; label: string }[] = [
  { format: 'xlsx', label: 'Excel' },
  { format: 'pdf', label: 'PDF' },
  { format: 'csv', label: 'CSV' },
];

/** The export endpoint accepts only these params besides `format`. */
const EXPORT_PARAMS = ['from', 'to', 'periodType', 'periodStart'] as const;

export function exportQuery(query: ReportQuery, format: ExportFormat): Record<string, string> {
  const out: Record<string, string> = { format };
  for (const key of EXPORT_PARAMS) {
    const value = query[key];
    if (value) out[key] = value;
  }
  return out;
}

export const reportsApi = {
  async report<T>(path: string, query: ReportQuery): Promise<T> {
    return (await request<T>(path, { query })).data;
  },
  exportReport(dataset: ExportDataset, format: ExportFormat, query: ReportQuery): Promise<void> {
    return downloadFile(`/reports/${dataset}/export`, `${dataset}-report.${format}`, exportQuery(query, format));
  },
  async lookups(): Promise<ReportLookups> {
    return (await request<ReportLookups>('/leads/lookups')).data;
  },
  async incentivePlans(): Promise<IncentivePlanOption[]> {
    return (await request<IncentivePlanOption[]>('/incentives/plans', { query: { limit: 100 } })).data;
  },
};
