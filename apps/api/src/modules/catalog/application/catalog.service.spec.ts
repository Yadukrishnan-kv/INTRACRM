import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { actor } from '../../../testing/fixtures';
import { createPrismaMock } from '../../../testing/prisma-mock';
import { namedRow } from '../../../testing/rows';
import { CatalogService } from './catalog.service';
import { CommsService } from '../../comms/application/comms.service';
import { SyncService } from '../../sync/application/sync.service';
import { configStub } from '../../../testing/config-stub';
import { CommsGateway } from '../../comms/application/comms.gateway';
import { PinoLogger } from '../../../common/logging/pino-logger';

describe('CatalogService', () => {
  const prisma = createPrismaMock();
  const defaults = { ensureDefaults: jest.fn().mockResolvedValue({ pipeline: { id: 'p1' }, firstStage: { id: 's1' } }) };
  const service = new CatalogService(prisma as never, defaults as never);
  const now = new Date();

  it('requires a tenant and returns kind counts', async () => {
    await expect(service.overview({ userId: 'u', sessionId: 's' })).rejects.toMatchObject({
      code: ErrorCodes.TENANT_REQUIRED,
    });
    (prisma.product.count as jest.Mock).mockResolvedValue(2);
    (prisma.productCategory.count as jest.Mock).mockResolvedValue(1);
    (prisma.leadSource.count as jest.Mock).mockResolvedValue(3);
    (prisma.pipelineStage.count as jest.Mock).mockResolvedValue(8);
    (prisma.leadQualityOption.count as jest.Mock).mockResolvedValue(4);
    (prisma.warrantyPeriod.count as jest.Mock).mockResolvedValue(2);
    (prisma.taxRate.count as jest.Mock).mockResolvedValue(8);
    const result = await service.overview(actor());
    expect(result.kinds.length).toBeGreaterThan(0);
    expect(result.kinds.find((row) => row.code === 'products')?.count).toBe(2);
    expect(result.kinds.find((row) => row.code === 'taxes')?.count).toBe(8);
  });

  it('lists, creates, updates, and deletes named catalog values', async () => {
    const row = namedRow();
    (prisma.leadSource.findMany as jest.Mock).mockResolvedValue([row]);
    (prisma.leadSource.findFirst as jest.Mock).mockResolvedValueOnce(null).mockResolvedValue(row);
    (prisma.leadSource.create as jest.Mock).mockResolvedValue(row);
    (prisma.leadSource.update as jest.Mock).mockResolvedValue({ ...row, name: 'Website' });
    await expect(service.listSources(actor())).resolves.toEqual([
      expect.objectContaining({ code: 'web', name: 'Web' }),
    ]);
    await expect(service.createSource(actor(), { code: 'web', name: 'Web' })).resolves.toMatchObject({
      code: 'web',
    });
    await expect(service.updateSource(actor(), row.id, { name: 'Website' })).resolves.toMatchObject({
      name: 'Website',
    });
    (prisma.leadSource.findFirst as jest.Mock).mockResolvedValueOnce(row).mockResolvedValue(null);
    (prisma.leadSource.update as jest.Mock).mockResolvedValue({ ...row, code: 'website', name: 'Website' });
    await expect(service.updateSource(actor(), row.id, { code: 'website', name: 'Website' })).resolves.toMatchObject({
      code: 'website',
    });
    (prisma.leadSource.findFirst as jest.Mock).mockResolvedValue(row);
    (prisma.lead.count as jest.Mock).mockResolvedValue(0);
    await expect(service.deleteSource(actor(), row.id)).resolves.toEqual({ deleted: true });
    await expect(service.createSource(actor(), { code: '1bad', name: 'X' })).rejects.toMatchObject({
      code: ErrorCodes.VALIDATION_ERROR,
    });
  });

  it('returns lookups and manages products, categories, periods, and statuses', async () => {
    (prisma.leadSource.findMany as jest.Mock).mockResolvedValue([namedRow()]);
    (prisma.leadQualityOption.findMany as jest.Mock).mockResolvedValue([namedRow({ code: 'hot', name: 'Hot' })]);
    (prisma.productCategory.findMany as jest.Mock).mockResolvedValue([
      { ...namedRow({ code: 'doors', name: 'Doors' }), parent: null },
    ]);
    (prisma.warrantyPeriod.findMany as jest.Mock).mockResolvedValue([
      { ...namedRow({ code: 'y1', name: '1 year' }), months: 12 },
    ]);
    (prisma.product.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'prod-1',
        sku: 'SKU-1',
        name: 'Door',
        description: null,
        categoryId: null,
        warrantyPeriodId: null,
        unitPriceMinor: 1000n,
        currency: 'INR',
        warrantyMonths: 12,
        isActive: true,
        version: 1,
        updatedAt: now,
        category: null,
        warrantyPeriod: null,
      },
    ]);
    (prisma.taxRate.findMany as jest.Mock).mockResolvedValue([
      { ...namedRow({ code: 'gst_18', name: 'GST 18%' }), rateBps: 1800 },
    ]);
    (prisma.pipelineStage.findMany as jest.Mock).mockResolvedValue([
      {
        id: 's1',
        pipelineId: 'p1',
        code: 'new',
        name: 'New',
        sortOrder: 1,
        winProbabilityBps: 0,
        isOpen: true,
        isWon: false,
        isLost: false,
        version: 1,
        updatedAt: now,
      },
    ]);
    const lookups = await service.lookups(actor());
    expect(lookups.products[0]?.sku).toBe('SKU-1');
    expect(lookups.leadStatuses[0]?.code).toBe('new');
    expect(lookups.taxes[0]?.ratePercent).toBe(18);

    (prisma.productCategory.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.productCategory.create as jest.Mock).mockResolvedValue({
      ...namedRow({ code: 'windows', name: 'Windows' }),
      parent: null,
    });
    await expect(service.createCategory(actor(), { code: 'windows', name: 'Windows' })).resolves.toMatchObject({
      code: 'windows',
    });
    await expect(service.listCategories(actor(), true)).resolves.toHaveLength(1);

    (prisma.warrantyPeriod.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.warrantyPeriod.create as jest.Mock).mockResolvedValue({
      ...namedRow({ code: 'y2', name: '2 years' }),
      months: 24,
    });
    await expect(
      service.createWarrantyPeriod(actor(), { code: 'y2', name: '2 years', months: 24 }),
    ).resolves.toMatchObject({ months: 24 });

    (prisma.taxRate.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.taxRate.create as jest.Mock).mockResolvedValue({
      ...namedRow({ code: 'gst_18', name: 'GST 18%' }),
      rateBps: 1800,
    });
    await expect(
      service.createTax(actor(), { code: 'gst_18', name: 'GST 18%', ratePercent: 18 }),
    ).resolves.toMatchObject({ ratePercent: 18, rateBps: 1800 });
    (prisma.taxRate.findMany as jest.Mock).mockResolvedValue([
      { ...namedRow({ code: 'gst_18', name: 'GST 18%' }), rateBps: 1800 },
    ]);
    await expect(service.listTaxes(actor(), true)).resolves.toHaveLength(1);
    (prisma.taxRate.findFirst as jest.Mock).mockResolvedValue({
      ...namedRow({ code: 'gst_18', name: 'GST 18%' }),
      rateBps: 1800,
    });
    (prisma.taxRate.update as jest.Mock).mockResolvedValue({
      ...namedRow({ code: 'gst_18', name: 'GST 18%' }),
      rateBps: 1800,
    });
    await expect(
      service.saveTaxes(actor(), {
        items: [{ id: 'named-1', name: 'GST 18%', ratePercent: 18 }],
      }),
    ).resolves.toHaveLength(1);

    (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.product.create as jest.Mock).mockResolvedValue({
      id: 'prod-2',
      sku: 'sku_2',
      name: 'Window',
      description: null,
      categoryId: null,
      warrantyPeriodId: null,
      unitPriceMinor: null,
      currency: 'INR',
      warrantyMonths: null,
      isActive: true,
      version: 1,
      updatedAt: now,
      category: null,
      warrantyPeriod: null,
    });
    await expect(service.createProduct(actor(), { sku: 'sku_2', name: 'Window' })).resolves.toMatchObject({
      sku: 'sku_2',
    });
    await expect(service.listProducts(actor())).resolves.toHaveLength(1);

    (prisma.pipelineStage.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.pipelineStage.create as jest.Mock).mockResolvedValue({
      id: 's2',
      pipelineId: 'p1',
      code: 'qualified',
      name: 'Qualified',
      sortOrder: 2,
      winProbabilityBps: 2500,
      isOpen: true,
      isWon: false,
      isLost: false,
      version: 1,
      updatedAt: now,
    });
    await expect(
      service.createLeadStatus(actor(), {
        code: 'qualified',
        name: 'Qualified',
        isOpen: true,
        isWon: false,
        isLost: false,
      }),
    ).resolves.toMatchObject({ code: 'qualified' });
    await expect(service.listLeadStatuses(actor())).resolves.toHaveLength(1);

    (prisma.warrantyPeriod.findFirst as jest.Mock)
      .mockResolvedValueOnce({
        ...namedRow({ code: 'y2', name: '2 years' }),
        months: 24,
      })
      .mockResolvedValue(null);
    (prisma.warrantyPeriod.update as jest.Mock).mockResolvedValue({
      ...namedRow({ code: 'y2', name: 'Two years' }),
      months: 36,
    });
    await expect(
      service.updateWarrantyPeriod(actor(), 'named-1', { name: 'Two years', months: 36 }),
    ).resolves.toMatchObject({ months: 36 });
    (prisma.warrantyPeriod.findFirst as jest.Mock).mockResolvedValue({
      ...namedRow({ code: 'y2', name: 'Two years' }),
      months: 36,
    });
    (prisma.product.count as jest.Mock).mockResolvedValue(0);
    await expect(service.deleteWarrantyPeriod(actor(), 'named-1')).resolves.toEqual({ deleted: true });

    (prisma.productCategory.findFirst as jest.Mock).mockResolvedValue({
      ...namedRow({ code: 'windows', name: 'Windows' }),
      parentId: null,
      parent: null,
    });
    (prisma.productCategory.update as jest.Mock).mockResolvedValue({
      ...namedRow({ code: 'windows', name: 'Window kits' }),
      parentId: null,
      parent: null,
    });
    await expect(
      service.updateCategory(actor(), 'named-1', { name: 'Window kits' }),
    ).resolves.toMatchObject({ name: 'Window kits' });
    (prisma.product.count as jest.Mock).mockResolvedValue(0);
    (prisma.productCategory.count as jest.Mock).mockResolvedValue(0);
    await expect(service.deleteCategory(actor(), 'named-1')).resolves.toEqual({ deleted: true });

    (prisma.pipelineStage.findFirst as jest.Mock).mockResolvedValue({
      id: 's2',
      pipelineId: 'p1',
      code: 'qualified',
      name: 'Qualified',
      sortOrder: 2,
      winProbabilityBps: 2500,
      isOpen: true,
      isWon: false,
      isLost: false,
      version: 1,
      updatedAt: now,
    });
    (prisma.pipelineStage.update as jest.Mock).mockResolvedValue({
      id: 's2',
      pipelineId: 'p1',
      code: 'qualified',
      name: 'Hot qualified',
      sortOrder: 2,
      winProbabilityBps: 4000,
      isOpen: true,
      isWon: false,
      isLost: false,
      version: 2,
      updatedAt: now,
    });
    await expect(
      service.updateLeadStatus(actor(), 's2', { name: 'Hot qualified', winProbabilityBps: 4000 }),
    ).resolves.toMatchObject({ name: 'Hot qualified' });
    (prisma.lead.count as jest.Mock).mockResolvedValue(0);
    (prisma.pipelineStage.count as jest.Mock).mockResolvedValue(1);
    await expect(service.deleteLeadStatus(actor(), 's2')).resolves.toEqual({ deleted: true });
  });

  it('rejects duplicates, in-use deletes, cycles, and missing rows', async () => {
    (prisma.leadSource.findFirst as jest.Mock).mockResolvedValue(namedRow());
    await expect(service.createSource(actor(), { code: 'web', name: 'Web' })).rejects.toMatchObject({
      code: ErrorCodes.CONFLICT,
    });

    (prisma.lead.count as jest.Mock).mockResolvedValue(1);
    await expect(service.deleteSource(actor(), 'named-1')).rejects.toMatchObject({
      code: ErrorCodes.CONFLICT,
    });

    (prisma.leadQualityOption.findFirst as jest.Mock)
      .mockResolvedValueOnce(namedRow({ code: 'hot', name: 'Hot' }))
      .mockResolvedValue(null);
    (prisma.leadQualityOption.update as jest.Mock).mockResolvedValue(
      namedRow({ code: 'warm', name: 'Warm' }),
    );
    await expect(
      service.updateQuality(actor(), 'named-1', { code: 'warm', name: 'Warm' }),
    ).resolves.toMatchObject({ code: 'warm' });
    expect(prisma.lead.updateMany).toHaveBeenCalled();

    (prisma.leadQualityOption.findFirst as jest.Mock).mockResolvedValue(namedRow({ code: 'warm' }));
    (prisma.lead.count as jest.Mock).mockResolvedValue(2);
    await expect(service.deleteQuality(actor(), 'named-1')).rejects.toMatchObject({
      code: ErrorCodes.CONFLICT,
    });

    (prisma.product.findFirst as jest.Mock).mockResolvedValue(namedRow({ sku: 'SKU-1' }));
    await expect(service.createProduct(actor(), { sku: 'SKU-1', name: 'Door' })).rejects.toMatchObject({
      code: ErrorCodes.CONFLICT,
    });

    (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.updateProduct(actor(), 'missing', { name: 'X' })).rejects.toMatchObject({
      code: ErrorCodes.NOT_FOUND,
    });

    (prisma.product.findFirst as jest.Mock)
      .mockResolvedValueOnce({
        id: 'prod-1',
        sku: 'SKU-1',
        name: 'Door',
        description: null,
        categoryId: null,
        warrantyPeriodId: null,
        unitPriceMinor: 1000n,
        currency: 'INR',
        warrantyMonths: 12,
        isActive: true,
        version: 1,
        updatedAt: now,
      })
      .mockResolvedValueOnce(null);
    (prisma.productCategory.findFirst as jest.Mock).mockResolvedValue({
      ...namedRow({ id: 'cat-1', name: 'Doors' }),
      parentId: null,
      parent: { name: 'Root' },
    });
    (prisma.warrantyPeriod.findFirst as jest.Mock).mockResolvedValue({
      ...namedRow({ id: 'per-1', name: '1 year' }),
      months: 12,
    });
    (prisma.product.update as jest.Mock).mockResolvedValue({
      id: 'prod-1',
      sku: 'sku_new',
      name: 'Door',
      description: 'Steel',
      categoryId: 'cat-1',
      warrantyPeriodId: 'per-1',
      unitPriceMinor: null,
      currency: 'INR',
      warrantyMonths: 12,
      isActive: true,
      version: 2,
      updatedAt: now,
      category: { name: 'Doors' },
      warrantyPeriod: { name: '1 year' },
    });
    await expect(
      service.updateProduct(actor(), 'prod-1', {
        sku: 'sku_new',
        categoryId: 'cat-1',
        warrantyPeriodId: 'per-1',
        unitPriceMinor: null,
        description: 'Steel',
      }),
    ).resolves.toMatchObject({ sku: 'sku_new', categoryName: 'Doors' });

    (prisma.product.findFirst as jest.Mock).mockResolvedValue({
      id: 'prod-1',
      sku: 'SKU-1',
      name: 'Door',
      description: null,
      categoryId: null,
      warrantyPeriodId: null,
      unitPriceMinor: 1000n,
      currency: 'INR',
      warrantyMonths: 12,
      isActive: true,
      version: 1,
      updatedAt: now,
    });
    (prisma.quotationItem.count as jest.Mock).mockResolvedValue(1);
    (prisma.warrantyCardItem.count as jest.Mock).mockResolvedValue(0);
    (prisma.target.count as jest.Mock).mockResolvedValue(0);
    await expect(service.deleteProduct(actor(), 'prod-1')).rejects.toMatchObject({
      code: ErrorCodes.CONFLICT,
    });

    (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.productCategory.findFirst as jest.Mock).mockResolvedValue({
      ...namedRow({ id: 'cat-1' }),
      parentId: null,
      parent: null,
    });
    (prisma.warrantyPeriod.findFirst as jest.Mock).mockResolvedValue({
      ...namedRow({ id: 'per-1' }),
      months: 24,
    });
    (prisma.product.create as jest.Mock).mockResolvedValue({
      id: 'prod-3',
      sku: 'sku_3',
      name: 'Panel',
      description: null,
      categoryId: 'cat-1',
      warrantyPeriodId: 'per-1',
      unitPriceMinor: 100n,
      currency: 'INR',
      warrantyMonths: 24,
      isActive: true,
      version: 1,
      updatedAt: now,
      category: { name: 'Doors' },
      warrantyPeriod: { name: '1 year' },
    });
    await expect(
      service.createProduct(actor(), {
        sku: 'sku_3',
        name: 'Panel',
        categoryId: 'cat-1',
        warrantyPeriodId: 'per-1',
        unitPriceMinor: 100,
        description: '  ',
      }),
    ).resolves.toMatchObject({ sku: 'sku_3' });

    (prisma.productCategory.findFirst as jest.Mock).mockResolvedValue({
      ...namedRow({ id: 'named-1' }),
      parentId: null,
      parent: null,
    });
    await expect(
      service.updateCategory(actor(), 'named-1', { parentId: 'named-1' }),
    ).rejects.toMatchObject({ code: ErrorCodes.VALIDATION_ERROR });

    (prisma.productCategory.findFirst as jest.Mock)
      .mockResolvedValueOnce({
        ...namedRow({ id: 'cat-1' }),
        parentId: null,
        parent: null,
      })
      .mockResolvedValueOnce({
        ...namedRow({ id: 'cat-2' }),
        parentId: 'cat-1',
        parent: null,
      })
      .mockResolvedValueOnce({ parentId: 'cat-1' });
    await expect(
      service.updateCategory(actor(), 'cat-1', { parentId: 'cat-2' }),
    ).rejects.toMatchObject({ code: ErrorCodes.VALIDATION_ERROR });

    (prisma.productCategory.findFirst as jest.Mock).mockResolvedValue({
      ...namedRow({ id: 'named-1' }),
      parentId: null,
      parent: null,
    });
    (prisma.product.count as jest.Mock).mockResolvedValue(1);
    (prisma.productCategory.count as jest.Mock).mockResolvedValue(0);
    await expect(service.deleteCategory(actor(), 'named-1')).rejects.toMatchObject({
      code: ErrorCodes.CONFLICT,
    });

    (prisma.warrantyPeriod.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(namedRow({ months: 12 }));
    await expect(
      service.createWarrantyPeriod(actor(), { code: 'y1', name: '1 year', months: 12 }),
    ).rejects.toMatchObject({ code: ErrorCodes.CONFLICT });

    (prisma.pipelineStage.findFirst as jest.Mock).mockResolvedValue({
      id: 's1',
      pipelineId: 'p1',
      code: 'new',
      name: 'New',
    });
    await expect(
      service.createLeadStatus(actor(), {
        code: 'new',
        name: 'New',
        isOpen: true,
        isWon: false,
        isLost: false,
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.CONFLICT });

    (prisma.pipelineStage.findFirst as jest.Mock).mockResolvedValue({
      id: 's2',
      pipelineId: 'p1',
      code: 'qualified',
      name: 'Qualified',
      sortOrder: 2,
      winProbabilityBps: 2500,
      isOpen: true,
      isWon: false,
      isLost: false,
      version: 1,
      updatedAt: now,
    });
    (prisma.pipelineStage.count as jest.Mock).mockResolvedValue(0);
    await expect(
      service.updateLeadStatus(actor(), 's2', { isOpen: false }),
    ).rejects.toMatchObject({ code: ErrorCodes.CONFLICT });

    (prisma.pipelineStage.findFirst as jest.Mock).mockResolvedValue({
      id: 's2',
      pipelineId: 'p1',
      code: 'qualified',
      name: 'Qualified',
      sortOrder: 2,
      winProbabilityBps: 2500,
      isOpen: true,
      isWon: false,
      isLost: false,
      version: 1,
      updatedAt: now,
    });
    (prisma.lead.count as jest.Mock).mockResolvedValue(3);
    await expect(service.deleteLeadStatus(actor(), 's2')).rejects.toMatchObject({
      code: ErrorCodes.CONFLICT,
    });

    await expect(
      service.createLeadStatus(actor(), {
        code: 'won_lost',
        name: 'Bad',
        isOpen: false,
        isWon: true,
        isLost: true,
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.VALIDATION_ERROR });

    await expect(service.listProducts(actor(), true)).resolves.toEqual(expect.any(Array));
  });
});

describe('CommsService', () => {
  it('exposes gateway capabilities and requires a tenant for templates', async () => {
    const gateway = { capabilities: jest.fn().mockReturnValue({ call: { mode: 'device' } }) };
    const prisma = createPrismaMock();
    const service = new CommsService(prisma as never, gateway as never);
    expect(service.capabilities()).toEqual({ call: { mode: 'device' } });
    await expect(service.listTemplates({ userId: 'u', sessionId: 's' })).rejects.toMatchObject({
      code: ErrorCodes.TENANT_REQUIRED,
    });
  });
});

describe('CommsGateway', () => {
  it('defaults to device URIs', async () => {
    const gateway = new CommsGateway(configStub() as never, { warn: jest.fn() } as unknown as PinoLogger);
    expect(gateway.capabilities().call.mode).toBe('device');
    await expect(gateway.startCall({ customerE164: '+919999999999' })).resolves.toMatchObject({
      mode: 'device',
      provider: 'device',
    });
  });

  it('uses Twilio and Meta when those providers are configured', async () => {
    const gateway = new CommsGateway(
      configStub({
        comms: {
          callProvider: 'twilio',
          smsProvider: 'twilio',
          whatsappProvider: 'meta',
          twilio: { accountSid: 'ACxxxx', authToken: 'token', fromNumber: '+911111111111' },
          metaWhatsapp: { token: 'meta-token', phoneNumberId: '123' },
        },
      }) as never,
      { warn: jest.fn() } as unknown as PinoLogger,
    );
    expect(gateway.capabilities().call.mode).toBe('bridged');
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ sid: 'CA123', messages: [{ id: 'wamid.1' }] }),
    } as Response);
    await expect(
      gateway.startCall({ customerE164: '+919999999999', agentE164: '+918888888888' }),
    ).resolves.toMatchObject({ provider: 'twilio', mode: 'sent' });
    await expect(gateway.sendSms({ toE164: '+919999999999', body: 'Hi' })).resolves.toMatchObject({
      provider: 'twilio',
      mode: 'sent',
    });
    await expect(gateway.sendWhatsapp({ toE164: '+919999999999', body: 'Hi' })).resolves.toMatchObject({
      provider: 'meta',
      mode: 'sent',
    });
    fetchSpy.mockRestore();
  });
});

describe('SyncService', () => {
  it('requires a tenant and returns an empty delta without permissions', async () => {
    const prisma = createPrismaMock();
    const service = new SyncService(prisma as never);
    await expect(service.pull({ userId: 'u', sessionId: 's' }, {})).rejects.toMatchObject({
      code: ErrorCodes.TENANT_REQUIRED,
    });
    const result = await service.pull(actor({ permissions: [] }), {});
    expect(result.leads).toEqual([]);
    expect(result.notes).toEqual([]);
    expect(result.followUps).toEqual([]);
  });
});
