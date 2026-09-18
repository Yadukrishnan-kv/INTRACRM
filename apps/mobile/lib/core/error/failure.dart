sealed class Failure {
  const Failure(this.message, {this.code, this.cause});

  final String message;
  final String? code;
  final Object? cause;
}

final class NetworkFailure extends Failure {
  const NetworkFailure(super.message, {super.code, super.cause});
}

final class UnauthorizedFailure extends Failure {
  const UnauthorizedFailure(super.message, {super.code, super.cause});
}

final class ForbiddenFailure extends Failure {
  const ForbiddenFailure(super.message, {super.code, super.cause});
}

final class NotFoundFailure extends Failure {
  const NotFoundFailure(super.message, {super.code, super.cause});
}

final class ValidationFailure extends Failure {
  const ValidationFailure(
    super.message, {
    super.code,
    super.cause,
    this.fieldErrors = const [],
  });

  final List<FieldError> fieldErrors;
}

final class ConflictFailure extends Failure {
  const ConflictFailure(super.message, {super.code, super.cause});
}

final class OfflineFailure extends Failure {
  const OfflineFailure([
    super.message = 'You are offline. The change was queued.',
  ]);
}

final class RateLimitedFailure extends Failure {
  const RateLimitedFailure(super.message, {super.code, super.cause});
}

final class UnexpectedFailure extends Failure {
  const UnexpectedFailure(super.message, {super.code, super.cause});
}

class FieldError {
  const FieldError({
    required this.field,
    required this.code,
    required this.message,
  });

  final String field;
  final String code;
  final String message;
}
