import 'failure.dart';

sealed class Result<T> {
  const Result();

  bool get isSuccess => this is Success<T>;
  bool get isFailure => this is Err<T>;

  T get value => switch (this) {
    Success<T>(:final value) => value,
    Err<T>(:final failure) => throw StateError(failure.message),
  };

  Failure get failure => switch (this) {
    Err<T>(:final failure) => failure,
    Success<T>() => throw StateError('Result is success'),
  };

  T? get valueOrNull => switch (this) {
    Success<T>(:final value) => value,
    Err<T>() => null,
  };

  Failure? get failureOrNull => switch (this) {
    Success<T>() => null,
    Err<T>(:final failure) => failure,
  };

  R when<R>({
    required R Function(T value) success,
    required R Function(Failure failure) failure,
  }) {
    return switch (this) {
      Success<T>(value: final value) => success(value),
      Err<T>(failure: final error) => failure(error),
    };
  }
}

final class Success<T> extends Result<T> {
  const Success(this.value);
  @override
  final T value;
}

final class Err<T> extends Result<T> {
  const Err(this.failure);
  @override
  final Failure failure;
}
