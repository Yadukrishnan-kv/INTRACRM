export const EXPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_DATASETS = [
  'leads',
  'follow-ups',
  'quotations',
  'sales',
  'performance',
  'analytics',
  'funnel',
  'tracks',
] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];

export type ExportTable = {
  name: string;
  headers: string[];
  rows: string[][];
};

export type ExportDocument = {
  title: string;
  fileStem: string;
  generatedAt: string;
  tables: ExportTable[];
};

export type ExportFile = {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
};

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

export function mimeTypeFor(format: ExportFormat): string {
  switch (format) {
    case 'csv':
      return 'text/csv; charset=utf-8';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'pdf':
      return 'application/pdf';
  }
}

export function fileNameFor(stem: string, format: ExportFormat): string {
  return `${stem}.${format === 'xlsx' ? 'xlsx' : format}`;
}

export function rupees(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function percent(bps: number | null | undefined): string {
  if (bps == null) {
    return '';
  }
  return `${(bps / 100).toFixed(0)}%`;
}

export function titleCase(code: string): string {
  return code.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function cell(value: string | number | null | undefined): string {
  if (value == null) {
    return '';
  }
  return String(value);
}
