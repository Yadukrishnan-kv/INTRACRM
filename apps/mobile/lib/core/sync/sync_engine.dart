import 'dart:async';
import 'dart:convert';

import '../auth/token_store.dart';
import '../logging/app_logger.dart';
import '../network/connectivity_service.dart';
import '../storage/id_map_store.dart';
import '../storage/offline_store.dart';
import '../storage/outbox_store.dart';
import '../utils/id_generator.dart';
import '../../features/leads/data/lead_api.dart';
import '../../features/leads/data/lead_dto.dart';
import '../../features/follow_ups/data/follow_up_api.dart';
import 'conflict_resolver.dart';
import 'outbox_processor.dart';
import 'sync_api.dart';
import 'sync_cursor_store.dart';
import 'sync_status.dart';

class SyncResult {
  const SyncResult({
    required this.online,
    required this.pushed,
    required this.pulled,
    this.error,
  });

  final bool online;
  final int pushed;
  final int pulled;
  final String? error;
}

class SyncEngine {
  SyncEngine({
    required OutboxProcessor outbox,
    required OutboxStore outboxStore,
    required OfflineStore offline,
    required IdMapStore idMap,
    required SyncCursorStore cursors,
    required SyncApi syncApi,
    required LeadApi leadApi,
    required FollowUpApi followUpApi,
    required ConnectivityService connectivity,
    required TokenStore tokens,
    required IdGenerator ids,
    required AppLogger logger,
  }) : _outbox = outbox,
       _outboxStore = outboxStore,
       _offline = offline,
       _idMap = idMap,
       _cursors = cursors,
       _syncApi = syncApi,
       _leadApi = leadApi,
       _followUpApi = followUpApi,
       _connectivity = connectivity,
       _tokens = tokens,
       _ids = ids,
       _logger = logger;

  final OutboxProcessor _outbox;
  final OutboxStore _outboxStore;
  final OfflineStore _offline;
  final IdMapStore _idMap;
  final SyncCursorStore _cursors;
  final SyncApi _syncApi;
  final LeadApi _leadApi;
  final FollowUpApi _followUpApi;
  final ConnectivityService _connectivity;
  final TokenStore _tokens;
  final IdGenerator _ids;
  final AppLogger _logger;

  StreamSubscription<bool>? _subscription;
  var _running = false;

  void start() {
    _subscription ??= _connectivity.onStatusChange.listen((online) {
      if (online) {
        unawaited(syncNow());
      }
    });
  }

  Future<void> stop() async {
    await _subscription?.cancel();
    _subscription = null;
  }

  Future<SyncResult> syncNow() async {
    if (_running) {
      return const SyncResult(online: true, pushed: 0, pulled: 0);
    }
    if (!await _connectivity.isOnline) {
      return const SyncResult(online: false, pushed: 0, pulled: 0);
    }
    final tokens = await _tokens.read();
    if (tokens == null) {
      return const SyncResult(online: true, pushed: 0, pulled: 0);
    }
    _running = true;
    try {
      final before = await _outboxStore.pendingCount(tenantId: tokens.tenantId);
      await _resolveStaleCommands(tokens.tenantId);
      await _outbox.flush();
      final pulled = await _pull(tokens.tenantId);
      final after = await _outboxStore.pendingCount(tenantId: tokens.tenantId);
      return SyncResult(online: true, pushed: (before - after).clamp(0, before), pulled: pulled);
    } catch (error) {
      _logger.error('Sync failed', error);
      return SyncResult(online: true, pushed: 0, pulled: 0, error: error.toString());
    } finally {
      _running = false;
    }
  }

  Future<int> _pull(String tenantId) async {
    final cursor = await _cursors.read(resource: 'crm', tenantId: tenantId);
    final result = await _syncApi.pull(updatedSince: cursor?.updatedSince?.toIso8601String());
    return result.when(
      success: (envelope) async {
        final delta = envelope.data;
        for (final lead in delta.leads) {
          await _offline.upsertLead(
            tenantId: tenantId,
            payload: lead.toJson(),
            syncStatus: SyncStatus.synced,
            serverId: lead.id,
          );
        }
        for (final note in delta.notes) {
          await _offline.upsertNote(
            tenantId: tenantId,
            payload: note.toJson(),
            syncStatus: SyncStatus.synced,
            serverId: note.id,
          );
        }
        for (final followUp in delta.followUps) {
          await _offline.upsertFollowUp(
            tenantId: tenantId,
            payload: followUp.toJson(),
            syncStatus: SyncStatus.synced,
            serverId: followUp.id,
          );
        }
        final stamp = delta.cursor == null ? null : DateTime.tryParse(delta.cursor!);
        await _cursors.save(
          SyncCursor(
            resource: 'crm',
            tenantId: tenantId,
            cursor: delta.cursor,
            updatedSince: stamp ?? cursor?.updatedSince,
          ),
        );
        return delta.leads.length + delta.notes.length + delta.followUps.length;
      },
      failure: (failure) async {
        _logger.warn('Sync pull failed: ${failure.message}');
        return 0;
      },
    );
  }

