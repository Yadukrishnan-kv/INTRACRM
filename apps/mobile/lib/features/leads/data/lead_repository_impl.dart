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
import '../domain/lead.dart';
import '../domain/lead_repository.dart';
import 'lead_api.dart';
import 'lead_dto.dart';
import 'lead_local_source.dart';

class LeadRepositoryImpl implements LeadRepository {
  LeadRepositoryImpl({
    required LeadApi api,
    required LeadLocalSource local,
    required OutboxStore outbox,
    required OfflineStore offline,
    required TokenStore tokenStore,
    required ConnectivityService connectivity,
    required IdGenerator ids,
  }) : _api = api,
       _local = local,
       _outbox = outbox,
       _offline = offline,
       _tokenStore = tokenStore,
       _connectivity = connectivity,
       _ids = ids;

  final LeadApi _api;
  final LeadLocalSource _local;
  final OutboxStore _outbox;
  final OfflineStore _offline;
  final TokenStore _tokenStore;
  final ConnectivityService _connectivity;
  final IdGenerator _ids;

  @override
  Future<Result<PagedData<Lead>>> list({String? cursor}) async {
    final tokens = await _tokenStore.read();
    if (tokens == null) {
      return const Err(UnauthorizedFailure('Session expired'));
    }
    final online = await _connectivity.isOnline;
    if (online && cursor == null) {
      final result = await _api.list();
      if (result is Success<ApiSuccess<List<LeadDto>>>) {
        await _local.saveList(tokens.tenantId, result.value.data);
        for (final lead in result.value.data) {
          await _offline.upsertLead(
            tenantId: tokens.tenantId,
            payload: lead.toJson(),
            syncStatus: SyncStatus.synced,
            serverId: lead.id,
          );
        }
      }
    }
    final rows = await _offline.listLeads(tokens.tenantId);
    if (rows.isNotEmpty) {
      return Success(
        PagedData(
          items: [for (final row in rows) _leadFromRecord(row)],
          page: const PageMeta(limit: 20, hasMore: false),
        ),
      );
    }
    if (!online) {
      final cached = await _local.readList(tokens.tenantId);
      return Success(
        PagedData(
          items: [for (final dto in cached) dto.toDomain()],
          page: const PageMeta(limit: 20, hasMore: false),
        ),
      );
    }
    final result = await _api.list(cursor: cursor);
    return switch (result) {
      Success(:final value) => Success(
        PagedData(
          items: [for (final dto in value.data) dto.toDomain()],
          page: value.meta.page ?? const PageMeta(limit: 20, hasMore: false),
        ),
      ),
      Err(:final failure) => Err(failure),
    };
  }

  @override
  Future<Result<Lead>> getById(String id) async {
    final tokens = await _tokenStore.read();
    if (tokens == null) {
      return const Err(UnauthorizedFailure('Session expired'));
    }
    if (await _connectivity.isOnline) {
      final serverId = id;
      final result = await _api.getById(serverId);
      if (result is Success<ApiSuccess<LeadDto>>) {
        final dto = result.value.data;
        await _offline.upsertLead(
          tenantId: tokens.tenantId,
          payload: dto.toJson(),
          syncStatus: SyncStatus.synced,
          serverId: dto.id,
        );
        for (final activity in dto.activities) {
          await _offline.upsertNote(
            tenantId: tokens.tenantId,
            payload: LeadActivityDto(
              id: activity.id,
              leadId: dto.id,
              type: activity.type,
              subject: activity.subject,
              body: activity.body,
              occurredAt: activity.occurredAt,
              actorName: activity.actorName,
            ).toJson(),
            syncStatus: SyncStatus.synced,
            serverId: activity.id,
          );
        }
        for (final followUp in dto.followUps) {
          await _offline.upsertFollowUp(
            tenantId: tokens.tenantId,
            payload: LeadFollowUpDto(
              id: followUp.id,
              title: followUp.title,
              dueAt: followUp.dueAt,
              priority: followUp.priority,
              status: followUp.status,
              assignedToMembershipId: followUp.assignedToMembershipId,
              version: followUp.version,
              type: followUp.type,
              notes: followUp.notes,
              assigneeName: followUp.assigneeName,
              completedAt: followUp.completedAt,
              leadId: dto.id,
              leadNumber: dto.leadNumber,
              leadTitle: dto.title,
              overdue: followUp.overdue,
              rescheduleCount: followUp.rescheduleCount,
              engineBucket: followUp.engineBucket,
            ).toJson(),
            syncStatus: SyncStatus.synced,
            serverId: followUp.id,
          );
        }
      }
    }
    final local = await _hydrate(tokens.tenantId, id);
    if (local != null) {
      return Success(local);
    }
    return const Err(NotFoundFailure('Lead not found'));
  }

