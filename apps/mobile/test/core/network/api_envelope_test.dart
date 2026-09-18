import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/network/api_envelope.dart';

void main() {
  test('parses page meta from API envelope', () {
    final meta = ResponseMeta.fromJson({
      'requestId': 'req-1',
      'timestamp': '2026-08-15T11:14:00Z',
      'page': {
        'nextCursor': 'abc',
        'prevCursor': null,
        'limit': 20,
        'hasMore': true,
      },
    });

    expect(meta.requestId, 'req-1');
    expect(meta.page?.hasMore, isTrue);
    expect(meta.page?.nextCursor, 'abc');
  });
}
