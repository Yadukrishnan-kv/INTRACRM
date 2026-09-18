import PDFDocument from 'pdfkit';
import { ExportDocument } from './export-types';

export async function renderPdf(doc: ExportDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    pdf.fontSize(16).fillColor('#12202b').text(doc.title);
    pdf.moveDown(0.2);
    pdf.fontSize(9).fillColor('#5b6b76').text(`Generated ${doc.generatedAt}`);
    pdf.moveDown(0.8);

    for (const table of doc.tables) {
      if (pdf.y > 500) {
        pdf.addPage();
      }
      pdf.fontSize(12).fillColor('#12202b').text(table.name);
      pdf.moveDown(0.3);
      const colCount = Math.max(table.headers.length, 1);
      const usable = 720;
      const colWidth = usable / colCount;
      const startX = pdf.x;
      let y = pdf.y;
      pdf.fontSize(8).fillColor('#12202b');
      table.headers.forEach((header, index) => {
        pdf.text(header, startX + index * colWidth, y, { width: colWidth - 6, continued: false });
      });
      y += 16;
      pdf.moveTo(startX, y - 4).lineTo(startX + usable, y - 4).strokeColor('#d7dee4').stroke();
      for (const row of table.rows) {
        if (y > 520) {
          pdf.addPage();
          y = pdf.y;
        }
        row.forEach((value, index) => {
          pdf.fillColor('#12202b').text(value, startX + index * colWidth, y, {
            width: colWidth - 6,
            continued: false,
          });
        });
        y += 14;
      }
      pdf.y = y + 12;
      pdf.x = startX;
    }

    pdf.end();
  });
}
