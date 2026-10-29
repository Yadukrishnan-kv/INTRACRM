import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/features/leads/data/lead_api.dart';
import 'package:intra_leads/features/leads/domain/lead.dart';

void main() {
  const cleared = CreateLeadInput(
    title: 'Lead',
    customerName: '',
    primaryPhone: '  ',
    primaryEmail: '',
    city: '',
    requirement: '',
  );

  test('update sends null for cleared fields so the server clears them', () {
    final body = LeadApi.updateBody(cleared);
    for (final key in [
      'customerName',
      'primaryPhone',
      'primaryEmail',
      'city',
      'requirement',
      'sourceId',
      'quality',
      'estimatedValueMinor',
    ]) {
      expect(body.containsKey(key), isTrue, reason: key);
      expect(body[key], isNull, reason: key);
    }
    // Ownership is never cleared by an edit.
    expect(body.containsKey('ownerMembershipId'), isFalse);
  });

  test('create leaves blank fields out instead of sending empty strings', () {
    final body = LeadApi.createBody(cleared);
    expect(body, {'title': 'Lead'});
  });

  test('values are trimmed and kept', () {
    final body = LeadApi.updateBody(
      const CreateLeadInput(title: 'Lead', primaryEmail: ' a@b.co ', ownerMembershipId: 'm1'),
    );
    expect(body['primaryEmail'], 'a@b.co');
    expect(body['ownerMembershipId'], 'm1');
  });
}
