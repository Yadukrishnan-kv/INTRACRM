import { allowedNextStatuses, canSendQuotationStatus, canTransitionQuotation } from './quotation-types';
import { computeQuotationTotals } from './quotation-totals';
import { summarizeQuotations } from './quotation-report';

describe('quotation pipeline', () => {
  it('sends from draft and reaches won only from approved', () => {
    expect(canSendQuotationStatus('draft')).toBe(true);
    expect(allowedNextStatuses('draft')).toEqual(['sent', 'lost']);
    expect(allowedNextStatuses('sent')).toEqual([
      'follow_up',
      'customer_deciding',
      'negotiation',
      'approved',
      'lost',
    ]);
    expect(canTransitionQuotation('negotiation', 'approved')).toBe(true);
    expect(canTransitionQuotation('negotiation', 'won')).toBe(false);
    expect(canTransitionQuotation('approved', 'won')).toBe(true);
    expect(allowedNextStatuses('won')).toEqual([]);
  });
});

describe('quotation totals', () => {
  it('applies quantity, discount, and tax bps', () => {
    const totals = computeQuotationTotals([
      { quantity: 2, unitPriceMinor: 10000, discountMinor: 1000, taxBps: 1800 },
    ]);
    expect(totals.subtotalMinor).toBe(20000);
    expect(totals.discountMinor).toBe(1000);
    expect(totals.taxMinor).toBe(3420);
    expect(totals.totalMinor).toBe(22420);
  });
});

describe('quotation report', () => {
  it('counts pipeline value and win rate', () => {
    const report = summarizeQuotations(
      [
        {
          status: 'won',
          assignedToMembershipId: 'm1',
          assigneeName: 'Asha',
          totalMinor: 50000,
        },
        {
          status: 'lost',
          assignedToMembershipId: 'm1',
          assigneeName: 'Asha',
          totalMinor: 10000,
        },
        {
          status: 'sent',
          assignedToMembershipId: 'm2',
          assigneeName: 'Ravi',
          totalMinor: 25000,
        },
      ],
      new Date('2026-08-16T12:00:00.000Z'),
    );
    expect(report.totals.won).toBe(1);
    expect(report.totals.lost).toBe(1);
    expect(report.totals.openValueMinor).toBe(25000);
    expect(report.totals.wonValueMinor).toBe(50000);
    expect(report.totals.winRateBps).toBe(5000);
  });
});
