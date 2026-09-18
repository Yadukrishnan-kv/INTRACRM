import { INestApplication, Controller, Get, Post, Body } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AllExceptionsFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { createValidationPipe } from '../../src/common/pipes/app-validation.pipe';
import { PinoLogger } from '../../src/common/logging/pino-logger';
import { Public } from '../../src/common/auth/public.decorator';
import { JwtAuthGuard } from '../../src/common/auth/jwt-auth.guard';
import { TenantGuard } from '../../src/common/tenancy/tenant.guard';
import { PermissionsGuard } from '../../src/common/auth/permissions.guard';
import { RequirePermissions } from '../../src/common/auth/require-permissions.decorator';
import { TENANT_A } from '../../src/testing/fixtures';

class LoginBody {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

@Controller()
class ProbeController {
  @Public()
  @Get('health/live')
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Post('auth/login')
  login(@Body() dto: LoginBody) {
    return { email: dto.email };
  }

  @Get('leads')
  @RequirePermissions('lead:read')
  list() {
    return [{ id: '1' }];
  }
}

describe('API contract', () => {
  let app: INestApplication;
  const jwtGuard = { canActivate: jest.fn().mockResolvedValue(true) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        { provide: PinoLogger, useValue: { error: jest.fn(), warn: jest.fn() } },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
        { provide: APP_GUARD, useValue: jwtGuard },
        { provide: APP_GUARD, useClass: TenantGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns liveness without auth or tenant', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('validates login bodies', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: '' });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires X-Tenant-Id on tenant APIs', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/leads');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('TENANT_REQUIRED');
  });

  it('wraps tenant list payloads in the success envelope', async () => {
    jwtGuard.canActivate.mockImplementation(async (context: { switchToHttp: () => { getRequest: () => { user?: { permissions: string[] } } } }) => {
      const req = context.switchToHttp().getRequest();
      req.user = { permissions: ['lead:read'] };
      return true;
    });
    const response = await request(app.getHttpServer())
      .get('/api/v1/leads')
      .set('X-Tenant-Id', TENANT_A);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ id: '1' }]);
    expect(response.body.meta.requestId).toBeDefined();
  });

  it('denies lead:read when the membership has no matching permission', async () => {
    jwtGuard.canActivate.mockImplementation(async (context: { switchToHttp: () => { getRequest: () => { user?: { permissions: string[] } } } }) => {
      const req = context.switchToHttp().getRequest();
      req.user = { permissions: [] };
      return true;
    });
    const response = await request(app.getHttpServer())
      .get('/api/v1/leads')
      .set('X-Tenant-Id', TENANT_A);
    expect(response.status).toBe(403);
  });

  it('wraps a valid login body in the success envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'founder@intraleads.local', password: 'secret' });
    expect(response.status).toBe(201);
    expect(response.body.data.email).toBe('founder@intraleads.local');
    expect(response.body.meta.requestId).toBeDefined();
  });

  it('returns 404 for an unknown API route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
  });
});
