type ModelMock = {
  findFirst: jest.Mock;
  findFirstOrThrow: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  deleteMany: jest.Mock;
  createMany: jest.Mock;
  count: jest.Mock;
  upsert: jest.Mock;
  groupBy: jest.Mock;
  aggregate: jest.Mock;
};

function model(): ModelMock {
  return {
    findFirst: jest.fn().mockResolvedValue(null),
    findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'generated-id' }),
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(async (args: { data?: Record<string, unknown> } = {}) => ({
      id: 'generated-id',
      version: 1,
      updatedAt: new Date(),
      createdAt: new Date(),
      ...(args.data ?? {}),
    })),
    update: jest.fn().mockImplementation(async (args: { data?: Record<string, unknown> } = {}) => ({
      id: 'generated-id',
      version: 2,
      updatedAt: new Date(),
      ...(args.data ?? {}),
    })),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(0),
    upsert: jest.fn().mockResolvedValue({ id: 'generated-id' }),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { totalMinor: 0 }, _avg: {} }),
  };
}

export type PrismaMock = {
  [key: string]: ModelMock | jest.Mock;
  $transaction: jest.Mock;
  $connect: jest.Mock;
  $disconnect: jest.Mock;
  $extends: jest.Mock;
  $queryRaw: jest.Mock;
};

export function createPrismaMock(): PrismaMock {
  const models: Record<string, ModelMock> = {};
  const client = new Proxy(
    {
      $transaction: jest.fn(),
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      $extends: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ number: 'LD-0001' }]),
    } as PrismaMock,
    {
      get(target, prop) {
        if (typeof prop === 'symbol') {
          return undefined;
        }
        if (prop in target) {
          return target[prop];
        }
        if (!models[prop]) {
          models[prop] = model();
        }
        return models[prop];
      },
    },
  );
  client.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: PrismaMock) => unknown)(client);
    }
    return Promise.all(arg as unknown[]);
  });
  client.$extends.mockReturnValue(client);
  return client;
}