  @override
  Future<Result<LeadLookups>> lookups() async {
    final tokens = await _tokenStore.read();
    if (tokens == null) {
      return const Err(UnauthorizedFailure('Session expired'));
    }
    if (await _connectivity.isOnline) {
      final result = await _api.lookups();
      if (result is Success<ApiSuccess<LeadLookupsDto>>) {
        await _local.saveLookups(tokens.tenantId, result.value.data);
        return Success(result.value.data.toDomain());
      }
    }
    final cached = await _local.readLookups(tokens.tenantId);
    if (cached != null) {
      return Success(cached.toDomain());
    }
    if (!await _connectivity.isOnline) {
      return const Err(NetworkFailure('Lookups are unavailable offline'));
    }
    final result = await _api.lookups();
    return result.when(
      success: (value) => Success(value.data.toDomain()),
      failure: Err.new,
    );
  }

  @override
  Future<Result<Lead>> create(CreateLeadInput input) async {
    final tokens = await _tokenStore.read();
    if (tokens == null) {
      return const Err(UnauthorizedFailure('Session expired'));
    }
    if (await _connectivity.isOnline) {
      final result = await _api.create(input);
      if (result is Success<ApiSuccess<LeadDto>>) {
        await _offline.upsertLead(
          tenantId: tokens.tenantId,
          payload: result.value.data.toJson(),
          syncStatus: SyncStatus.synced,
          serverId: result.value.data.id,
        );
        return Success(result.value.data.toDomain());
      }
      return result.when(success: (value) => Success(value.data.toDomain()), failure: Err.new);
    }

    final localId = _ids.v7();
    final dto = LeadDto(
      id: localId,
      leadNumber: 'LOCAL',
      title: input.title,
      lifecycleStatus: 'open',
      customerName: input.customerName,
      primaryPhone: input.primaryPhone,
      primaryEmail: input.primaryEmail,
      city: input.city,
      requirement: input.requirement,
      sourceId: input.sourceId,
      quality: input.quality,
      estimatedValueMinor: input.estimatedValueMinor,
      ownerMembershipId: input.ownerMembershipId,
      version: 1,
      updatedAt: DateTime.now().toUtc(),
      syncStatus: SyncStatus.pending.name,
    );
    await _offline.upsertLead(
      tenantId: tokens.tenantId,
      payload: dto.toJson(),
      syncStatus: SyncStatus.pending,
      dirty: true,
    );
    await _outbox.enqueue(
      OutboxCommand(
        id: _ids.v7(),
        tenantId: tokens.tenantId,
        method: 'POST',
        path: '/leads',
        body: jsonEncode(_createBody(input)),
        idempotencyKey: _ids.v4(),
        status: OutboxStatus.pending,
        attempts: 0,
        createdAt: DateTime.now().toUtc(),
        resourceType: SyncResource.lead,
        localId: localId,
      ),
    );
    return Success(dto.toDomain());
  }

