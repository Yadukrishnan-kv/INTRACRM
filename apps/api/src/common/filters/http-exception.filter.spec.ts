import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { ErrorCodes } from '../exceptions/error-codes';
import { PinoLogger } from '../logging/pino-logger';
import { AllExceptionsFilter } from './http-exception.filter';
import { createRequest, createResponse } from '../../testing/http-context';

describe('AllExceptionsFilter', () => {
  const logger = {
    error: jest.fn(),
    warn: jest.fn(),
  };
  const filter = new AllExceptionsFilter(logger as unknown as PinoLogger);

  function hostFor(path = '/api/v1/leads') {
    const request = createRequest({ originalUrl: path, path });
    const response = createResponse();
    return {
      request,
      response,
      host: {
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => response,
        }),
      },
    };
  }

  it('maps AppException including retry-after', () => {
    const { host, response } = hostFor();
    filter.catch(
      new AppException(HttpStatus.TOO_MANY_REQUESTS, 'Slow down', {
        code: ErrorCodes.RATE_LIMITED,
        retryAfterSeconds: 12,
      }),
      host as never,
    );
    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.headers['retry-after']).toBe('12');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('maps HttpException validation arrays', () => {
    const { host, response } = hostFor();
    filter.catch(
      new HttpException({ message: ['title must be a string'] }, HttpStatus.BAD_REQUEST),
      host as never,
    );
    expect(response.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    const body = response.json.mock.calls[0]?.[0] as { error: { code: string } };
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
  });

  it('maps Prisma unique and not-found errors', () => {
    const unique = hostFor();
    filter.catch(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '6',
      }),
      unique.host as never,
    );
    expect(unique.response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);

    const missing = hostFor();
    filter.catch(
      new Prisma.PrismaClientKnownRequestError('gone', {
        code: 'P2025',
        clientVersion: '6',
      }),
      missing.host as never,
    );
    expect(missing.response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('maps unknown errors to 500', () => {
    const { host, response } = hostFor();
    filter.catch(new Error('boom'), host as never);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(logger.error).toHaveBeenCalled();
  });

  it('maps status codes on generic HttpException', () => {
    const { host, response } = hostFor();
    filter.catch(new HttpException('nope', HttpStatus.FORBIDDEN), host as never);
    expect(response.status).toHaveBeenCalledWith(403);
  });
});
