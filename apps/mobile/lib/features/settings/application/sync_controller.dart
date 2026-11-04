import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/storage/outbox_store.dart';
import '../../../core/sync/sync_engine.dart';
import '../../../core/sync/sync_status.dart';

class SyncUiState {
  const SyncUiState({
    this.online = true,
    this.pendingCount = 0,
    this.conflictCount = 0,
    this.failedCount = 0,
    this.syncing = false,
    this.lastSyncedAt,
    this.lastError,
    this.conflicts = const [],
    this.failedCommands = const [],
  });

  final bool online;
  final int pendingCount;
  final int conflictCount;
  final int failedCount;
  final bool syncing;
  final DateTime? lastSyncedAt;
  final String? lastError;
  final List<OfflineConflict> conflicts;
  final List<OutboxCommand> failedCommands;

  SyncUiState copyWith({
    bool? online,
    int? pendingCount,
    int? conflictCount,
    int? failedCount,
    bool? syncing,
    DateTime? lastSyncedAt,
    String? lastError,
    List<OfflineConflict>? conflicts,
    List<OutboxCommand>? failedCommands,
  }) {
    return SyncUiState(
      online: online ?? this.online,
      pendingCount: pendingCount ?? this.pendingCount,
      conflictCount: conflictCount ?? this.conflictCount,
      failedCount: failedCount ?? this.failedCount,
      syncing: syncing ?? this.syncing,
      lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
      lastError: lastError,
      conflicts: conflicts ?? this.conflicts,
      failedCommands: failedCommands ?? this.failedCommands,
    );
  }
}

final syncControllerProvider = NotifierProvider<SyncController, SyncUiState>(
  SyncController.new,
);

class SyncController extends Notifier<SyncUiState> {
  @override
  SyncUiState build() {
    final connectivity = ref.read(connectivityServiceProvider);
    final sub = connectivity.onStatusChange.listen((online) async {
      state = state.copyWith(online: online);
      await refreshCounts();
    });
    ref.onDispose(sub.cancel);
    Future.microtask(() async {
      state = state.copyWith(online: await connectivity.isOnline);
      await refreshCounts();
    });
    return const SyncUiState();
  }

  Future<void> refreshCounts() async {
    final tokens = await ref.read(tokenStoreProvider).read();
    if (tokens == null) {
      state = state.copyWith(
        pendingCount: 0,
        conflictCount: 0,
        conflicts: const [],
        failedCount: 0,
        failedCommands: const [],
      );
      return;
    }
    final outbox = ref.read(outboxStoreProvider);
    final pending = await outbox.pendingCount(tenantId: tokens.tenantId);
    final conflicts = await ref.read(offlineStoreProvider).listConflicts(tokens.tenantId);
    final failedCommands = await outbox.failed(tenantId: tokens.tenantId);
    state = state.copyWith(
      pendingCount: pending,
      conflictCount: conflicts.length,
      conflicts: conflicts,
      failedCount: failedCommands.length,
      failedCommands: failedCommands,
    );
  }

  /// Requeues a permanently-failed command so the next sync retries it.
  Future<void> retryFailed(String commandId) async {
    await ref.read(outboxStoreProvider).retry(commandId);
    await refreshCounts();
  }

  /// Requeues every permanently-failed command for the current tenant.
  Future<void> retryAllFailed() async {
    for (final command in state.failedCommands) {
      await ref.read(outboxStoreProvider).retry(command.id);
    }
    await refreshCounts();
  }

  Future<SyncResult> syncNow() async {
    state = state.copyWith(syncing: true, lastError: null);
    final result = await ref.read(syncEngineProvider).syncNow();
    await refreshCounts();
    state = state.copyWith(
      syncing: false,
      lastSyncedAt: DateTime.now().toUtc(),
      lastError: result.error,
      online: result.online,
    );
    return result;
  }

  Future<void> acknowledgeConflict(String id) async {
    await ref.read(offlineStoreProvider).resolveConflict(id);
    await refreshCounts();
  }
}
