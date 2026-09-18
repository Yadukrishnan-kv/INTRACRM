import 'package:sqflite/sqflite.dart';

import 'local_database.dart';

class IdMapStore {
  IdMapStore(this._database);

  final LocalDatabase _database;

  Future<void> bind({
    required String tenantId,
    required String resourceType,
    required String localId,
    required String serverId,
  }) async {
    if (localId == serverId) {
      return;
    }
    final db = await _database.instance;
    await db.insert('id_map', {
      'tenant_id': tenantId,
      'resource_type': resourceType,
      'local_id': localId,
      'server_id': serverId,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<String> resolve({
    required String tenantId,
    required String resourceType,
    required String id,
  }) async {
    final db = await _database.instance;
    final local = await db.query(
      'id_map',
      where: 'tenant_id = ? AND resource_type = ? AND local_id = ?',
      whereArgs: [tenantId, resourceType, id],
      limit: 1,
    );
    if (local.isNotEmpty) {
      return local.first['server_id']! as String;
    }
    return id;
  }

  Future<String> toLocal({
    required String tenantId,
    required String resourceType,
    required String serverId,
  }) async {
    final db = await _database.instance;
    final rows = await db.query(
      'id_map',
      where: 'tenant_id = ? AND resource_type = ? AND server_id = ?',
      whereArgs: [tenantId, resourceType, serverId],
      limit: 1,
    );
    if (rows.isEmpty) {
      return serverId;
    }
    return rows.first['local_id']! as String;
  }
}
