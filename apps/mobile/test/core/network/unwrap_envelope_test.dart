import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/error/failure.dart';
import 'package:intra_leads/core/error/result.dart';
import 'package:intra_leads/core/network/api_envelope.dart';

ResponseMeta _meta() => ResponseMeta(
  requestId: 'req-1',
  timestamp: DateTime.utc(2026, 8, 15, 11, 14),
);

void main() {
  group('unwrapEnvelope', () {
    test('lifts the data payload out of a success envelope', () {
      final result = unwrapEnvelope<int>(
        Success(ApiSuccess(data: 7, meta: _meta())),
      );

      expect(result, isA<Success<int>>());
      expect(result.value, 7);
    });

    test('preserves the failure of an error result', () {
      const failure = NotFoundFailure('Lead not found', code: 'NOT_FOUND');

      final result = unwrapEnvelope<int>(const Err(failure));

      expect(result, isA<Err<int>>());
      expect(result.failure, same(failure));
      expect(result.failure.code, 'NOT_FOUND');
    });

    test('carries list payloads through without a runtime cast', () {
      final result = unwrapEnvelope<List<String>>(
        Success(ApiSuccess(data: const ['a', 'b'], meta: _meta())),
      );

      expect(result.value, ['a', 'b']);
    });

    test('keeps a null payload as a success rather than a failure', () {
      final result = unwrapEnvelope<String?>(
        Success(ApiSuccess(data: null, meta: _meta())),
      );

      expect(result.isSuccess, isTrue);
      expect(result.value, isNull);
    });
  });
}
