import { requestContextStorage } from '../common/http/request-context';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const service = new PrismaService();

  it('returns the raw client when no tenant is in context', () => {
    expect(service.withTenant()).toBe(service);
  });

  it('extends queries with tenantId when context is set', async () => {
    const spy = jest.spyOn(service, '$extends');
    requestContextStorage.run(
      { requestId: 'r', path: '/', method: 'GET', tenantId: 'tenant-1' },
      () => {
        service.withTenant();
      },
    );
    expect(spy).toHaveBeenCalled();
    const extension = spy.mock.calls[0]?.[0] as {
      query: { $allModels: Record<string, (args: { args: { where?: object }; query: jest.Mock }) => unknown> };
    };
    const query = jest.fn(async (args: unknown) => args);
    const findMany = extension.query.$allModels.findMany;
    await findMany({ args: { where: { id: '1' } }, query });
    expect(query).toHaveBeenCalledWith({ where: { id: '1', tenantId: 'tenant-1' } });
    await extension.query.$allModels.findFirst({ args: {}, query });
    expect(query).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
    await extension.query.$allModels.findUnique({ args: { where: { id: '1' } }, query });
    await extension.query.$allModels.update({ args: { where: { id: '1' } }, query });
    await extension.query.$allModels.updateMany({ args: { where: { id: '1' } }, query });
    await extension.query.$allModels.deleteMany({ args: { where: { id: '1' } }, query });
    spy.mockRestore();
  });
});
