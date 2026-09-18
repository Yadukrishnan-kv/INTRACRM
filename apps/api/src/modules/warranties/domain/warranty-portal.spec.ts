import { PORTAL_JS, renderPortalHomeHtml, renderPortalResultHtml } from './warranty-portal';
import { WarrantyVerifyView } from './warranty-types';

describe('warranty portal', () => {
  const view: WarrantyVerifyView = {
    valid: true,
    cardNumber: 'WR-2026-000001',
    status: 'active',
    statusLabel: 'Active',
    serialNumber: 'SN-1',
    customerName: 'Asha',
    tenantName: 'Intra',
    purchasedOn: '2026-08-01',
    warrantyStartOn: '2026-08-01',
    warrantyEndOn: '2027-08-01',
    coverageNotes: null,
    items: [{ description: 'Pump', serialNumber: 'SN-1', quantity: 1 }],
  };

  it('renders scan, verify, and PDF actions', () => {
    const home = renderPortalHomeHtml('http://localhost:3000/api/v1/public/warranty');
    expect(home).toContain('Scan QR');
    expect(home).toContain('Verify warranty');
    const result = renderPortalResultHtml(
      view,
      'http://localhost:3000/api/v1/public/warranty',
      'a'.repeat(48),
    );
    expect(result).toContain('Download PDF');
    expect(result).toContain('/pdf');
    expect(result).toContain('WR-2026-000001');
  });
});

describe('portal script', () => {
  it('includes QR scan fallbacks', () => {
    expect(PORTAL_JS).toContain('BarcodeDetector');
    expect(PORTAL_JS).toContain('jsQR');
    expect(PORTAL_JS).toContain('getUserMedia');
  });
});
