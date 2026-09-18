import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/auth_controller.dart';
import '../domain/auth_session.dart';

class SessionsPage extends ConsumerStatefulWidget {
  const SessionsPage({super.key});

  @override
  ConsumerState<SessionsPage> createState() => _SessionsPageState();
}

class _SessionsPageState extends ConsumerState<SessionsPage> {
  var _loading = true;
  String? _error;
  List<AuthSession> _sessions = const [];
  List<LoginHistoryEntry> _history = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final repository = ref.read(authRepositoryProvider);
    final sessions = await repository.listSessions();
    final history = await repository.loginHistory();
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      if (sessions is Err) {
        _error = sessions.failure.message;
        return;
      }
      if (history is Err) {
        _error = history.failure.message;
        return;
      }
      _sessions = (sessions as Success<List<AuthSession>>).value;
      _history = (history as Success<List<LoginHistoryEntry>>).value;
    });
  }

  Future<void> _revoke(AuthSession session) async {
    final result = await ref.read(authRepositoryProvider).revokeSession(session.id);
    if (!mounted) {
      return;
    }
    if (result is Err) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(result.failure.message)));
      return;
    }
    if (session.isCurrent) {
      await ref.read(authControllerProvider.notifier).logout();
      return;
    }
    await _load();
  }

  Future<void> _revokeOthers() async {
    final result = await ref.read(authRepositoryProvider).revokeOtherSessions();
    if (!mounted) {
      return;
    }
    if (result is Err) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(result.failure.message)));
      return;
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: AppStrings.devicesAndSessions,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(child: Text(_error!))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.md),
                children: [
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: _revokeOthers,
                      child: const Text(AppStrings.signOutOtherDevices),
                    ),
                  ),
                  Text(
                    AppStrings.devicesAndSessions,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  for (final session in _sessions)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        session.deviceName?.isNotEmpty == true
                            ? session.deviceName!
                            : session.deviceId,
                      ),
                      subtitle: Text(
                        [
                          session.status,
                          if (session.isCurrent) 'current',
                          session.ipAddress,
                          session.lastSeenAt.toLocal().toString(),
                        ].whereType<String>().join(' · '),
                      ),
                      trailing: IconButton(
                        icon: const Icon(Icons.logout),
                        onPressed: () => _revoke(session),
                      ),
                    ),
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    AppStrings.loginHistory,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  for (final row in _history)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(row.result),
                      subtitle: Text(
                        [
                          row.deviceName,
                          row.ipAddress,
                          row.failureReason,
                          row.createdAt.toLocal().toString(),
                        ].whereType<String>().join(' · '),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}
