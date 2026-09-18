import 'package:sqflite/sqflite.dart';

import '../storage/local_database.dart';

class SyncCursor {
  const SyncCursor({
    required this.resource,
    required this.tenantId,
    this.cursor,
    this.updatedSince,
  });

  final String resource;
  final String tenantId;
  final String? cursor;
  final DateTime? updatedSince;
}

class SyncCursorStore {
  SyncCursorStore(this._database);

  final LocalDatabase _database;

  Future<void> save(SyncCursor value) async {
    final db = await _database.instance;
    await db.insert('sync_cursors', {
      'resource': value.resource,
      'tenant_id': value.tenantId,
      'cursor': value.cursor,
      'updated_since': value.updatedSince?.toIso8601String(),
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<SyncCursor?> read({
    required String resource,
    required String tenantId,
  }) async {
    final db = await _database.instance;
    final rows = await db.query(
      'sync_cursors',
      where: 'resource = ? AND tenant_id = ?',
      whereArgs: [resource, tenantId],
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }
    final row = rows.first;
    final updatedSince = row['updated_since'] as String?;
    return SyncCursor(
      resource: row['resource']! as String,
      tenantId: row['tenant_id']! as String,
      cursor: row['cursor'] as String?,
      updatedSince: updatedSince == null ? null : DateTime.parse(updatedSince),
    );
  }
}
