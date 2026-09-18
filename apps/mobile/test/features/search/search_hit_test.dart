import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/features/search/domain/search_hit.dart';

void main() {
  test('exposes the four search fields plus auto', () {
    expect(searchFields.map((field) => field.code).toList(), [
      null,
      'customer',
      'mobile',
      'lead_id',
      'quotation_number',
    ]);
  });

  test('parses a quotation hit', () {
    final hit = SearchHit.fromJson({
      'type': 'quotation',
      'id': 'q-1',
      'leadId': 'l-1',
      'quotationId': 'q-1',
      'title': 'QT-2026-000001',
      'subtitle': 'Ramesh · LD-2026-000010',
      'matchedBy': 'quotation_number',
      'score': 100,
    });
    expect(hit.isQuotation, isTrue);
    expect(hit.leadId, 'l-1');
  });
}
