import 'dart:convert';

import 'package:dio/dio.dart';

import '../logging/app_logger.dart';
import '../network/api_exception.dart';
import '../network/api_headers.dart';
import '../network/connectivity_service.dart';
import '../storage/id_map_store.dart';
import '../storage/offline_store.dart';
import '../storage/outbox_store.dart';
import 'sync_status.dart';

class OutboxProcessor {
  OutboxProcessor({
    required OutboxStore store,
    required Dio dio,
    required ConnectivityService connectivity,
    required AppLogger logger,
    required IdMapStore idMap,
    required OfflineStore offline,
  }) : _store = store,
       _dio = dio,
       _connectivity = connectivity,
       _logger = logger,
       _idMap = idMap,
       _offline = offline;

  final OutboxStore _store;
  final Dio _dio;
  final ConnectivityService _connectivity;
  final AppLogger _logger;
  final IdMapStore _idMap;
  final OfflineStore _offline;

  Future<void> flush() async {
    if (!await _connectivity.isOnline) {
      return;
    }
    final pending = await _store.pending();
    for (final command in pending) {
      try {
        final response = await _dio.request<Map<String, dynamic>>(
          command.path,
          data: command.body == null ? null : jsonDecode(command.body!),
          options: Options(
            method: command.method,
            headers: {ApiHeaders.idempotencyKey: command.idempotencyKey},
          ),
        );
        await _onCreated(command, response.data);
        await _markSynced(command);
        await _store.markDone(command.id);
      } catch (error) {
        if (_isStaleVersion(error)) {
          _logger.warn('Outbox stale version for ${command.id}');
          await _store.markRetry(command.id, 'STALE_VERSION');
          continue;
        }
        if (_isRetryable(error)) {
          _logger.warn('Outbox retry for ${command.id}');
          await _store.markRetry(command.id, error.toString());
          continue;
        }
        _logger.error('Outbox flush failed for ${command.id}', error);
        await _store.markFailed(command.id, error.toString());
      }
    }
  }

  Future<void> _onCreated(OutboxCommand command, Map<String, dynamic>? envelope) async {
    if (command.method.toUpperCase() != 'POST' || command.localId == null) {
      return;
    }
    final data = envelope?['data'];
    if (data is! Map) {
      return;
    }
    final serverId = data['id'] as String?;
    final localId = command.localId!;
    if (serverId == null || serverId == localId) {
      return;
    }
    final resourceType = command.resourceType ?? SyncResource.lead;
    await _idMap.bind(
      tenantId: command.tenantId,
      resourceType: resourceType,
      localId: localId,
      serverId: serverId,
    );
    await _offline.rekey(
      table: OfflineStore.tableFor(resourceType),
      tenantId: command.tenantId,
      localId: localId,
      serverId: serverId,
      resourceType: resourceType,
    );
    await _store.rewriteLocalId(
      tenantId: command.tenantId,
      localId: localId,
      serverId: serverId,
    );
  }

  Future<void> _markSynced(OutboxCommand command) async {
    final resourceType = command.resourceType;
    final localId = command.localId;
    if (resourceType == null || localId == null) {
      return;
    }
    if (resourceType == SyncResource.lead) {
      final row = await _offline.getLead(command.tenantId, localId);
      if (row != null) {
        await _offline.upsertLead(
          tenantId: command.tenantId,
          payload: row.payload,
          syncStatus: SyncStatus.synced,
          force: true,
          serverId: row.serverId,
        );
      }
      return;
    }
    if (resourceType == SyncResource.note) {
      final row = await _offline.getNote(command.tenantId, localId);
      if (row != null) {
        await _offline.upsertNote(
          tenantId: command.tenantId,
          payload: row.payload,
          syncStatus: SyncStatus.synced,
          force: true,
          serverId: row.serverId,
        );
      }
      return;
    }
    if (resourceType == SyncResource.followUp) {
      final row = await _offline.getFollowUp(command.tenantId, localId);
      if (row != null) {
        await _offline.upsertFollowUp(
          tenantId: command.tenantId,
          payload: row.payload,
          syncStatus: SyncStatus.synced,
          force: true,
          serverId: row.serverId,
        );
      }
    }
  }

  bool _isStaleVersion(Object error) {
    return _apiCode(error) == 'STALE_VERSION';
  }

  bool _isRetryable(Object error) {
    if (error is DioException) {
      switch (error.type) {
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.sendTimeout:
        case DioExceptionType.receiveTimeout:
        case DioExceptionType.connectionError:
          return true;
        default:
          break;
      }
      final status = error.response?.statusCode ?? 0;
      return status >= 500;
    }
    return false;
  }

  String? _apiCode(Object error) {
    if (error is DioException && error.error is ApiException) {
      return (error.error as ApiException).body.code;
    }
    return null;
  }
}
