import { RedisService } from './redis.service';

jest.mock('ioredis', () => {
  return class RedisMock {
    quit = jest.fn().mockResolvedValue('OK');
    ping = jest.fn().mockResolvedValue('PONG');
    constructor(public readonly options: unknown) {}
  };
});

describe('RedisService', () => {
  it('connects with optional password and TLS', async () => {
    const config = {
      get: () => ({ host: 'localhost', port: 6379, db: 0, password: 'secret', tls: true }),
    };
    const service = new RedisService(config as never);
    expect(service.options).toMatchObject({ password: 'secret', tls: {} });
    await service.onModuleDestroy();
  });

  it('omits password and TLS when unset', async () => {
    const service = new RedisService({
      get: () => ({ host: 'localhost', port: 6379, db: 0, password: '', tls: false }),
    } as never);
    expect(service.options).not.toHaveProperty('password');
    expect(service.options).not.toHaveProperty('tls');
    await service.onModuleDestroy();
  });
});
