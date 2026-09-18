import { requestContextStorage } from '../../src/common/http/request-context';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TENANT_A, TENANT_B } from '../../src/testing/fixtures';
import { LeadsService } from '../../src/modules/crm-leads/application/leads.service';
import { createPrismaMock } from '../../src/testing/prisma-mock';
import { actor } from '../../src/testing/fixtures';
import { ErrorCodes } from '../../src/common/exceptions/error-codes';

describe('integration: tenant scoping', () => {
  it('injects tenantId into Prisma findMany args', async () => {
    const prisma = new PrismaService();
    const spy = jest.spyOn(prisma, '$extends');
    requestContextStorage.run(
      { requestId: 'r', path: '/leads', method: 'GET', tenantId: TENANT_A },
      () => {
        prisma.withTenant();
      },
    );
    const extension = spy.mock.calls[0]?.[0] as {
      query: { $allModels: { findMany: (input: { args: object; query: (args: object) => object }) => object } };
    };
    const query = jest.fn((args: object) => args);
    const scoped = await extension.query.$allModels.findMany({
      args: { where: { deletedAt: null } },
      query,
    });
    expect(scoped).toEqual({ where: { deletedAt: null, tenantId: TENANT_A } });
    spy.mockRestore();
  });

  it('keeps tenant B from reading tenant A leads', async () => {
    const prisma = createPrismaMock();
    (prisma.lead.findFirst as jest.Mock).mockImplementation(async ({ where }: { where: { tenantId: string } }) => {
      if (where.tenantId !== TENANT_A) {
        return null;
      }
      return { id: 'lead-a', tenantId: TENANT_A };
    });
    const service = new LeadsService(
      prisma as never,
      { ensureDefaults: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.get(actor({ tenantId: TENANT_B }), 'lead-a')).rejects.toMatchObject({
      code: ErrorCodes.NOT_FOUND,
    });
  });

  it('scopes findFirst and updateMany, but leaves findUnique keys unchanged', async () => {
    const prisma = new PrismaService();
    const spy = jest.spyOn(prisma, '$extends');
    requestContextStorage.run(
      { requestId: 'r', path: '/leads', method: 'PATCH', tenantId: TENANT_B },
      () => {
        prisma.withTenant();
      },
    );
    const extension = spy.mock.calls[0]?.[0] as {
      query: {
        $allModels: {
          findFirst: (input: { args: object; query: (args: object) => object }) => Promise<object>;
          findUnique: (input: { args: object; query: (args: object) => object }) => Promise<object>;
          updateMany: (input: { args: object; query: (args: object) => object }) => Promise<object>;
        };
      };
    };
    const query = jest.fn((args: object) => args);
    await expect(
      extension.query.$allModels.findFirst({ args: {}, query }),
    ).resolves.toEqual({ where: { tenantId: TENANT_B } });
    await expect(
      extension.query.$allModels.updateMany({
        args: { where: { id: 'lead-a' }, data: { title: 'x' } },
        query,
      }),
    ).resolves.toEqual({
      where: { id: 'lead-a', tenantId: TENANT_B },
      data: { title: 'x' },
    });
    await expect(
      extension.query.$allModels.findUnique({ args: { where: { id: 'lead-a' } }, query }),
    ).resolves.toEqual({ where: { id: 'lead-a' } });
    spy.mockRestore();
  });
});
