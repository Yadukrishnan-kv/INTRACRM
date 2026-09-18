import 'dart:convert';

import '../../../core/auth/token_store.dart';
import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../../../core/network/connectivity_service.dart';
import '../../../core/storage/offline_store.dart';
import '../../../core/storage/outbox_store.dart';
import '../../../core/sync/sync_status.dart';
import '../../../core/utils/id_generator.dart';
import '../../leads/data/lead_dto.dart';
import '../../leads/domain/lead.dart';
import '../domain/follow_up_repository.dart';
import 'follow_up_api.dart';

class FollowUpRepositoryImpl implements FollowUpRepository {
  FollowUpRepositoryImpl({
    required FollowUpApi api,
    required OfflineStore offline,
    required OutboxStore outbox,
    required TokenStore tokenStore,
    required ConnectivityService connectivity,
    required IdGenerator ids,
    required String? Function() membershipId,
  }) : _api = api,
       _offline = offline,
       _outbox = outbox,
       _tokenStore = tokenStore,
       _connectivity = connectivity,
       _ids = ids,
       _membershipId = membershipId;

  final FollowUpApi _api;
  final OfflineStore _offline;
  final OutboxStore _outbox;
  final TokenStore _tokenStore;
  final ConnectivityService _connectivity;
  final IdGenerator _ids;
  final String? Function() _membershipId;

  @override
  Future<Result<PagedData<LeadFollowUp>>> list({
    String? cursor,
    String? status,
    String? type,
    String? leadId,
    bool? overdue,
  }) async {
    final tokens = await _tokenStore.read();
    if (tokens == null) {
      return const Err(UnauthorizedFailure('Session expired'));
    }
    if (await _connectivity.isOnline && cursor == null) {
      final result = await _api.list(
        status: status,
        type: type,
        leadId: leadId,
        overdue: overdue,
      );
      if (result is Success<ApiSuccess<List<LeadFollowUp>>>) {
        for (final item in result.value.data) {
          await _upsert(tokens.tenantId, item, SyncStatus.synced);
        }
      }
    }
    final rows = await _offline.listFollowUps(tokens.tenantId, leadId: leadId, status: status);
    var items = [for (final row in rows) _fromRecord(row)];
    if (type != null) {
      items = [for (final item in items) if (item.type == type) item];
    }
    if (overdue == true) {
      final now = DateTime.now().toUtc();
      items = [
        for (final item in items)
          if (item.isPending && item.dueAt.isBefore(now)) item,
      ];
    }
    items.sort((left, right) => left.dueAt.compareTo(right.dueAt));
    if (items.isNotEmpty || !await _connectivity.isOnline) {
      return Success(PagedData(items: items, page: const PageMeta(limit: 20, hasMore: false)));
    }
    final result = await _api.list(
      cursor: cursor,
      status: status,
      type: type,
      leadId: leadId,
      overdue: overdue,
    );
    return switch (result) {
      Success(:final value) => Success(
        PagedData(
          items: value.data,
          page: value.meta.page ?? const PageMeta(limit: 20, hasMore: false),
        ),
      ),
      Err(:final failure) => Err(failure),
    };
  }

  @override
  Future<Result<LeadFollowUp>> getById(String id) async {
    final tokens = await _tokenStore.read();
    if (tokens == null) {
      return const Err(UnauthorizedFailure('Session expired'));
    }
    if (await _connectivity.isOnline) {
      final result = await _api.getById(id);
      if (result is Success<ApiSuccess<LeadFollowUp>>) {
        await _upsert(tokens.tenantId, result.value.data, SyncStatus.synced);
        return Success(result.value.data);
      }
    }
    final local = await _offline.getFollowUp(tokens.tenantId, id);
    if (local != null) {
      return Success(_fromRecord(local));
    }
    return const Err(NotFoundFailure('Follow-up not found'));
  }

