import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export async function qrPngBuffer(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, { type: 'png', margin: 1, width: 280, errorCorrectionLevel: 'M' });
}

export async function qrPngBase64(text: string): Promise<string> {
  return (await qrPngBuffer(text)).toString('base64');
}

export type WarrantyPdfInput = {
  tenantName: string;
  cardNumber: string;
  statusLabel: string;
  customerName: string | null;
  serialNumber: string | null;
  warrantyStartOn: string;
  warrantyEndOn: string;
  coverageNotes: string | null;
  verifyUrl: string;
  items: Array<{ description: string; serialNumber: string | null; quantity: number }>;
};

export async function buildWarrantyPdf(input: WarrantyPdfInput): Promise<Buffer> {
  const qr = await qrPngBuffer(input.verifyUrl);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(11).fillColor('#444').text(input.tenantName);
    doc.moveDown(0.3);
    doc.fontSize(20).fillColor('#122').text('Warranty card');
    doc.fontSize(14).text(input.cardNumber);
    doc.moveDown(0.4);
    doc.fontSize(12).text(`Status: ${input.statusLabel}`);
    if (input.customerName) {
      doc.text(`Customer: ${input.customerName}`);
    }
    if (input.serialNumber) {
      doc.text(`Serial: ${input.serialNumber}`);
    }
    doc.text(`Valid ${input.warrantyStartOn} to ${input.warrantyEndOn}`);
    if (input.coverageNotes) {
      doc.moveDown(0.3);
      doc.fontSize(10).text(input.coverageNotes);
    }
    doc.moveDown(0.6);
    doc.fontSize(12).text('Covered items');
    doc.fontSize(10);
    for (const item of input.items) {
      doc.text(
        `• ${item.description} × ${item.quantity}${item.serialNumber ? `  SN ${item.serialNumber}` : ''}`,
      );
    }
    doc.moveDown(1);
    doc.image(qr, { width: 140 });
    doc.moveDown(0.4);
    doc.fontSize(8).fillColor('#666').text(input.verifyUrl, { width: 360 });
    doc.end();
  });
}
