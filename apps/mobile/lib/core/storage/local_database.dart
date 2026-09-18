import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

class LocalDatabase {
  Database? _database;

  static const schemaVersion = 2;

  Future<Database> get instance async {
    final existing = _database;
    if (existing != null) {
      return existing;
    }
    final opened = await _open();
    _database = opened;
    return opened;
  }

  Future<void> init() async {
    await instance;
  }

  Future<void> close() async {
    await _database?.close();
    _database = null;
  }

  Future<Database> _open() async {
    final path = kIsWeb
        ? 'intra_leads.db'
        : p.join((await getApplicationDocumentsDirectory()).path, 'intra_leads.db');
    return openDatabase(
      path,
      version: schemaVersion,
      onCreate: (db, version) async {
        await _createV1(db);
        await _createV2(db);
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await _createV2(db);
        }
      },
    );
  }

  Future<void> _createV1(Database db) async {
    await db.execute('''
      CREATE TABLE cache_entries (
        cache_key TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (cache_key, tenant_id)
      )
    ''');
    await db.execute('''
      CREATE TABLE outbox_commands (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        body TEXT,
        idempotency_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_error TEXT
      )
    ''');
    await db.execute('''
      CREATE INDEX idx_outbox_status_created
      ON outbox_commands (status, created_at)
    ''');
    await db.execute('''
      CREATE TABLE sync_cursors (
        resource TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        cursor TEXT,
        updated_since TEXT,
        PRIMARY KEY (resource, tenant_id)
      )
    ''');
  }

  Future<void> _createV2(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS offline_leads (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        server_id TEXT,
        payload TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL,
        dirty INTEGER NOT NULL DEFAULT 0
      )
    ''');
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_offline_leads_tenant ON offline_leads (tenant_id, updated_at DESC)',
    );
    await db.execute('''
      CREATE TABLE IF NOT EXISTS offline_notes (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        lead_id TEXT NOT NULL,
        server_id TEXT,
        payload TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL,
        dirty INTEGER NOT NULL DEFAULT 0
      )
    ''');
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_offline_notes_lead ON offline_notes (tenant_id, lead_id, updated_at DESC)',
    );
    await db.execute('''
      CREATE TABLE IF NOT EXISTS offline_follow_ups (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        lead_id TEXT NOT NULL,
        server_id TEXT,
        payload TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL,
        dirty INTEGER NOT NULL DEFAULT 0
      )
    ''');
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_offline_follow_ups_lead ON offline_follow_ups (tenant_id, lead_id, updated_at DESC)',
    );
    await db.execute('''
      CREATE TABLE IF NOT EXISTS id_map (
        tenant_id TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        local_id TEXT NOT NULL,
        server_id TEXT NOT NULL,
        PRIMARY KEY (tenant_id, resource_type, local_id)
      )
    ''');
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_id_map_server ON id_map (tenant_id, resource_type, server_id)',
    );
    await db.execute('''
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        local_id TEXT NOT NULL,
        server_id TEXT,
        local_payload TEXT NOT NULL,
        server_payload TEXT NOT NULL,
        merged_payload TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    ''');
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_sync_conflicts_open ON sync_conflicts (tenant_id, status)',
    );
    final columns = await db.rawQuery('PRAGMA table_info(outbox_commands)');
    final names = {for (final row in columns) row['name'] as String};
    if (!names.contains('resource_type')) {
      await db.execute('ALTER TABLE outbox_commands ADD COLUMN resource_type TEXT');
    }
    if (!names.contains('local_id')) {
      await db.execute('ALTER TABLE outbox_commands ADD COLUMN local_id TEXT');
    }
    if (!names.contains('expected_version')) {
      await db.execute('ALTER TABLE outbox_commands ADD COLUMN expected_version INTEGER');
    }
  }
}
