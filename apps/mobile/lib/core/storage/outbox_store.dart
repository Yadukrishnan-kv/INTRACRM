import 'package:sqflite/sqflite.dart';

import 'local_database.dart';
import '../security/aes_cipher.dart';

enum OutboxStatus { pending, processing, done, failed }

const _unset = Object();

class OutboxCommand {
  const OutboxCommand({
    required this.id,
    required this.tenantId,
    required this.method,
    required this.path,
    required this.idempotencyKey,
    required this.status,
    required this.attempts,
    required this.createdAt,
    this.body,
    this.lastError,
    this.resourceType,
    this.localId,
    this.expectedVersion,
  });

  final String id;
  final String tenantId;
  final String method;
  final String path;
  final String? body;
  final String idempotencyKey;
  final OutboxStatus status;
  final int attempts;
  final DateTime createdAt;
  final String? lastError;
  final String? resourceType;
  final String? localId;
  final int? expectedVersion;

  static const maxAttempts = 8;

  Map<String, Object?> toRow() {
    return {
      'id': id,
      'tenant_id': tenantId,
      'method': method,
      'path': path,
      'body': body,
      'idempotency_key': idempotencyKey,
      'status': status.name,
      'attempts': attempts,
      'created_at': createdAt.toIso8601String(),
      'last_error': lastError,
      'resource_type': resourceType,
      'local_id': localId,
      'expected_version': expectedVersion,
    };
  }

  factory OutboxCommand.fromRow(Map<String, Object?> row) {
    return OutboxCommand(
      id: row['id']! as String,
      tenantId: row['tenant_id']! as String,
      method: row['method']! as String,
      path: row['path']! as String,
      body: row['body'] as String?,
      idempotencyKey: row['idempotency_key']! as String,
      status: OutboxStatus.values.byName(row['status']! as String),
      attempts: row['attempts']! as int,
      createdAt: DateTime.parse(row['created_at']! as String),
      lastError: row['last_error'] as String?,
      resourceType: row['resource_type'] as String?,
      localId: row['local_id'] as String?,
      expectedVersion: row['expected_version'] as int?,
    );
  }

  OutboxCommand copyWith({
    Object? body = _unset,
    String? path,
    OutboxStatus? status,
    String? lastError,
    String? resourceType,
    String? localId,
    int? expectedVersion,
  }) {
    return OutboxCommand(
      id: id,
      tenantId: tenantId,
      method: method,
      path: path ?? this.path,
      idempotencyKey: idempotencyKey,
      status: status ?? this.status,
      attempts: attempts,
      createdAt: createdAt,
      body: identical(body, _unset) ? this.body : body as String?,
      lastError: lastError ?? this.lastError,
      resourceType: resourceType ?? this.resourceType,
      localId: localId ?? this.localId,
      expectedVersion: expectedVersion ?? this.expectedVersion,
    );
  }
}

class OutboxStore {
  OutboxStore(this._database, this._cipher);

  final LocalDatabase _database;
  final AesCipher _cipher;

  Future<void> enqueue(OutboxCommand command) async {
    final db = await _database.instance;
    final body = command.body;
    await db.insert(
      'outbox_commands',
      command
          .copyWith(body: body == null ? null : await _cipher.encrypt(body))
          .toRow(),
      conflictAlgorithm: ConflictAlgorithm.ignore,
    );
  }

  Future<List<OutboxCommand>> pending({int limit = 20}) async {
    final db = await _database.instance;
    final rows = await db.query(
      'outbox_commands',
      where: 'status = ?',
      whereArgs: [OutboxStatus.pending.name],
      orderBy: 'created_at ASC',
      limit: limit,
    );
    return [
      for (final row in rows)
        await _decryptCommand(OutboxCommand.fromRow(row)),
    ];
  }

  Future<int> pendingCount({String? tenantId}) async {
    final db = await _database.instance;
    final rows = tenantId == null
        ? await db.rawQuery(
            "SELECT COUNT(*) AS c FROM outbox_commands WHERE status = ?",
            [OutboxStatus.pending.name],
          )
        : await db.rawQuery(
            "SELECT COUNT(*) AS c FROM outbox_commands WHERE status = ? AND tenant_id = ?",
            [OutboxStatus.pending.name, tenantId],
          );
    return (rows.first['c'] as int?) ?? 0;
  }

  Future<void> markDone(String id) async {
    final db = await _database.instance;
    await db.update(
      'outbox_commands',
      {'status': OutboxStatus.done.name},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> markRetry(String id, String error) async {
    final db = await _database.instance;
    await db.rawUpdate(
      '''
      UPDATE outbox_commands
      SET attempts = attempts + 1,
          last_error = ?,
          status = CASE WHEN attempts + 1 >= ? THEN ? ELSE ? END
      WHERE id = ?
      ''',
      [
        error,
        OutboxCommand.maxAttempts,
        OutboxStatus.failed.name,
        OutboxStatus.pending.name,
        id,
      ],
    );
  }

  Future<void> markFailed(String id, String error) async {
    final db = await _database.instance;
    await db.rawUpdate(
      '''
      UPDATE outbox_commands
      SET status = ?, attempts = attempts + 1, last_error = ?
      WHERE id = ?
      ''',
      [OutboxStatus.failed.name, error, id],
    );
  }

  Future<void> updateCommand({
    required String id,
    String? path,
    String? body,
  }) async {
    final db = await _database.instance;
    await db.update(
      'outbox_commands',
      {
        if (path != null) 'path': path,
        if (body != null) 'body': await _cipher.encrypt(body),
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> rewriteLocalId({
    required String tenantId,
    required String localId,
    required String serverId,
  }) async {
    final pendingCommands = await pending(limit: 200);
    for (final command in pendingCommands) {
      if (command.tenantId != tenantId) {
        continue;
      }
      final path = command.path.replaceAll(localId, serverId);
      final body = command.body?.replaceAll(localId, serverId);
      if (path == command.path && body == command.body) {
        continue;
      }
      await updateCommand(id: command.id, path: path, body: body);
    }
  }

  Future<OutboxCommand> _decryptCommand(OutboxCommand command) async {
    final body = command.body;
    if (body == null) {
      return command;
    }
    try {
      return command.copyWith(body: await _cipher.decrypt(body));
    } catch (_) {
      return command.copyWith(body: null);
    }
  }
}
