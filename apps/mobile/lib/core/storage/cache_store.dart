import 'package:sqflite/sqflite.dart';

import 'local_database.dart';
import '../security/aes_cipher.dart';

class CacheStore {
  CacheStore(this._database, this._cipher);

  final LocalDatabase _database;
  final AesCipher _cipher;

  Future<void> write({
    required String key,
    required String tenantId,
    required String payload,
  }) async {
    final db = await _database.instance;
    final encrypted = await _cipher.encrypt(payload);
    await db.insert('cache_entries', {
      'cache_key': key,
      'tenant_id': tenantId,
      'payload': encrypted,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<String?> read({required String key, required String tenantId}) async {
    final db = await _database.instance;
    final rows = await db.query(
      'cache_entries',
      where: 'cache_key = ? AND tenant_id = ?',
      whereArgs: [key, tenantId],
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }
    final payload = rows.first['payload'] as String?;
    if (payload == null) {
      return null;
    }
    try {
      return await _cipher.decrypt(payload);
    } catch (_) {
      return null;
    }
  }

  Future<void> delete({required String key, required String tenantId}) async {
    final db = await _database.instance;
    await db.delete(
      'cache_entries',
      where: 'cache_key = ? AND tenant_id = ?',
      whereArgs: [key, tenantId],
    );
  }
}
