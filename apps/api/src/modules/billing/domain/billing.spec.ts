import { createHmac } from 'crypto';
import {
  applyPaymentBalance,
  customerDisplayName,
  derivePaymentStatus,
  INVOICE_STATUS,
  localCustomerExternalId,
  localInvoiceNumber,
  PAYMENT_STATUS,
  verifyHmacSha256,
} from './billing';

describe('billing domain', () => {
  it('maps CRM identity onto accounting keys', () => {
    expect(customerDisplayName({ customerName: ' Asha ', title: 'Lead' })).toBe('Asha');
    expect(customerDisplayName({ customerName: null, title: 'Lead' })).toBe('Lead');
    expect(localCustomerExternalId('LD-1001')).toBe('CUS-LD-1001');
    expect(localInvoiceNumber('QT-1001')).toBe('INV-1001');
  });

  it('derives payment status from balance and due date', () => {
    expect(
      derivePaymentStatus({ invoiceStatus: INVOICE_STATUS.issued, totalMinor: 1000, balanceMinor: 1000 }),
    ).toBe(PAYMENT_STATUS.unpaid);
    expect(
      derivePaymentStatus({ invoiceStatus: INVOICE_STATUS.issued, totalMinor: 1000, balanceMinor: 400 }),
    ).toBe(PAYMENT_STATUS.partial);
    expect(
      derivePaymentStatus({ invoiceStatus: INVOICE_STATUS.issued, totalMinor: 1000, balanceMinor: 0 }),
    ).toBe(PAYMENT_STATUS.paid);
    expect(
      derivePaymentStatus({
        invoiceStatus: INVOICE_STATUS.issued,
        totalMinor: 1000,
        balanceMinor: 1000,
        dueOn: '2020-01-01',
        asOf: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ).toBe(PAYMENT_STATUS.overdue);
    expect(
      derivePaymentStatus({ invoiceStatus: INVOICE_STATUS.void, totalMinor: 1000, balanceMinor: 1000 }),
    ).toBe(PAYMENT_STATUS.void);
    expect(applyPaymentBalance(1000, 250)).toBe(750);
  });

  it('verifies webhook HMAC signatures', () => {
    const secret = 'whsec_test';
    const body = '{"event":"payment.recorded"}';
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyHmacSha256(body, secret, `sha256=${signature}`)).toBe(true);
    expect(verifyHmacSha256(body, secret, signature)).toBe(true);
    expect(verifyHmacSha256(body, secret, 'deadbeef')).toBe(false);
    expect(verifyHmacSha256(body, '', signature)).toBe(false);
  });
});
