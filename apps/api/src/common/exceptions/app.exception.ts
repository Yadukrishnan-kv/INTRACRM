import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorCodes, ErrorTypes } from './error-codes';

export type FieldError = {
  field: string;
  code: string;
  message: string;
};

export type AppExceptionOptions = {
  code?: ErrorCode;
  detail?: string;
  errors?: FieldError[];
  cause?: unknown;
  retryAfterSeconds?: number;
};

export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly errorType: string;
  readonly errors: FieldError[];
  readonly retryAfterSeconds?: number;

  constructor(
    status: HttpStatus,
    title: string,
    options: AppExceptionOptions = {},
  ) {
    const code = options.code ?? statusToCode(status);
    super(
      {
        title,
        detail: options.detail ?? title,
        code,
      },
      status,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.code = code;
    this.errorType = ErrorTypes[code];
    this.errors = options.errors ?? [];
    if (options.retryAfterSeconds != null) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}

function statusToCode(status: HttpStatus): ErrorCode {
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
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return ErrorCodes.VALIDATION_ERROR;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCodes.RATE_LIMITED;
    case HttpStatus.SERVICE_UNAVAILABLE:
      return ErrorCodes.SERVICE_UNAVAILABLE;
    default:
      return ErrorCodes.INTERNAL_ERROR;
  }
}
