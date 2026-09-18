import { ExportDocument } from './export-types';

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function renderCsv(doc: ExportDocument): Buffer {
  const lines: string[] = [doc.title, `Generated,${csvEscape(doc.generatedAt)}`, ''];
  for (const table of doc.tables) {
    lines.push(csvEscape(table.name));
    lines.push(table.headers.map(csvEscape).join(','));
    for (const row of table.rows) {
      lines.push(row.map(csvEscape).join(','));
    }
    lines.push('');
  }
  return Buffer.from(`\uFEFF${lines.join('\r\n')}`, 'utf8');
}
