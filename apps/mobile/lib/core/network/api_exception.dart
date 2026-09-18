import '../error/failure.dart';
import 'api_envelope.dart';

class ApiException implements Exception {
  const ApiException(this.body);

  final ApiErrorBody body;

  Failure toFailure() {
    return switch (body.status) {
      401 => UnauthorizedFailure(body.detail, code: body.code),
      403 => ForbiddenFailure(body.detail, code: body.code),
      404 => NotFoundFailure(body.detail, code: body.code),
      409 => ConflictFailure(body.detail, code: body.code),
      429 => RateLimitedFailure(body.detail, code: body.code),
      422 => ValidationFailure(
        body.detail,
        code: body.code,
        fieldErrors: [
          for (final error in body.errors)
            FieldError(
              field: error.field,
              code: error.code,
              message: error.message,
            ),
        ],
      ),
      _ when body.status >= 500 => NetworkFailure(body.detail, code: body.code),
      _ => UnexpectedFailure(body.detail, code: body.code),
    };
  }

  @override
  String toString() => 'ApiException(${body.status} ${body.code}: ${body.detail})';
}
