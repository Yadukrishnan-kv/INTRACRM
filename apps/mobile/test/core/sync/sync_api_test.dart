import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/sync/sync_api.dart';

void main() {
  test('parses deletion tombstones and ignores malformed ids', () {
    final delta = SyncDelta.fromJson({
      'hasMore': true,
      'leads': const <Object?>[],
      'notes': const <Object?>[],
      'followUps': const <Object?>[],
      'deletedLeads': ['lead-1', '', 7],
      'deletedNotes': ['note-1'],
      'deletedFollowUps': ['follow-up-1'],
    });

    expect(delta.hasMore, isTrue);
    expect(delta.deletedLeads, ['lead-1']);
    expect(delta.deletedNotes, ['note-1']);
    expect(delta.deletedFollowUps, ['follow-up-1']);
  });
}
