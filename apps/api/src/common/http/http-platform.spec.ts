import { decodeCursor, encodeCursor, buildPageMeta, DEFAULT_PAGE_LIMIT } from '../pagination/cursor-page';
import { successResponse } from '../dto/api-response';
import { AppException } from '../exceptions/app.exception';
import { ErrorCodes } from '../exceptions/error-codes';
import { HttpStatus } from '@nestjs/common';
import { createValidationPipe } from '../pipes/app-validation.pipe';
import { IsString } from 'class-validator';
import { requestContextStorage, getRequestId } from './request-context';
import { RequestContextMiddleware } from './request-context.middleware';
import { HttpHeaders } from './http-headers';
import { createRequest, createResponse } from '../../testing/http-context';
import { QueueNames } from '../queue/queue.names';

describe('cursor page', () => {
  it('round-trips a cursor and builds page meta', () => {
    const encoded = encodeCursor({ id: '1', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(decodeCursor(encoded)).toEqual({
      id: '1',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(buildPageMeta({ limit: DEFAULT_PAGE_LIMIT, hasMore: false })).toEqual({
      limit: 20,
      hasMore: false,
      nextCursor: null,
      prevCursor: null,
    });
  });

  it('rejects a non-object cursor payload', () => {
    const bad = Buffer.from('"nope"', 'utf8').toString('base64url');
    expect(() => decodeCursor(bad)).toThrow('Invalid cursor');
  });
});

describe('successResponse', () => {
  it('includes paging when provided', () => {
    const body = successResponse({ ok: true }, 'req-1', {
      limit: 10,
      hasMore: true,
      nextCursor: 'n',
      prevCursor: null,
    });
    expect(body.meta.requestId).toBe('req-1');
    expect(body.meta.page?.nextCursor).toBe('n');
  });
});

describe('AppException', () => {
  it('defaults the error code from the status', () => {
    const error = new AppException(HttpStatus.CONFLICT, 'Taken');
    expect(error.code).toBe(ErrorCodes.CONFLICT);
    expect(error.errors).toEqual([]);
  });
});

describe('createValidationPipe', () => {
  class Sample {
    @IsString()
    title!: string;
  }

  it('flattens nested validation errors', async () => {
    const pipe = createValidationPipe();
    await expect(pipe.transform({}, { type: 'body', metatype: Sample })).rejects.toBeInstanceOf(
      AppException,
    );
  });
});

describe('RequestContextMiddleware', () => {
  it('reuses an incoming request id and generates one otherwise', () => {
    const middleware = new RequestContextMiddleware();
    const response = createResponse();
    middleware.use(
      createRequest({
        originalUrl: '/api/v1/leads',
        method: 'GET',
        headers: {
          [HttpHeaders.requestId]: 'incoming-id',
          [HttpHeaders.tenantId]: 't1',
          [HttpHeaders.deviceId]: 'd1',
        },
      }),
      response,
      () => {
        expect(getRequestId()).toBe('incoming-id');
        expect(requestContextStorage.getStore()?.tenantId).toBe('t1');
      },
    );
    expect(response.headers[HttpHeaders.requestId]).toBe('incoming-id');

    middleware.use(createRequest({ originalUrl: '/x', method: 'GET' }), createResponse(), () => {
      expect(getRequestId()).toMatch(/[0-9a-f-]{36}/i);
    });
  });
});

describe('QueueNames', () => {
  it('exposes stable queue tokens', () => {
    expect(QueueNames.notifications).toBe('intra.notifications');
    expect(QueueNames.followUpEngine).toContain('follow-ups');
  });
});