  @override
  Future<Result<LeadFollowUp>> create({
    required String leadId,
    required String type,
    required DateTime dueAt,
    String? title,
    String? notes,
    int? priority,
    String? assignedToMembershipId,
  }) async {
    final tokens = await _tokenStore.read();
    if (tokens == null) {
      return const Err(UnauthorizedFailure('Session expired'));
    }
    if (await _connectivity.isOnline) {
      final result = await _api.create(
        leadId: leadId,
        type: type,
        dueAt: dueAt,
        title: title,
        notes: notes,
        priority: priority,
        assignedToMembershipId: assignedToMembershipId,
      );
      if (result is Success<ApiSuccess<LeadFollowUp>>) {
        await _upsert(tokens.tenantId, result.value.data, SyncStatus.synced);
        return Success(result.value.data);
      }
      return result.when(success: (value) => Success(value.data), failure: Err.new);
    }

    final item = LeadFollowUpDto(
      id: _ids.v7(),
      leadId: leadId,
      title: (title == null || title.isEmpty) ? 'Follow-up' : title,
      dueAt: dueAt,
      priority: priority ?? 2,
      status: 'pending',
      assignedToMembershipId: assignedToMembershipId ?? _membershipId() ?? '',
      version: 1,
      type: type,
      notes: notes,
      syncStatus: SyncStatus.pending.name,
      updatedAt: DateTime.now().toUtc(),
    );
    await _offline.upsertFollowUp(
      tenantId: tokens.tenantId,
      payload: item.toJson(),
      syncStatus: SyncStatus.pending,
      dirty: true,
    );
    await _outbox.enqueue(
      OutboxCommand(
        id: _ids.v7(),
        tenantId: tokens.tenantId,
        method: 'POST',
        path: '/follow-ups',
        body: jsonEncode({
          'leadId': leadId,
          'type': type,
          'dueAt': dueAt.toUtc().toIso8601String(),
          if (title != null && title.isNotEmpty) 'title': title,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
          if (priority != null) 'priority': priority,
          if (assignedToMembershipId != null)
            'assignedToMembershipId': assignedToMembershipId,
        }),
        idempotencyKey: _ids.v4(),
        status: OutboxStatus.pending,
        attempts: 0,
        createdAt: DateTime.now().toUtc(),
        resourceType: SyncResource.followUp,
        localId: item.id,
      ),
    );
    return Success(item.toDomain());
  }

  @override
  Future<Result<LeadFollowUp>> update({
    required String id,
    required int version,
    String? type,
    String? title,
    String? notes,
    int? priority,
    String? assignedToMembershipId,
  }) async {
    final tokens = await _tokenStore.read();
    if (tokens == null) {
      return const Err(UnauthorizedFailure('Session expired'));
    }
    if (await _connectivity.isOnline) {
      final result = await _api.update(
        id: id,
        version: version,
        type: type,
        title: title,
        notes: notes,
        priority: priority,
        assignedToMembershipId: assignedToMembershipId,
      );
      if (result is Success<ApiSuccess<LeadFollowUp>>) {
        await _upsert(tokens.tenantId, result.value.data, SyncStatus.synced);
        return Success(result.value.data);
      }
      return result.when(success: (value) => Success(value.data), failure: Err.new);
    }

    final current = await _offline.getFollowUp(tokens.tenantId, id);
    final payload = {
      ...?current?.payload,
      'id': id,
      if (type != null) 'type': type,
      if (title != null) 'title': title,
      'notes': notes,
      if (priority != null) 'priority': priority,
      if (assignedToMembershipId != null)
        'assignedToMembershipId': assignedToMembershipId,
      'syncStatus': SyncStatus.pending.name,
      'updatedAt': DateTime.now().toUtc().toIso8601String(),
    };
    await _offline.upsertFollowUp(
      tenantId: tokens.tenantId,
      payload: payload,
      syncStatus: SyncStatus.pending,
      dirty: true,
    );
    await _outbox.enqueue(
      OutboxCommand(
        id: _ids.v7(),
        tenantId: tokens.tenantId,
        method: 'PATCH',
        path: '/follow-ups/$id',
        body: jsonEncode({
          'version': version,
          if (type != null) 'type': type,
          if (title != null && title.isNotEmpty) 'title': title,
          'notes': notes,
          if (priority != null) 'priority': priority,
          if (assignedToMembershipId != null)
            'assignedToMembershipId': assignedToMembershipId,
        }),
        idempotencyKey: _ids.v4(),
        status: OutboxStatus.pending,
        attempts: 0,
        createdAt: DateTime.now().toUtc(),
        resourceType: SyncResource.followUp,
        localId: id,
        expectedVersion: version,
      ),
    );
    return Success(LeadFollowUpDto.fromJson(payload).toDomain());
  }

