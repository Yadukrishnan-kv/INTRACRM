import { INestApplication, Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Public } from '../../src/common/auth/public.decorator';
import { SkipRateLimit } from '../../src/common/security/skip-rate-limit.decorator';

@Controller('health')
@Public()
@SkipRateLimit()
class LiveController {
  @Get('live')
  live() {
    return { status: 'ok' };
  }
}

describe('Health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LiveController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns live status without a tenant header', async () => {
    const response = await request(app.getHttpServer()).get('/health/live');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
