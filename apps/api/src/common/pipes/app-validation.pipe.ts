import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import { ErrorCodes } from '../exceptions/error-codes';

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    exceptionFactory: (errors: ValidationError[]) => {
      const fieldErrors = flattenErrors(errors);
      return new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Validation failed', {
        code: ErrorCodes.VALIDATION_ERROR,
        detail: fieldErrors[0]?.message ?? 'Validation failed',
        errors: fieldErrors,
      });
    },
  });
}

function flattenErrors(
  errors: ValidationError[],
  parent = '',
): { field: string; code: string; message: string }[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const current = Object.entries(error.constraints ?? {}).map(([code, message]) => ({
      field,
      code,
      message,
    }));
    const children = error.children?.length
      ? flattenErrors(error.children, field)
      : [];
    return [...current, ...children];
  });
}
