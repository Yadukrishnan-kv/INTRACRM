import { actor, TENANT_A } from '../../../testing/fixtures';
import { createPrismaMock } from '../../../testing/prisma-mock';
import { CustomerSyncService } from './customer-sync.service';
import { InvoiceSyncService } from './invoice-sync.service';
import { PaymentStatusService } from './payment-status.service';

const now = new Date('2026-08-17T10:00:00.000Z');

function invoiceRow() {
  return {
    id: 'inv-1',
    tenantId: TENANT_A,
    leadId: 'lead-1',
    quotationId: 'q-1',
    billingCustomerId: 'cus-1',
    provider: 'manual',
    externalId: 'INV-1',
    invoiceNumber: 'INV-1',
    status: 'open',
    paymentStatus: 'unpaid',
    currency: 'INR',
    totalMinor: 10000n,
    balanceMinor: 10000n,
    issuedOn: now,
    dueOn: null,
    paidAt: null,
    syncStatus: 'synced',
    lastSyncedAt: now,
    lastError: null,
    version: 1,
  };
}

describe('billing sync coverage', () => {
  const user = actor();
  const prisma = createPrismaMock();
  const timeline = { record: jest.fn().mockResolvedValue({ id: 'act-1' }) };
  const gateway = {
    upsertCustomer: jest.fn().mockResolvedValue({
      ok: true,
      provider: 'manual',
      externalId: 'CUS-LD-1',
      error: null,
    }),
    upsertInvoice: jest.fn().mockResolvedValue({
      ok: true,
      provider: 'manual',
      externalId: 'INV-1',
      invoiceNumber: 'INV-1',
      status: 'open',
      totalMinor: 10000,
      balanceMinor: 10000,
      error: null,
    }),
    fetchPayments: jest.fn().mockResolvedValue({
      ok: true,
      payments: [
        {
          externalId: 'PAY-1',
          amountMinor: 10000,
          currency: 'INR',
          paidOn: '2026-08-17',
          method: 'upi',
          status: 'captured',
        },
      ],
      invoice: { totalMinor: 10000, balanceMinor: 0, status: 'paid' },
    }),
  };

  beforeEach(() => {
    (prisma.lead.findFirst as jest.Mock).mockResolvedValue({
      id: 'lead-1',
      leadNumber: 'LD-1',
      title: 'Need a door',
      customerName: 'Acme',
      primaryPhone: '+919999999999',
      primaryEmail: 'acme@example.test',
      city: 'Pune',
    });
  });

  it('syncs a customer, invoice, and inbound payment', async () => {
    const customers = new CustomerSyncService(prisma as never, gateway as never, timeline as never);
    (prisma.billingCustomer.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.billingCustomer.create as jest.Mock).mockResolvedValue({
      id: 'cus-1',
      leadId: 'lead-1',
      provider: 'manual',
      externalId: 'CUS-LD-1',
      displayName: 'Acme',
      phoneE164: '+919999999999',
      email: 'acme@example.test',
      city: 'Pune',
      syncStatus: 'synced',
      lastSyncedAt: now,
      lastError: null,
    });
    await expect(customers.syncLead(user, 'lead-1')).resolves.toMatchObject({
      externalId: 'CUS-LD-1',
    });

    const invoices = new InvoiceSyncService(
      prisma as never,
      gateway as never,
      customers,
      timeline as never,
    );
    (prisma.quotation.findFirst as jest.Mock).mockResolvedValue({
      id: 'q-1',
      leadId: 'lead-1',
      quotationNumber: 'QT-0001',
      status: 'won',
      currency: 'INR',
      totalMinor: 10000n,
      wonAt: now,
      expectedCloseOn: null,
      items: [
        {
          description: 'Door',
          quantity: 1,
          unitPriceMinor: 10000n,
          lineTotalMinor: 10000n,
        },
      ],
    });
    (prisma.billingCustomer.findFirst as jest.Mock).mockResolvedValue({
      id: 'cus-1',
      externalId: 'CUS-LD-1',
    });
    (prisma.billingInvoice.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.billingInvoice.create as jest.Mock).mockResolvedValue(invoiceRow());
    await expect(invoices.syncQuotation(user, 'q-1')).resolves.toMatchObject({
      invoiceNumber: 'INV-1',
    });

    const payments = new PaymentStatusService(
      prisma as never,
      gateway as never,
      invoices,
      timeline as never,
    );
    (prisma.billingInvoice.findFirst as jest.Mock).mockResolvedValue(invoiceRow());
    (prisma.billingInvoice.findFirstOrThrow as jest.Mock).mockResolvedValue(invoiceRow());
    (prisma.billingPayment.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.billingPayment.create as jest.Mock).mockResolvedValue({
      id: 'pay-1',
      invoiceId: 'inv-1',
      provider: 'manual',
      externalId: 'PAY-1',
      amountMinor: 10000n,
      currency: 'INR',
      method: 'upi',
      status: 'captured',
      paidOn: now,
      receivedAt: now,
    });
    (prisma.billingPayment.findMany as jest.Mock).mockResolvedValue([{ amountMinor: 10000n }]);
    (prisma.billingInvoice.update as jest.Mock).mockResolvedValue({
      ...invoiceRow(),
      paymentStatus: 'paid',
      balanceMinor: 0n,
    });
    await expect(payments.refreshInvoice(user, 'inv-1')).resolves.toMatchObject({
      invoiceNumber: 'INV-1',
    });
    await expect(
      payments.applyInbound(user, {
        invoiceExternalId: 'INV-1',
        paymentExternalId: 'PAY-2',
        amountMinor: 10000,
        currency: 'INR',
        paidOn: '2026-08-17',
        method: 'upi',
        status: 'captured',
      }),
    ).resolves.toBeDefined();
    expect(
      payments.toPaymentView({
        id: 'pay-1',
        invoiceId: 'inv-1',
        provider: 'manual',
        externalId: 'PAY-1',
        amountMinor: 10000n,
        currency: 'INR',
        method: 'upi',
        status: 'captured',
        paidOn: now,
        receivedAt: now,
      }),
    ).toMatchObject({ amountMinor: 10000 });
  });
});
