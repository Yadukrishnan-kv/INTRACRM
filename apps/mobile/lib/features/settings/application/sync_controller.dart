import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/sync/sync_engine.dart';
import '../../../core/sync/sync_status.dart';

class SyncUiState {
  const SyncUiState({
    this.online = true,
    this.pendingCount = 0,
    this.conflictCount = 0,
    this.syncing = false,
    this.lastSyncedAt,
    this.lastError,
    this.conflicts = const [],
  });

  final bool online;
  final int pendingCount;
  final int conflictCount;
  final bool syncing;
  final DateTime? lastSyncedAt;
  final String? lastError;
  final List<OfflineConflict> conflicts;

  SyncUiState copyWith({
    bool? online,
    int? pendingCount,
    int? conflictCount,
    bool? syncing,
    DateTime? lastSyncedAt,
    String? lastError,
    List<OfflineConflict>? conflicts,
  }) {
    return SyncUiState(
      online: online ?? this.online,
      pendingCount: pendingCount ?? this.pendingCount,
      conflictCount: conflictCount ?? this.conflictCount,
      syncing: syncing ?? this.syncing,
      lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
      lastError: lastError,
      conflicts: conflicts ?? this.conflicts,
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
      state = state.copyWith(pendingCount: 0, conflictCount: 0, conflicts: const []);
      return;
    }
    final pending = await ref.read(outboxStoreProvider).pendingCount(tenantId: tokens.tenantId);
    final conflicts = await ref.read(offlineStoreProvider).listConflicts(tokens.tenantId);
    state = state.copyWith(
      pendingCount: pending,
      conflictCount: conflicts.length,
      conflicts: conflicts,
    );
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
