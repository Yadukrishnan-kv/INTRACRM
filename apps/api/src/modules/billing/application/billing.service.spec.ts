import { createHmac } from 'crypto';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { actor, TENANT_A } from '../../../testing/fixtures';
import { configStub } from '../../../testing/config-stub';
import { createPrismaMock } from '../../../testing/prisma-mock';
import { BillingService } from './billing.service';
import { BillingGateway } from './billing.gateway';
import { BILLING_WEBHOOK_EVENT } from '../domain/billing';
import { PinoLogger } from '../../../common/logging/pino-logger';

describe('BillingGateway', () => {
  const logger = { warn: jest.fn() };

  it('returns manual capabilities without HTTP config', async () => {
    const gateway = new BillingGateway(configStub() as never, logger as unknown as PinoLogger);
    expect(gateway.capabilities()).toMatchObject({ provider: 'manual', mode: 'manual' });
    await expect(
      gateway.upsertCustomer({
        leadId: 'l',
        leadNumber: 'LD-1',
        displayName: 'Patel',
        phoneE164: null,
        email: null,
        city: null,
      }),
    ).resolves.toMatchObject({ ok: true, externalId: 'CUS-LD-1' });
    await expect(
      gateway.upsertInvoice({
        quotationId: 'q',
        quotationNumber: 'QT-1',
        customerExternalId: 'CUS-1',
        currency: 'INR',
        totalMinor: 100,
        issuedOn: '2026-01-01',
        dueOn: null,
        lines: [],
      }),
    ).resolves.toMatchObject({ ok: true, invoiceNumber: 'INV-1' });
    await expect(gateway.fetchPayments('INV-1')).resolves.toMatchObject({ ok: true, payments: [] });
  });

  it('falls back when the HTTP gateway is unreachable', async () => {
    const gateway = new BillingGateway(
      configStub({
        billing: {
          provider: 'http',
          apiBaseUrl: 'https://billing.test',
          apiToken: 'tok',
          webhookSecret: 'secret',
        },
      }) as never,
      logger as unknown as PinoLogger,
    );
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(
      gateway.upsertCustomer({
        leadId: 'l',
        leadNumber: 'LD-1',
        displayName: 'Patel',
        phoneE164: null,
        email: null,
        city: null,
      }),
    ).resolves.toMatchObject({ ok: false, provider: 'http' });
    fetchSpy.mockRestore();
  });

  it('posts customers and invoices and reads payments over HTTP', async () => {
    const gateway = new BillingGateway(
      configStub({
        billing: {
          provider: 'http',
          apiBaseUrl: 'https://billing.test',
          apiToken: 'tok',
          webhookSecret: 'secret',
        },
      }) as never,
      logger as unknown as PinoLogger,
    );
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const href = String(input);
      if (href.endsWith('/customers')) {
        return { ok: true, json: async () => ({ externalId: 'CUS-HTTP' }) } as Response;
      }
      if (href.endsWith('/invoices') && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            externalId: 'INV-HTTP',
            invoiceNumber: 'INV-9',
            status: 'issued',
            totalMinor: 200,
            balanceMinor: 200,
          }),
        } as Response;
      }
      if (href.includes('/payments')) {
        return {
          ok: true,
          json: async () => ({
            payments: [
              {
                externalId: 'pay-1',
                amountMinor: 50,
                currency: 'INR',
                paidOn: '2026-01-01',
                method: 'upi',
                status: 'captured',
              },
            ],
            invoice: { status: 'partial', totalMinor: 200, balanceMinor: 150 },
          }),
        } as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    });
    await expect(
      gateway.upsertCustomer({
        leadId: 'l',
        leadNumber: 'LD-1',
        displayName: 'Patel',
        phoneE164: null,
        email: null,
        city: null,
      }),
    ).resolves.toMatchObject({ ok: true, provider: 'http', externalId: 'CUS-HTTP' });
    await expect(
      gateway.upsertInvoice({
        quotationId: 'q',
        quotationNumber: 'QT-1',
        customerExternalId: 'CUS-HTTP',
        currency: 'INR',
        totalMinor: 200,
        issuedOn: '2026-01-01',
        dueOn: null,
        lines: [],
      }),
    ).resolves.toMatchObject({ ok: true, invoiceNumber: 'INV-9' });
    await expect(gateway.fetchPayments('INV-HTTP')).resolves.toMatchObject({
      ok: true,
      invoice: { status: 'partial' },
      payments: [expect.objectContaining({ method: 'upi' })],
    });
    fetchSpy.mockRestore();
  });

  it('maps HTTP error bodies and missing payment arrays', async () => {
    const gateway = new BillingGateway(
      configStub({
        billing: {
          provider: 'http',
          apiBaseUrl: 'https://billing.test',
          apiToken: 'tok',
          webhookSecret: 'secret',
        },
      }) as never,
      logger as unknown as PinoLogger,
    );
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ message: 'customer exists' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ payments: 'none' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response);
    await expect(
      gateway.upsertCustomer({
        leadId: 'l',
        leadNumber: 'LD-1',
        displayName: 'Patel',
        phoneE164: null,
        email: null,
        city: null,
      }),
    ).resolves.toMatchObject({ ok: false, error: 'customer exists' });
    await expect(
      gateway.upsertInvoice({
        quotationId: 'q',
        quotationNumber: 'QT-1',
        customerExternalId: 'CUS-1',
        currency: 'INR',
        totalMinor: 100,
        issuedOn: '2026-01-01',
        dueOn: null,
        lines: [],
      }),
    ).resolves.toMatchObject({ ok: false, error: 'Billing 500' });
    await expect(gateway.fetchPayments('INV-1')).resolves.toMatchObject({
      ok: true,
      payments: [],
      invoice: null,
    });
    await expect(gateway.fetchPayments('INV-missing')).resolves.toMatchObject({
      ok: false,
      payments: [],
    });
    fetchSpy.mockRestore();
  });
});