  @override
  Future<Result<Lead>> update({
    required String id,
    required CreateLeadInput input,
    int? version,
  }) async {
    final tokens = await _tokenStore.read();
    if (tokens == null) {
      return const Err(UnauthorizedFailure('Session expired'));
    }
    final current = await _offline.getLead(tokens.tenantId, id);
    final expectedVersion = version ?? current?.version ?? 1;
    if (await _connectivity.isOnline) {
      final result = await _api.update(id: id, input: input, version: expectedVersion);
      if (result is Success<ApiSuccess<LeadDto>>) {
        await _offline.upsertLead(
          tenantId: tokens.tenantId,
          payload: result.value.data.toJson(),
          syncStatus: SyncStatus.synced,
          serverId: result.value.data.id,
        );
        return Success(result.value.data.toDomain());
      }
      return result.when(success: (value) => Success(value.data.toDomain()), failure: Err.new);
    }

    final payload = {
      ...?current?.payload,
      'id': id,
      'title': input.title,
      'customerName': input.customerName,
      'primaryPhone': input.primaryPhone,
      'primaryEmail': input.primaryEmail,
      'city': input.city,
      'requirement': input.requirement,
      'sourceId': input.sourceId,
      'quality': input.quality,
      'estimatedValueMinor': input.estimatedValueMinor,
      'updatedAt': DateTime.now().toUtc().toIso8601String(),
      'syncStatus': SyncStatus.pending.name,
    };
    await _offline.upsertLead(
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
        path: '/leads/$id',
        body: jsonEncode({..._createBody(input), 'version': expectedVersion}),
        idempotencyKey: _ids.v4(),
        status: OutboxStatus.pending,
        attempts: 0,
        createdAt: DateTime.now().toUtc(),
        resourceType: SyncResource.lead,
        localId: id,
        expectedVersion: expectedVersion,
      ),
    );
    return Success(_leadFromJson(payload));
  }

  @override
  Future<Result<Lead>> assign({
    required String id,
    required String ownerMembershipId,
    String? reason,
  }) async {
    if (!await _connectivity.isOnline) {
      return const Err(OfflineFailure('Assigning a lead needs a network connection.'));
    }
    final result = await _api.assign(
      id: id,
      ownerMembershipId: ownerMembershipId,
      reason: reason,
    );
    return result.when(
      success: (value) => Success(value.data.toDomain()),
      failure: Err.new,
    );
  }

  @override
  Future<Result<LeadActivity>> addActivity({
    required String leadId,
    required String type,
    String? subject,
    String? body,
  }) async {
    final tokens = await _tokenStore.read();
    if (tokens == null) {
      return const Err(UnauthorizedFailure('Session expired'));
    }
    if (await _connectivity.isOnline) {
      final result = await _api.addActivity(
        leadId: leadId,
        type: type,
        subject: subject,
        body: body,
      );
      if (result is Success<ApiSuccess<LeadActivity>>) {
        final activity = result.value.data;
        await _offline.upsertNote(
          tenantId: tokens.tenantId,
          payload: LeadActivityDto(
            id: activity.id,
            leadId: leadId,
            type: activity.type,
            subject: activity.subject,
            body: activity.body,
            occurredAt: activity.occurredAt,
            actorName: activity.actorName,
          ).toJson(),
          syncStatus: SyncStatus.synced,
          serverId: activity.id,
        );
        return Success(activity);
      }
      return result.when(success: (value) => Success(value.data), failure: Err.new);
    }

    final note = LeadActivityDto(
      id: _ids.v7(),
      leadId: leadId,
      type: type,
      subject: subject,
      body: body,
      occurredAt: DateTime.now().toUtc(),
      actorName: 'You',
      syncStatus: SyncStatus.pending.name,
    );
    await _offline.upsertNote(
      tenantId: tokens.tenantId,
      payload: note.toJson(),
      syncStatus: SyncStatus.pending,
      dirty: true,
    );
    await _outbox.enqueue(
      OutboxCommand(
        id: _ids.v7(),
        tenantId: tokens.tenantId,
        method: 'POST',
        path: '/leads/$leadId/activities',
        body: jsonEncode({
          'type': type,
          if (subject != null && subject.isNotEmpty) 'subject': subject,
          if (body != null && body.isNotEmpty) 'body': body,
        }),
        idempotencyKey: _ids.v4(),
        status: OutboxStatus.pending,
        attempts: 0,
        createdAt: DateTime.now().toUtc(),
        resourceType: SyncResource.note,
        localId: note.id,
      ),
    );
    return Success(note.toDomain());
  }

  @override
  Future<Result<LeadFollowUp>> addFollowUp({
    required String leadId,
    required DateTime dueAt,
    String? type,
    String? title,
    String? notes,
  }) async {
    final tokens = await _tokenStore.read();
    if (tokens == null) {
      return const Err(UnauthorizedFailure('Session expired'));
    }
    if (await _connectivity.isOnline) {
      final result = await _api.addFollowUp(
        leadId: leadId,
        dueAt: dueAt,
        type: type,
        title: title,
        notes: notes,
      );
      if (result is Success<ApiSuccess<LeadFollowUp>>) {
        final item = result.value.data;
        await _saveFollowUp(tokens.tenantId, item, SyncStatus.synced);
        return Success(item);
      }
      return result.when(success: (value) => Success(value.data), failure: Err.new);
    }

    final item = LeadFollowUpDto(
      id: _ids.v7(),
      leadId: leadId,
      title: (title == null || title.isEmpty) ? 'Follow-up' : title,
      dueAt: dueAt,
      priority: 2,
      status: 'pending',
      assignedToMembershipId: '',
      version: 1,
      type: type ?? FollowUpTypes.call,
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
        path: '/leads/$leadId/follow-ups',
        body: jsonEncode({
          'dueAt': dueAt.toUtc().toIso8601String(),
          'type': type ?? FollowUpTypes.call,
          if (title != null && title.isNotEmpty) 'title': title,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
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
  Future<Result<LeadFollowUp>> completeFollowUp({
    required String leadId,
    required String followUpId,
    String? notes,
  }) async {
    final tokens = await _tokenStore.read();
    if (tokens == null) {
      return const Err(UnauthorizedFailure('Session expired'));
    }
    if (await _connectivity.isOnline) {
      final result = await _api.completeFollowUp(
        leadId: leadId,
        followUpId: followUpId,
        notes: notes,
      );
      return result.when(success: (value) => Success(value.data), failure: Err.new);
    }

    final current = await _offline.getFollowUp(tokens.tenantId, followUpId);
    final payload = {
      ...?current?.payload,
      'id': followUpId,
      'leadId': leadId,
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
        path: '/leads/$leadId/follow-ups/$followUpId/complete',
        body: jsonEncode({
          'version': current?.version ?? 1,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
        }),
        idempotencyKey: _ids.v4(),
        status: OutboxStatus.pending,
        attempts: 0,
        createdAt: DateTime.now().toUtc(),
        resourceType: SyncResource.followUp,
        localId: followUpId,
        expectedVersion: current?.version,
      ),
    );
    return Success(LeadFollowUpDto.fromJson(payload).toDomain());
  }

  Future<Lead?> _hydrate(String tenantId, String id) async {
    final record = await _offline.getLead(tenantId, id);
    if (record == null) {
      return null;
    }
    final notes = await _offline.listNotesForLead(tenantId, record.id);
    final followUps = await _offline.listFollowUps(tenantId, leadId: record.id);
    final lead = _leadFromRecord(record);
    return Lead(
      id: lead.id,
      leadNumber: lead.leadNumber,
      title: lead.title,
      lifecycleStatus: lead.lifecycleStatus,
      version: lead.version,
      updatedAt: lead.updatedAt,
      customerName: lead.customerName,
      primaryPhone: lead.primaryPhone,
      primaryEmail: lead.primaryEmail,
      city: lead.city,
      requirement: lead.requirement,
      sourceId: lead.sourceId,
      sourceName: lead.sourceName,
      quality: lead.quality,
      estimatedValueMinor: lead.estimatedValueMinor,
      currency: lead.currency,
      ownerMembershipId: lead.ownerMembershipId,
      ownerName: lead.ownerName,
      stageName: lead.stageName,
      nextFollowUpAt: lead.nextFollowUpAt,
      pipelineId: lead.pipelineId,
      stageId: lead.stageId,
      createdAt: lead.createdAt,
      lastActivityAt: lead.lastActivityAt,
      activities: [
        for (final note in notes)
          LeadActivityDto.fromJson({
            ...note.payload,
            'syncStatus': note.syncStatus.name,
          }).toDomain(),
      ],
      followUps: [
        for (final item in followUps)
          LeadFollowUpDto.fromJson({
            ...item.payload,
            'syncStatus': item.syncStatus.name,
          }).toDomain(),
      ],
      syncStatus: lead.syncStatus,
    );
  }

  Future<void> _saveFollowUp(String tenantId, LeadFollowUp item, SyncStatus status) {
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
      ).toJson(),
      syncStatus: status,
      dirty: status == SyncStatus.pending,
      serverId: status == SyncStatus.synced ? item.id : null,
    );
  }

  Lead _leadFromRecord(OfflineRecord row) {
    return _leadFromJson({...row.payload, 'syncStatus': row.syncStatus.name});
  }

  Lead _leadFromJson(Map<String, dynamic> json) {
    return LeadDto.fromJson(json).toDomain();
  }

  Map<String, dynamic> _createBody(CreateLeadInput input) {
    return {
      'title': input.title,
      if (input.customerName != null) 'customerName': input.customerName,
      if (input.primaryPhone != null) 'primaryPhone': input.primaryPhone,
      if (input.primaryEmail != null) 'primaryEmail': input.primaryEmail,
      if (input.city != null) 'city': input.city,
      if (input.requirement != null) 'requirement': input.requirement,
      if (input.sourceId != null) 'sourceId': input.sourceId,
      if (input.quality != null) 'quality': input.quality,
      if (input.estimatedValueMinor != null)
        'estimatedValueMinor': input.estimatedValueMinor,
      if (input.ownerMembershipId != null) 'ownerMembershipId': input.ownerMembershipId,
    };
  }
}
