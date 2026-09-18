import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/features/warranties/domain/warranty.dart';

void main() {
  group('parseWarrantyToken', () {
    const token = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    test('accepts a 48-character hex token', () {
      expect(parseWarrantyToken(token), token);
      expect(parseWarrantyToken(token.toUpperCase()), token);
    });

    test('extracts a token from a portal URL', () {
      expect(
        parseWarrantyToken(
          'http://localhost:3000/api/v1/public/warranty/$token/view',
        ),
        token,
      );
    });

    test('rejects card numbers and short values', () {
      expect(parseWarrantyToken('WR-2026-000001'), isNull);
      expect(parseWarrantyToken('not-a-token'), isNull);
      expect(parseWarrantyToken(''), isNull);
    });
  });
}
