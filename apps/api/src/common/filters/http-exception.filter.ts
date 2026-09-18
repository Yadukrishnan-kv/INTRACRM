import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { AppException, FieldError } from '../exceptions/app.exception';
import { ErrorCode, ErrorCodes, ErrorTypes } from '../exceptions/error-codes';
import { getRequestId } from '../http/request-context';
import { PinoLogger } from '../logging/pino-logger';

type ErrorBody = {
  error: {
    type: string;
    title: string;
    status: number;
    code: ErrorCode;
    detail: string;
    instance: string;
    requestId: string;
    errors: FieldError[];
  };
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = getRequestId() ?? request.header('x-request-id') ?? 'unknown';
    const mapped = this.mapException(exception);

    if (mapped.status >= 500) {
      this.logger.error(mapped.detail, exception instanceof Error ? exception : undefined);
    } else {
      this.logger.warn(mapped.detail);
    }

    const body: ErrorBody = {
      error: {
        type: ErrorTypes[mapped.code],
        title: mapped.title,
        status: mapped.status,
        code: mapped.code,
        detail: mapped.detail,
        instance: request.originalUrl,
        requestId,
        errors: mapped.errors,
      },
    };

    if (mapped.retryAfterSeconds != null) {
      response.setHeader('Retry-After', String(mapped.retryAfterSeconds));
    }

    response.status(mapped.status).json(body);
  }

  private mapException(exception: unknown): {
    status: number;
    title: string;
    detail: string;
    code: ErrorCode;
    errors: FieldError[];
    retryAfterSeconds?: number;
  } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        title: this.titleFromException(exception),
        detail: this.detailFromException(exception),
        code: exception.code,
        errors: exception.errors,
        ...(exception.retryAfterSeconds != null
          ? { retryAfterSeconds: exception.retryAfterSeconds }
          : {}),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const validationErrors = this.extractValidationErrors(payload);
      const code =
        status === HttpStatus.UNPROCESSABLE_ENTITY || validationErrors.length > 0
          ? ErrorCodes.VALIDATION_ERROR
          : this.codeFromStatus(status);

      return {
        status: validationErrors.length > 0 ? HttpStatus.UNPROCESSABLE_ENTITY : status,
        title: validationErrors.length > 0 ? 'Validation failed' : exception.message,
        detail:
          validationErrors[0]?.message ??
          (typeof payload === 'string' ? payload : exception.message),
        code,
        errors: validationErrors,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          title: 'Conflict',
          detail: 'A unique constraint was violated.',
          code: ErrorCodes.CONFLICT,
          errors: [],
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          title: 'Not found',
          detail: 'The requested resource was not found.',
          code: ErrorCodes.NOT_FOUND,
          errors: [],
        };
      }
    }

    const prismaMessage =
      exception instanceof Prisma.PrismaClientUnknownRequestError ||
      exception instanceof Prisma.PrismaClientKnownRequestError
        ? exception.message
        : '';
    if (prismaMessage.includes('chk_site_visits_times')) {
      return {
        status: HttpStatus.CONFLICT,
        title: 'Conflict',
        detail: 'Check-out cannot be earlier than check-in.',
        code: ErrorCodes.CONFLICT,
        errors: [],
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: 'Internal server error',
      detail: 'An unexpected error occurred.',
      code: ErrorCodes.INTERNAL_ERROR,
      errors: [],
    };
  }

  private titleFromException(exception: AppException): string {
    const response = exception.getResponse();
    if (typeof response === 'object' && response !== null && 'title' in response) {
      return String(response.title);
    }
    return exception.message;
  }

  private detailFromException(exception: AppException): string {
    const response = exception.getResponse();
    if (typeof response === 'object' && response !== null && 'detail' in response) {
      return String(response.detail);
    }
    return exception.message;
  }

  private extractValidationErrors(payload: string | object): FieldError[] {
    if (typeof payload !== 'object' || payload === null || !('message' in payload)) {
      return [];
    }
    const message = (payload as { message: unknown }).message;
    if (!Array.isArray(message)) {
      return [];
    }
    return message.map((item) => {
      if (typeof item === 'string') {
        return { field: 'body', code: 'invalid', message: item };
      }
      return { field: 'body', code: 'invalid', message: String(item) };
    });
  }

  private codeFromStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCodes.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCodes.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCodes.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCodes.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCodes.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCodes.RATE_LIMITED;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ErrorCodes.SERVICE_UNAVAILABLE;
      default:
        return ErrorCodes.INTERNAL_ERROR;
    }
  }
}
