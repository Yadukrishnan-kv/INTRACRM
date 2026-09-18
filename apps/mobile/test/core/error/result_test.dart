import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/error/failure.dart';
import 'package:intra_leads/core/error/result.dart';

void main() {
  test('Success exposes value', () {
    const result = Success<int>(7);
    expect(result.isSuccess, isTrue);
    expect(result.valueOrNull, 7);
  });

  test('Err exposes failure', () {
    const result = Err<int>(NetworkFailure('down'));
    expect(result.isFailure, isTrue);
    expect(result.failureOrNull, isA<NetworkFailure>());
  });
}