describe('BillingService', () => {
  const prisma = createPrismaMock();
  const gateway = {
    capabilities: jest.fn().mockReturnValue({ provider: 'manual' }),
    webhookSecret: jest.fn().mockReturnValue('webhook-secret'),
  };
  const customers = { toView: jest.fn((row: { id: string }) => row), syncLead: jest.fn() };
  const invoices = { toView: jest.fn((row: { id: string }) => row), syncQuotation: jest.fn() };
  const payments = {
    toPaymentView: jest.fn((row: { id: string }) => row),
    refreshInvoice: jest.fn(),
    applyInbound: jest.fn(),
  };
  const logger = { warn: jest.fn() };
  const service = new BillingService(
    prisma as never,
    gateway as unknown as BillingGateway,
    customers as never,
    invoices as never,
    payments as never,
    logger as unknown as PinoLogger,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    gateway.webhookSecret.mockReturnValue('webhook-secret');
  });

  it('requires a tenant and a lead for snapshots', async () => {
    await expect(
      service.snapshot({ userId: 'u', sessionId: 's' }, 'lead-1'),
    ).rejects.toMatchObject({ code: ErrorCodes.TENANT_REQUIRED });
    (prisma.lead.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.snapshot(actor(), 'lead-1')).rejects.toMatchObject({
      code: ErrorCodes.NOT_FOUND,
    });
  });

  it('swallows won-quotation billing failures', async () => {
    invoices.syncQuotation.mockRejectedValue(new Error('accounting down'));
    await expect(service.syncWonQuotation(actor(), 'q1')).resolves.toMatchObject({
      invoice: null,
      warning: 'accounting down',
    });
  });

  it('rejects webhooks with a bad HMAC', async () => {
    await expect(
      service.handleWebhook({
        provider: 'http',
        rawBody: '{}',
        signature: 'sha256=deadbeef',
        event: BILLING_WEBHOOK_EVENT.customerUpserted,
        tenantId: TENANT_A,
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.UNAUTHORIZED });
  });

  it('accepts a signed customer upsert', async () => {
    const body = JSON.stringify({ ok: true });
    const signature = `sha256=${createHmac('sha256', 'webhook-secret').update(body).digest('hex')}`;
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValue({ id: TENANT_A });
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue({ id: 'm1', userId: 'u1' });
    (prisma.billingCustomer.findFirst as jest.Mock).mockResolvedValue({
      id: 'c1',
      displayName: 'Old',
      phoneE164: null,
      email: null,
      city: null,
    });
    (prisma.billingCustomer.update as jest.Mock).mockResolvedValue({ id: 'c1' });
    await expect(
      service.handleWebhook({
        provider: 'http',
        rawBody: body,
        signature,
        event: BILLING_WEBHOOK_EVENT.customerUpserted,
        tenantId: TENANT_A,
        customer: { externalId: 'CUS-1', displayName: 'New' },
      }),
    ).resolves.toMatchObject({ accepted: true });
  });

  it('returns a billing snapshot and invoice webhook fallback', async () => {
    (prisma.lead.findFirst as jest.Mock).mockResolvedValue({ id: 'lead-1' });
    (prisma.billingCustomer.findFirst as jest.Mock).mockResolvedValue({
      id: 'c1',
      leadId: 'lead-1',
      provider: 'manual',
      externalId: 'CUS-1',
      displayName: 'Acme',
      phoneE164: null,
      email: null,
      city: null,
      syncStatus: 'synced',
      lastSyncedAt: new Date(),
      lastError: null,
    });
    (prisma.billingInvoice.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'inv-1',
        leadId: 'lead-1',
        quotationId: 'q-1',
        provider: 'manual',
        externalId: 'INV-1',
        invoiceNumber: 'INV-1',
        status: 'open',
        paymentStatus: 'unpaid',
        currency: 'INR',
        totalMinor: 10000n,
        balanceMinor: 10000n,
        issuedOn: new Date(),
        dueOn: null,
        paidAt: null,
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
        lastError: null,
        payments: [
          {
            id: 'pay-1',
            invoiceId: 'inv-1',
            provider: 'manual',
            externalId: 'PAY-1',
            amountMinor: 1000n,
            currency: 'INR',
            method: 'upi',
            status: 'captured',
            paidOn: new Date(),
            receivedAt: new Date(),
          },
        ],
      },
    ]);
    await expect(service.snapshot(actor(), 'lead-1')).resolves.toMatchObject({
      customer: { id: 'c1' },
    });
    expect(service.capabilities()).toEqual({ provider: 'manual' });
    customers.syncLead.mockResolvedValue({ id: 'c1' });
    invoices.syncQuotation.mockResolvedValue({ id: 'inv-1' });
    payments.refreshInvoice.mockResolvedValue({ id: 'inv-1' });
    await expect(service.syncCustomer(actor(), 'lead-1')).resolves.toMatchObject({ id: 'c1' });
    await expect(service.syncInvoice(actor(), 'q-1')).resolves.toMatchObject({ id: 'inv-1' });
    await expect(service.refreshPayment(actor(), 'inv-1')).resolves.toMatchObject({ id: 'inv-1' });
    invoices.syncQuotation.mockResolvedValue({ id: 'inv-1', warning: null });
    await expect(service.syncWonQuotation(actor(), 'q-1')).resolves.toMatchObject({ invoice: { id: 'inv-1' } });

    const body = JSON.stringify({ ok: true });
    const signature = `sha256=${createHmac('sha256', 'webhook-secret').update(body).digest('hex')}`;
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValue({ id: TENANT_A });
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue({ id: 'm1', userId: 'u1' });
    (prisma.billingInvoice.findFirst as jest.Mock).mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-1',
      status: 'open',
      totalMinor: 10000n,
      balanceMinor: 10000n,
      currency: 'INR',
    });
    payments.refreshInvoice.mockRejectedValue(new Error('offline'));
    (prisma.billingInvoice.update as jest.Mock).mockResolvedValue({
      id: 'inv-1',
      leadId: 'lead-1',
      quotationId: 'q-1',
      provider: 'http',
      externalId: 'INV-1',
      invoiceNumber: 'INV-1',
      status: 'open',
      paymentStatus: 'unpaid',
      currency: 'INR',
      totalMinor: 10000n,
      balanceMinor: 5000n,
      issuedOn: new Date(),
      dueOn: null,
      paidAt: null,
      syncStatus: 'synced',
      lastSyncedAt: new Date(),
      lastError: null,
    });
    await expect(
      service.handleWebhook({
        provider: 'http',
        rawBody: body,
        signature,
        event: BILLING_WEBHOOK_EVENT.invoiceUpserted,
        tenantId: TENANT_A,
        invoice: { externalId: 'INV-1', balanceMinor: 5000 },
      }),
    ).resolves.toMatchObject({ accepted: true });
    payments.applyInbound.mockResolvedValue({ id: 'inv-1' });
    await expect(
      service.handleWebhook({
        provider: 'http',
        rawBody: body,
        signature,
        event: BILLING_WEBHOOK_EVENT.paymentRecorded,
        tenantId: TENANT_A,
        payment: {
          invoiceExternalId: 'INV-1',
          paymentExternalId: 'PAY-1',
          amountMinor: 1000,
          currency: 'INR',
          paidOn: '2026-08-17',
          method: 'upi',
          status: 'captured',
        },
      }),
    ).resolves.toMatchObject({ accepted: true });
  });
});
