import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../security/aes_cipher.dart';
import '../sync/sync_status.dart';
import 'id_map_store.dart';
import 'local_database.dart';

class OfflineRecord {
  const OfflineRecord({
    required this.id,
    required this.tenantId,
    required this.payload,
    required this.version,
    required this.updatedAt,
    required this.syncStatus,
    required this.dirty,
    this.serverId,
    this.leadId,
  });

  final String id;
  final String tenantId;
  final String? serverId;
  final String? leadId;
  final Map<String, dynamic> payload;
  final int version;
  final DateTime updatedAt;
  final SyncStatus syncStatus;
  final bool dirty;
}

class OfflineStore {
  OfflineStore(this._database, this._cipher, this._ids);

  final LocalDatabase _database;
  final AesCipher _cipher;
  final IdMapStore _ids;

  static String tableFor(String resourceType) {
    return switch (resourceType) {
      SyncResource.followUp => 'offline_follow_ups',
      SyncResource.note => 'offline_notes',
      _ => 'offline_leads',
    };
  }

  Future<void> upsertLead({
    required String tenantId,
    required Map<String, dynamic> payload,
    required SyncStatus syncStatus,
    bool dirty = false,
    bool force = false,
    String? serverId,
  }) {
    return _upsert(
      table: 'offline_leads',
      tenantId: tenantId,
      resourceType: SyncResource.lead,
      payload: payload,
      syncStatus: syncStatus,
      dirty: dirty,
      force: force,
      serverId: serverId,
    );
  }

  Future<void> upsertNote({
    required String tenantId,
    required Map<String, dynamic> payload,
    required SyncStatus syncStatus,
    bool dirty = false,
    bool force = false,
    String? serverId,
  }) {
    return _upsert(
      table: 'offline_notes',
      tenantId: tenantId,
      resourceType: SyncResource.note,
      payload: payload,
      syncStatus: syncStatus,
      dirty: dirty,
      force: force,
      serverId: serverId,
      leadId: payload['leadId'] as String?,
    );
  }

  Future<void> upsertFollowUp({
    required String tenantId,
    required Map<String, dynamic> payload,
    required SyncStatus syncStatus,
    bool dirty = false,
    bool force = false,
    String? serverId,
  }) {
    return _upsert(
      table: 'offline_follow_ups',
      tenantId: tenantId,
      resourceType: SyncResource.followUp,
      payload: payload,
      syncStatus: syncStatus,
      dirty: dirty,
      force: force,
      serverId: serverId,
      leadId: payload['leadId'] as String?,
    );
  }

  Future<List<OfflineRecord>> listLeads(String tenantId) {
    return _list('offline_leads', tenantId);
  }

  Future<OfflineRecord?> getLead(String tenantId, String id) {
    return _get('offline_leads', SyncResource.lead, tenantId, id);
  }

  Future<OfflineRecord?> getNote(String tenantId, String id) {
    return _get('offline_notes', SyncResource.note, tenantId, id);
  }

  Future<List<OfflineRecord>> listNotesForLead(String tenantId, String leadId) {
    return _listByLead('offline_notes', tenantId, leadId);
  }

  Future<List<OfflineRecord>> listFollowUps(
    String tenantId, {
    String? leadId,
    String? status,
  }) {
    return _list('offline_follow_ups', tenantId, leadId: leadId, status: status);
  }

  Future<OfflineRecord?> getFollowUp(String tenantId, String id) {
    return _get('offline_follow_ups', SyncResource.followUp, tenantId, id);
  }

  Future<void> rekey({
    required String table,
    required String tenantId,
    required String localId,
    required String serverId,
    required String resourceType,
  }) async {
    await _ids.bind(
      tenantId: tenantId,
      resourceType: resourceType,
      localId: localId,
      serverId: serverId,
    );
    final existing = await _get(table, resourceType, tenantId, localId);
    if (existing == null) {
      return;
    }
    final payload = Map<String, dynamic>.from(existing.payload)..['id'] = serverId;
    if (resourceType == SyncResource.note || resourceType == SyncResource.followUp) {
      final leadId = payload['leadId'] as String?;
      if (leadId != null) {
        payload['leadId'] = await _ids.resolve(
          tenantId: tenantId,
          resourceType: SyncResource.lead,
          id: leadId,
        );
      }
    }
    final db = await _database.instance;
    await db.delete(table, where: 'id = ?', whereArgs: [localId]);
    await _upsert(
      table: table,
      tenantId: tenantId,
      resourceType: resourceType,
      payload: payload,
      syncStatus: SyncStatus.synced,
      dirty: false,
      serverId: serverId,
    );
  }