  @override
  Future<Result<LeadFollowUp>> complete({
    required String id,
    required int version,
    String? notes,
  }) async {
    final tokens = await _tokenStore.read();
    if (tokens == null) {
      return const Err(UnauthorizedFailure('Session expired'));
    }
    if (await _connectivity.isOnline) {
      final result = await _api.complete(id: id, version: version, notes: notes);
      if (result is Success<ApiSuccess<LeadFollowUp>>) {
        await _upsert(tokens.tenantId, result.value.data, SyncStatus.synced);
        return Success(result.value.data);
      }
      return result.when(success: (value) => Success(value.data), failure: Err.new);
    }

    final current = await _offline.getFollowUp(tokens.tenantId, id);
    final payload = {
      ...?current?.payload,
      'id': id,
      'status': 'completed',
      'completedAt': DateTime.now().toUtc().toIso8601String(),
      if (notes != null) 'notes': notes,
      'syncStatus': SyncStatus.pending.name,
    };
    await _offline.upsertFollowUp(
      tenantId: tokens.tenantId,
      payload: payload,
      syncStatus: SyncStatus.pending,
      dirty: true,
    );
    await _outbox.enqueue(
      OutboxCommand(
        id: _ids.v7(),
        tenantId: tokens.tenantId,
        method: 'POST',
        path: '/follow-ups/$id/complete',
        body: jsonEncode({
          'version': version,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
        }),
        idempotencyKey: _ids.v4(),
        status: OutboxStatus.pending,
        attempts: 0,
        createdAt: DateTime.now().toUtc(),
        resourceType: SyncResource.followUp,
        localId: id,
        expectedVersion: version,
      ),
    );
    return Success(LeadFollowUpDto.fromJson(payload).toDomain());
  }

  @override
  Future<Result<LeadFollowUp>> reschedule({
    required String id,
    required DateTime dueAt,
    required int version,
    String? reason,
  }) async {
    if (!await _connectivity.isOnline) {
      return const Err(OfflineFailure('Rescheduling a follow-up needs a network connection.'));
    }
    return (await _api.reschedule(
      id: id,
      dueAt: dueAt,
      version: version,
      reason: reason,
    )).when(success: (value) => Success(value.data), failure: Err.new);
  }

  Future<void> _upsert(String tenantId, LeadFollowUp item, SyncStatus status) {
    return _offline.upsertFollowUp(
      tenantId: tenantId,
      payload: LeadFollowUpDto(
        id: item.id,
        title: item.title,
        dueAt: item.dueAt,
        priority: item.priority,
        status: item.status,
        assignedToMembershipId: item.assignedToMembershipId,
        version: item.version,
        type: item.type,
        notes: item.notes,
        assigneeName: item.assigneeName,
        completedAt: item.completedAt,
        leadId: item.leadId,
        leadNumber: item.leadNumber,
        leadTitle: item.leadTitle,
        overdue: item.overdue,
        rescheduleCount: item.rescheduleCount,
        engineBucket: item.engineBucket,
        syncStatus: status.name,
        updatedAt: item.updatedAt,
      ).toJson(),
      syncStatus: status,
      serverId: status == SyncStatus.synced ? item.id : null,
    );
  }

  LeadFollowUp _fromRecord(OfflineRecord row) {
    return LeadFollowUpDto.fromJson({
      ...row.payload,
      'syncStatus': row.syncStatus.name,
    }).toDomain();
  }
}
