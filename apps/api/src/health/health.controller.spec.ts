import { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const health = { check: jest.fn(async (indicators: Array<() => unknown>) => {
    const results = [];
    for (const indicator of indicators) {
      results.push(await indicator());
    }
    return { status: 'ok', info: Object.assign({}, ...results) };
  }) };
  const prismaHealth = { pingCheck: jest.fn().mockResolvedValue({ postgres: { status: 'up' } }) };
  const redis = { ping: jest.fn().mockResolvedValue('PONG') };
  const controller = new HealthController(
    health as unknown as HealthCheckService,
    prismaHealth as unknown as PrismaHealthIndicator,
    {} as never,
    redis as never,
  );

  it('returns live without dependencies', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('checks postgres and redis on ready and default check', async () => {
    await expect(controller.ready()).resolves.toMatchObject({ status: 'ok' });
    await expect(controller.check()).resolves.toMatchObject({ status: 'ok' });
    expect(prismaHealth.pingCheck).toHaveBeenCalled();
    expect(redis.ping).toHaveBeenCalled();
  });

  it('marks redis down when ping is not PONG', async () => {
    redis.ping.mockResolvedValueOnce('NOPE');
    const result = await controller.ready();
    expect(result.info).toMatchObject({ redis: { status: 'down' } });
  });
});