  Future<void> _resolveStaleCommands(String tenantId) async {
    final pending = await _outboxStore.pending(limit: 50);
    for (final command in pending) {
      if (command.lastError != 'STALE_VERSION') {
        continue;
      }
      final resolved = await _mergeStale(tenantId, command);
      if (!resolved) {
        continue;
      }
    }
  }

  Future<bool> _mergeStale(String tenantId, OutboxCommand command) async {
    final resource = command.resourceType ?? _inferResource(command.path);
    final localId = command.localId ?? _idFromPath(command.path);
    if (localId == null) {
      return false;
    }
    final serverId = await _idMap.resolve(
      tenantId: tenantId,
      resourceType: resource,
      id: localId,
    );
    if (resource == SyncResource.lead) {
      final local = await _offline.getLead(tenantId, localId);
      final remote = await _leadApi.getById(serverId);
      return remote.when(
        success: (envelope) async {
          final merged = mergeLeadConflict(
            local?.payload ?? {},
            envelope.data.toJson(),
          );
          await _offline.upsertLead(
            tenantId: tenantId,
            payload: merged,
            syncStatus: SyncStatus.pending,
            dirty: true,
            serverId: serverId,
          );
          await _offline.saveConflict(
            OfflineConflict(
              id: _ids.v7(),
              tenantId: tenantId,
              resourceType: resource,
              localId: localId,
              serverId: serverId,
              localPayload: local?.payload ?? {},
              serverPayload: envelope.data.toJson(),
              mergedPayload: merged,
              createdAt: DateTime.now().toUtc(),
            ),
          );
          await _outboxStore.updateCommand(
            id: command.id,
            body: jsonEncode(_leadPatchBody(merged)),
          );
          return true;
        },
        failure: (_) async => false,
      );
    }
    if (resource == SyncResource.followUp) {
      final local = await _offline.getFollowUp(tenantId, localId);
      final remote = await _followUpApi.getById(serverId);
      return remote.when(
        success: (envelope) async {
          final serverJson = LeadFollowUpDto(
            id: envelope.data.id,
            title: envelope.data.title,
            dueAt: envelope.data.dueAt,
            priority: envelope.data.priority,
            status: envelope.data.status,
            assignedToMembershipId: envelope.data.assignedToMembershipId,
            version: envelope.data.version,
            type: envelope.data.type,
            notes: envelope.data.notes,
            assigneeName: envelope.data.assigneeName,
            completedAt: envelope.data.completedAt,
            leadId: envelope.data.leadId,
            leadNumber: envelope.data.leadNumber,
            leadTitle: envelope.data.leadTitle,
            overdue: envelope.data.overdue,
            rescheduleCount: envelope.data.rescheduleCount,
            engineBucket: envelope.data.engineBucket,
          ).toJson();
          final merged = mergeFollowUpConflict(local?.payload ?? {}, serverJson);
          await _offline.upsertFollowUp(
            tenantId: tenantId,
            payload: merged,
            syncStatus: SyncStatus.pending,
            dirty: true,
            serverId: serverId,
          );
          await _offline.saveConflict(
            OfflineConflict(
              id: _ids.v7(),
              tenantId: tenantId,
              resourceType: resource,
              localId: localId,
              serverId: serverId,
              localPayload: local?.payload ?? {},
              serverPayload: serverJson,
              mergedPayload: merged,
              createdAt: DateTime.now().toUtc(),
            ),
          );
          final body = jsonDecode(command.body ?? '{}') as Map<String, dynamic>;
          body['version'] = merged['version'];
          if (merged['notes'] != null) {
            body['notes'] = merged['notes'];
          }
          if (merged['title'] != null) {
            body['title'] = merged['title'];
          }
          await _outboxStore.updateCommand(id: command.id, body: jsonEncode(body));
          return true;
        },
        failure: (_) async => false,
      );
    }
    return false;
  }

  String _inferResource(String path) {
    if (path.contains('follow-ups')) {
      return SyncResource.followUp;
    }
    if (path.contains('activities')) {
      return SyncResource.note;
    }
    return SyncResource.lead;
  }

  String? _idFromPath(String path) {
    final parts = path.split('/').where((part) => part.isNotEmpty).toList();
    if (parts.length >= 2) {
      return parts[1];
    }
    return parts.isEmpty ? null : parts.last;
  }

  Map<String, dynamic> _leadPatchBody(Map<String, dynamic> merged) {
    return {
      'title': merged['title'],
      if (merged['customerName'] != null) 'customerName': merged['customerName'],
      if (merged['primaryPhone'] != null) 'primaryPhone': merged['primaryPhone'],
      if (merged['primaryEmail'] != null) 'primaryEmail': merged['primaryEmail'],
      if (merged['city'] != null) 'city': merged['city'],
      if (merged['requirement'] != null) 'requirement': merged['requirement'],
      if (merged['version'] != null) 'version': merged['version'],
    };
  }
}
