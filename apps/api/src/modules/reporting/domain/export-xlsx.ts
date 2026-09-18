import ExcelJS from 'exceljs';
import { ExportDocument } from './export-types';

function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Sheet';
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function renderXlsx(doc: ExportDocument): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'INTRA LEADS';
  workbook.created = new Date(doc.generatedAt);
  const used = new Set<string>();
  const cover = workbook.addWorksheet(sheetName('Summary', used));
  cover.addRow([doc.title]);
  cover.addRow(['Generated', doc.generatedAt]);
  cover.getRow(1).font = { bold: true, size: 14 };
  for (const table of doc.tables) {
    const sheet = workbook.addWorksheet(sheetName(table.name, used));
    sheet.columns = table.headers.map((header) => ({ header, width: 18 }));
    sheet.getRow(1).font = { bold: true };
    for (const row of table.rows) {
      sheet.addRow(row);
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
