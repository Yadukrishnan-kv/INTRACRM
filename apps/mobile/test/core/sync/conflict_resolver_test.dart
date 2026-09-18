import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/sync/conflict_resolver.dart';

void main() {
  group('mergeLeadConflict', () {
    test('keeps server ownership and stage, merges safe fields', () {
      final merged = mergeLeadConflict(
        {
          'title': 'Local title',
          'city': 'Pune',
          'ownerMembershipId': 'local-owner',
          'lifecycleStatus': 'open',
          'stageName': 'New',
        },
        {
          'title': 'Server title',
          'city': 'Mumbai',
          'ownerMembershipId': 'server-owner',
          'lifecycleStatus': 'won',
          'stageName': 'Closed',
          'version': 4,
          'updatedAt': '2026-08-17T00:00:00.000Z',
        },
      );
      expect(merged['title'], 'Local title');
      expect(merged['city'], 'Pune');
      expect(merged['ownerMembershipId'], 'server-owner');
      expect(merged['lifecycleStatus'], 'won');
      expect(merged['stageName'], 'Closed');
      expect(merged['version'], 4);
    });
  });

  group('mergeFollowUpConflict', () {
    test('lets a completed follow-up win', () {
      final merged = mergeFollowUpConflict(
        {'notes': 'Called', 'status': 'pending', 'version': 1},
        {'notes': 'Email sent', 'status': 'completed', 'version': 3},
      );
      expect(merged['status'], 'completed');
      expect(merged['notes'], 'Email sent');
    });

    test('merges notes when both are still pending', () {
      expect(mergeNotes('Email sent', 'Called'), 'Email sent\nCalled');
    });
  });
}
