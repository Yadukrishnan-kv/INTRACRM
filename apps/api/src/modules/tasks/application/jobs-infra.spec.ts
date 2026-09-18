import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { actor } from '../../../testing/fixtures';
import { createPrismaMock } from '../../../testing/prisma-mock';
import { configStub } from '../../../testing/config-stub';
import { FollowUpEngineProcessor } from './follow-up-engine.processor';
import { FollowUpEngineScheduler } from './follow-up-engine.scheduler';
import { FollowUpEngineService } from './follow-up-engine.service';
import { QuotationFollowUpProcessor } from '../../quotations/application/quotation-follow-up.processor';
import { QuotationFollowUpScheduler } from '../../quotations/application/quotation-follow-up.scheduler';
import { PushNotificationProcessor } from '../../notifications/application/push.processor';
import { FcmGateway } from '../../notifications/application/fcm.gateway';
import { PinoLogger } from '../../../common/logging/pino-logger';
import { CustomerSyncService } from '../../billing/application/customer-sync.service';
import { InvoiceSyncService } from '../../billing/application/invoice-sync.service';
import { PaymentStatusService } from '../../billing/application/payment-status.service';
import { LocalFileStore } from '../../site-visits/infrastructure/local-file-store';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('processors, schedulers, FCM, billing sync, files', () => {
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger;

  it('runs follow-up and quotation processors and schedulers', async () => {
    const engine = {
      tick: jest.fn().mockResolvedValue({ tenants: 1, notified: 0 }),
    };
    const followProcessor = new FollowUpEngineProcessor(engine as unknown as FollowUpEngineService, logger);
    await expect(followProcessor.process({} as never)).resolves.toEqual({ tenants: 1, notified: 0 });

    const quoteEngine = { tick: jest.fn().mockResolvedValue({ tenants: 2, notified: 1 }) };
    const quoteProcessor = new QuotationFollowUpProcessor(quoteEngine as never, logger);
    await expect(quoteProcessor.process({} as never)).resolves.toEqual({ tenants: 2, notified: 1 });

    const queue = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined) };
    await new FollowUpEngineScheduler(queue as never).onModuleInit();
    await new QuotationFollowUpScheduler(queue as never).onModuleInit();
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
  });

  it('skips push dispatch when FCM is not configured', async () => {
    const prisma = createPrismaMock();
    const fcm = new FcmGateway(configStub() as never, logger);
    expect(fcm.isConfigured).toBe(false);
    await expect(fcm.send({ tokens: ['a'], title: 't', body: 'b', eventType: 'lead.assigned' })).resolves.toEqual({
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
    });
    await fcm.onModuleDestroy();

    const processor = new PushNotificationProcessor(prisma as never, fcm, logger);
    await expect(
      processor.process({
        data: {
          tenantId: actor().tenantId,
          userId: actor().userId,
          eventType: 'lead.assigned',
          title: 'Assigned',
          body: 'LD-1',
          resourceType: 'lead',
          resourceId: 'lead-1',
          notificationId: null,
        },
      } as never),
    ).resolves.toEqual({ sent: 0, failed: 0 });
  });

  it('syncs billing customers, invoices, and payments when records are missing', async () => {
    const prisma = createPrismaMock();
    const gateway = {
      upsertCustomer: jest.fn(),
      upsertInvoice: jest.fn(),
      fetchPayments: jest.fn(),
    };
    const timeline = { record: jest.fn() };
    const customers = new CustomerSyncService(prisma as never, gateway as never, timeline as never);
    await expect(customers.syncLead(actor(), 'lead-1')).rejects.toMatchObject({ code: ErrorCodes.NOT_FOUND });

    const invoices = new InvoiceSyncService(
      prisma as never,
      gateway as never,
      customers,
      timeline as never,
    );
    await expect(invoices.syncQuotation(actor(), 'q-1')).rejects.toMatchObject({ code: ErrorCodes.NOT_FOUND });

    const payments = new PaymentStatusService(
      prisma as never,
      gateway as never,
      invoices,
      timeline as never,
    );
    await expect(payments.refreshInvoice(actor(), 'inv-1')).rejects.toMatchObject({ code: ErrorCodes.NOT_FOUND });
  });

  it('stores and removes local files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'intra-files-'));
    const store = new LocalFileStore(configStub({ storageRoot: root }) as never);
    const saved = await store.save({
      tenantId: 't1',
      resourceType: 'site_visit',
      resourceId: 'v1',
      extension: 'jpg',
      bytes: Buffer.from('photo'),
    });
    expect(readFileSync(store.resolve(saved.storageKey)).toString()).toBe('photo');
    await store.remove(saved.storageKey);
    await store.remove('missing.bin');
    rmSync(root, { recursive: true, force: true });
  });
});