  Future<void> saveConflict(OfflineConflict conflict) async {
    final db = await _database.instance;
    await db.insert('sync_conflicts', {
      'id': conflict.id,
      'tenant_id': conflict.tenantId,
      'resource_type': conflict.resourceType,
      'local_id': conflict.localId,
      'server_id': conflict.serverId,
      'local_payload': await _cipher.encrypt(jsonEncode(conflict.localPayload)),
      'server_payload': await _cipher.encrypt(jsonEncode(conflict.serverPayload)),
      'merged_payload': await _cipher.encrypt(jsonEncode(conflict.mergedPayload)),
      'status': conflict.status,
      'created_at': conflict.createdAt.toIso8601String(),
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<OfflineConflict>> listConflicts(String tenantId) async {
    final db = await _database.instance;
    final rows = await db.query(
      'sync_conflicts',
      where: 'tenant_id = ? AND status = ?',
      whereArgs: [tenantId, 'open'],
      orderBy: 'created_at DESC',
    );
    return [
      for (final row in rows) await _conflictFromRow(row),
    ];
  }

  Future<int> conflictCount(String tenantId) async {
    final db = await _database.instance;
    final rows = await db.rawQuery(
      "SELECT COUNT(*) AS c FROM sync_conflicts WHERE tenant_id = ? AND status = 'open'",
      [tenantId],
    );
    return (rows.first['c'] as int?) ?? 0;
  }

  Future<void> resolveConflict(String id) async {
    final db = await _database.instance;
    await db.update(
      'sync_conflicts',
      {'status': 'resolved'},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> _upsert({
    required String table,
    required String tenantId,
    required String resourceType,
    required Map<String, dynamic> payload,
    required SyncStatus syncStatus,
    required bool dirty,
    bool force = false,
    String? serverId,
    String? leadId,
  }) async {
    final incomingId = payload['id'] as String;
    final localId = await _ids.toLocal(
      tenantId: tenantId,
      resourceType: resourceType,
      serverId: incomingId,
    );
    final existing = await _rawGet(table, tenantId, localId);
    if (existing != null && existing.dirty && syncStatus == SyncStatus.synced && !force) {
      return;
    }
    final id = localId;
    final resolvedServer = serverId ?? (incomingId == localId ? null : incomingId);
    final row = <String, Object?>{
      'id': id,
      'tenant_id': tenantId,
      'server_id': resolvedServer ?? existing?.serverId,
      'payload': await _cipher.encrypt(jsonEncode({...payload, 'id': id})),
      'version': payload['version'] as int? ?? 1,
      'updated_at':
          payload['updatedAt'] as String? ?? DateTime.now().toUtc().toIso8601String(),
      'sync_status': syncStatus.name,
      'dirty': dirty ? 1 : 0,
    };
    if (table != 'offline_leads') {
      row['lead_id'] = leadId ?? payload['leadId'] ?? existing?.leadId ?? '';
    }
    final db = await _database.instance;
    await db.insert(table, row, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<OfflineRecord>> _list(
    String table,
    String tenantId, {
    String? leadId,
    String? status,
  }) async {
    final db = await _database.instance;
    final where = StringBuffer('tenant_id = ?');
    final args = <Object?>[tenantId];
    if (leadId != null) {
      where.write(' AND lead_id = ?');
      args.add(leadId);
    }
    final rows = await db.query(
      table,
      where: where.toString(),
      whereArgs: args,
      orderBy: 'updated_at DESC',
    );
    final records = [
      for (final row in rows) await _fromRow(row),
    ];
    if (status == null) {
      return records;
    }
    return [
      for (final record in records)
        if (record.payload['status'] == status) record,
    ];
  }

  Future<List<OfflineRecord>> _listByLead(
    String table,
    String tenantId,
    String leadId,
  ) async {
    final mappedLead = await _ids.resolve(
      tenantId: tenantId,
      resourceType: SyncResource.lead,
      id: leadId,
    );
    final db = await _database.instance;
    final rows = await db.query(
      table,
      where: 'tenant_id = ? AND (lead_id = ? OR lead_id = ?)',
      whereArgs: [tenantId, leadId, mappedLead],
      orderBy: 'updated_at DESC',
    );
    return [for (final row in rows) await _fromRow(row)];
  }

  Future<OfflineRecord?> _get(
    String table,
    String resourceType,
    String tenantId,
    String id,
  ) async {
    final mappedLocal = await _ids.toLocal(
      tenantId: tenantId,
      resourceType: resourceType,
      serverId: id,
    );
    final mappedServer = await _ids.resolve(
      tenantId: tenantId,
      resourceType: resourceType,
      id: id,
    );
    return await _rawGet(table, tenantId, id) ??
        await _rawGet(table, tenantId, mappedLocal) ??
        await _rawGet(table, tenantId, mappedServer);
  }

  Future<OfflineRecord?> _rawGet(String table, String tenantId, String id) async {
    final db = await _database.instance;
    final rows = await db.query(
      table,
      where: 'id = ? AND tenant_id = ?',
      whereArgs: [id, tenantId],
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }
    return _fromRow(rows.first);
  }

  Future<OfflineRecord> _fromRow(Map<String, Object?> row) async {
    final encrypted = row['payload']! as String;
    Map<String, dynamic> payload = {};
    try {
      payload = jsonDecode(await _cipher.decrypt(encrypted)) as Map<String, dynamic>;
    } catch (_) {
      payload = {};
    }
    return OfflineRecord(
      id: row['id']! as String,
      tenantId: row['tenant_id']! as String,
      serverId: row['server_id'] as String?,
      leadId: row['lead_id'] as String?,
      payload: payload,
      version: row['version']! as int,
      updatedAt: DateTime.parse(row['updated_at']! as String),
      syncStatus: SyncStatus.parse(row['sync_status'] as String?),
      dirty: (row['dirty'] as int? ?? 0) == 1,
    );
  }

  Future<OfflineConflict> _conflictFromRow(Map<String, Object?> row) async {
    Future<Map<String, dynamic>> decode(Object? value) async {
      if (value is! String || value.isEmpty) {
        return {};
      }
      try {
        return Map<String, dynamic>.from(
          jsonDecode(await _cipher.decrypt(value)) as Map,
        );
      } catch (_) {
        return {};
      }
    }

    return OfflineConflict(
      id: row['id']! as String,
      tenantId: row['tenant_id']! as String,
      resourceType: row['resource_type']! as String,
      localId: row['local_id']! as String,
      serverId: row['server_id'] as String?,
      localPayload: await decode(row['local_payload']),
      serverPayload: await decode(row['server_payload']),
      mergedPayload: await decode(row['merged_payload']),
      status: row['status']! as String,
      createdAt: DateTime.parse(row['created_at']! as String),
    );
  }
}
