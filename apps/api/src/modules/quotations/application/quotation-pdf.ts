import PDFDocument from 'pdfkit';
import type { QuotationSettings } from '../domain/quotation-settings';
import { DEFAULT_LOGO_DATA_URL } from './default-logo';
import type { QuotationView } from './quotation.mapper';

export type QuotationPdfInput = {
  tenantName: string;
  settings: QuotationSettings;
  quotation: QuotationView;
  customerPhone: string | null;
  location: string | null;
};

const TEAL = '#12b0a0';
const BLUE = '#0b5d52';
const RED = '#b3261e';
const BEIGE = '#f1ede4';
const INK = '#111111';
const LINE = '#222222';

/** Indian digit grouping; paise only when present (6900, 14,650.00 for totals). */
export function pdfAmount(minor: number, forceDecimals = false): string {
  const whole = minor % 100 === 0 && !forceDecimals;
  return (minor / 100).toLocaleString('en-IN', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function pdfDate(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

function logoBuffer(dataUrl: string): Buffer | null {
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl);
  return match?.[2] ? Buffer.from(match[2], 'base64') : null;
}

function sizeText(value: number | null): string {
  return value == null ? '' : String(value);
}

export async function buildQuotationPdf(input: QuotationPdfInput): Promise<Buffer> {
  const q = input.quotation;
  const company = input.settings.companyName || input.tenantName || '';
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 28 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const X = 28;
    const W = 539;
    let y = 28;
    const bottom = 800;
    doc.lineWidth(0.6).strokeColor(LINE);

    const ensure = (need: number) => {
      if (y + need > bottom) {
        doc.addPage();
        y = 28;
      }
    };
    const cell = (x: number, top: number, w: number, h: number, fill?: string) => {
      if (fill) doc.rect(x, top, w, h).fillAndStroke(fill, LINE);
      else doc.rect(x, top, w, h).stroke();
    };
    const text = (
      value: string,
      x: number,
      top: number,
      w: number,
      opts: { size?: number; bold?: boolean; color?: string; align?: 'left' | 'center' | 'right' } = {},
    ) => {
      doc
        .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(opts.size ?? 7.5)
        .fillColor(opts.color ?? INK)
        .text(value, x + 3, top, { width: w - 6, align: opts.align ?? 'left' });
    };

    // Header
    cell(X, y, W, 70);
    const logo = logoBuffer(input.settings.logoDataUrl) ?? logoBuffer(DEFAULT_LOGO_DATA_URL);
    if (logo) {
      doc.image(logo, X + 8, y + 8, { fit: [190, 54] });
    } else {
      text(company, X + 5, y + 24, 300, { size: 20, bold: true, color: BLUE });
    }
    text('QUOTATION', X + W - 220, y + 26, 215, { size: 13, bold: true, color: TEAL, align: 'right' });
    y += 70;

    // Customer / quotation details
    const leftW = 300;
    const rightX = X + 330;
    const rightLabelW = 110;
    const rows: Array<[string, string, string, string]> = [
      ['CUSTOMER NAME:', q.customerName ?? '', 'QUOTATION NO.', q.quotationNumber + (q.revision > 1 ? ` (R${q.revision})` : '')],
      ['PHONE:', input.customerPhone ?? '', 'DATE', pdfDate(q.sentAt)],
      ['LOCATION:', input.location ?? '', 'STAFF NAME', q.assigneeName ?? ''],
    ];
    for (const [l1, v1, l2, v2] of rows) {
      cell(X, y, leftW, 18);
      text(`${l1} ${v1}`, X, y + 5, leftW);
      cell(rightX, y, rightLabelW, 18);
      text(l2, rightX, y + 5, rightLabelW);
      cell(rightX + rightLabelW, y, X + W - rightX - rightLabelW, 18);
      text(v2, rightX + rightLabelW, y + 5, X + W - rightX - rightLabelW, { align: 'center' });
      y += 18;
    }

    // Items table
    const cols = [
      { label: 'S. No', w: 32 },
      { label: 'ITEM', w: 62 },
      { label: 'DESCRIPTION', w: 205 },
      { label: 'WIDTH', w: 40 },
      { label: 'HEIGHT', w: 40 },
      { label: 'UNIT PRICE', w: 62 },
      { label: 'QTY', w: 32 },
      { label: 'TOTAL', w: 66 },
    ];
    const colX: number[] = [];
    cols.reduce((acc, col, i) => ((colX[i] = acc), acc + col.w), X);
    const tableHeader = () => {
      cell(X, y, W, 16, TEAL);
      cols.forEach((col, i) =>
        text(col.label, colX[i]!, y + 4.5, col.w, { size: 7, bold: true, color: '#ffffff', align: 'center' }),
      );
      y += 16;
    };
    tableHeader();

    q.items.forEach((item, index) => {
      const lines = item.description.split('\n').map((l) => l.trim()).filter(Boolean);
      const body = lines.map((l) => `• ${l}`).join('\n');
      doc.font('Helvetica').fontSize(7.5);
      const h = Math.max(30, doc.heightOfString(body, { width: cols[2]!.w - 6 }) + 10);
      if (y + h > bottom) {
        doc.addPage();
        y = 28;
        tableHeader();
      }
      cols.forEach((col, i) => cell(colX[i]!, y, col.w, h));
      const mid = y + h / 2 - 4;
      text(String(index + 1), colX[0]!, mid, cols[0]!.w, { align: 'center' });
      text(item.itemCode ?? '', colX[1]!, mid, cols[1]!.w, { align: 'center' });
      text(body, colX[2]!, y + 5, cols[2]!.w);
      text(sizeText(item.width), colX[3]!, mid, cols[3]!.w, { align: 'center' });
      text(sizeText(item.height), colX[4]!, mid, cols[4]!.w, { align: 'center' });
      text(pdfAmount(item.unitPriceMinor), colX[5]!, mid, cols[5]!.w, { align: 'center' });
      text(String(item.quantity), colX[6]!, mid, cols[6]!.w, { align: 'center' });
      text(pdfAmount(item.unitPriceMinor * item.quantity), colX[7]!, mid, cols[7]!.w, { align: 'center' });
      y += h;
    });

    for (const charge of q.charges) {
      ensure(18);
      cell(X, y, W - cols[7]!.w, 18);
      text(charge.description, X + cols[0]!.w, y + 5, W - cols[7]!.w - cols[0]!.w);
      cell(colX[7]!, y, cols[7]!.w, 18);
      text(pdfAmount(charge.amountMinor), colX[7]!, y + 5, cols[7]!.w, { align: 'center' });
      y += 18;
    }

    // Sub total
    ensure(18);
    const qtySum = q.items.reduce((sum, item) => sum + item.quantity, 0);
    cell(X, y, W, 18, TEAL);
    text('SUB TOTAL', X, y + 5, colX[6]! - X, { bold: true, color: '#ffffff', align: 'center', size: 8 });
    text(String(qtySum), colX[6]!, y + 5, cols[6]!.w, { bold: true, color: '#ffffff', align: 'center', size: 8 });
    text(pdfAmount(q.subtotalMinor), colX[7]!, y + 5, cols[7]!.w, { bold: true, color: '#ffffff', align: 'center', size: 8 });
    y += 18;

    // Bank details + discount / GST / grand total
    ensure(110);
    const boxH = 92;
    const midX = colX[5]!;
    cell(X, y, 120, boxH);
    cell(X + 120, y, midX - X - 120, boxH);
    const bank = [company, ...input.settings.bankDetails.split('\n').map((l) => l.trim()).filter(Boolean)];
    text(bank[0] ?? '', X, y + 20, 120, { bold: true, align: 'center', size: 7.5 });
    text(bank.slice(1).join('\n'), X, y + 33, 120, { align: 'center', size: 7 });
    text(`For ${company}`, X + 120, y + 14, midX - X - 120, { align: 'center', size: 8, bold: true });
    const rightW = X + W - midX;
    let ry = y;
    const sumRow = (label: string, value: string) => {
      cell(midX, ry, rightW - cols[7]!.w, 18);
      text(label, midX, ry + 5, rightW - cols[7]!.w, { bold: true, size: 8 });
      cell(colX[7]!, ry, cols[7]!.w, 18);
      text(value, colX[7]!, ry + 5, cols[7]!.w, { align: 'center', size: 8 });
      ry += 18;
    };
    if (q.discountMinor > 0 || q.gstInclusive) sumRow('DISCOUNT', q.discountMinor > 0 ? pdfAmount(q.discountMinor) : '0');
    if (!q.gstInclusive && q.taxMinor > 0) sumRow('GST', pdfAmount(q.taxMinor));
    cell(midX, ry, rightW, 16, TEAL);
    text('GRAND TOTAL', midX, ry + 4.5, rightW, { bold: true, color: '#ffffff', align: 'center', size: 8 });
    ry += 16;
    const remain = y + boxH - ry;
    cell(midX, ry, rightW, remain, BLUE);
    text(pdfAmount(q.totalMinor, true), midX, ry + remain / 2 - 7, rightW, { bold: true, color: '#ffffff', align: 'center', size: 14 });
    y += boxH;

    // Specifications
    if (q.specs.length) {
      ensure(30);
      cell(X, y, W, 18, TEAL);
      text('PRODUCT SPECIFICATION AND TECHNICAL DETAILS', X, y + 4.5, W, { bold: true, color: '#ffffff', align: 'center', size: 9 });
      y += 18;
      const lw = 110;
      const vw = (W - 2 * lw) / 2;
      for (let i = 0; i < q.specs.length; i += 2) {
        ensure(16);
        const pair = [q.specs[i], q.specs[i + 1]];
        pair.forEach((spec, k) => {
          const bx = X + k * (lw + vw);
          cell(bx, y, lw, 16, BEIGE);
          cell(bx + lw, y, vw, 16, BEIGE);
          if (spec) {
            text(spec.label.toUpperCase(), bx, y + 4.5, lw, { size: 6.5 });
            text(spec.value, bx + lw, y + 4.5, vw, { size: 6.5, color: RED });
          }
        });
        y += 16;
      }
    }

    // Terms + footer
    const terms = (q.terms ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (terms.length) {
      doc.font('Helvetica').fontSize(6.5);
      const body = terms.map((t, i) => (/^\d+[.)]/.test(t) ? t : `${i + 1}. ${t}`)).join('\n');
      const h = doc.heightOfString(body, { width: W - 8 }) + 22;
      ensure(h + 24);
      cell(X, y, W, h);
      text('TERMS AND CONDITIONS', X + 2, y + 4, W, { bold: true, size: 7 });
      text(body, X + 2, y + 14, W - 4, { size: 6.5 });
      y += h;
    }
    if (input.settings.address) {
      ensure(30);
      const h = 28;
      cell(X, y, W, h);
      text(company, X, y + 5, W, { bold: true, color: TEAL, align: 'center', size: 8 });
      text(input.settings.address, X, y + 16, W, { align: 'center', size: 6.5 });
    }
    doc.end();
  });
}
