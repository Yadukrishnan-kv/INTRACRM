import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/confirm_dialog.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../auth/application/auth_controller.dart';
import '../application/staff_providers.dart';
import '../domain/staff_models.dart';

class StaffDetailPage extends ConsumerStatefulWidget {
  const StaffDetailPage({super.key, required this.staffId});

  final String staffId;

  @override
  ConsumerState<StaffDetailPage> createState() => _StaffDetailPageState();
}

class _StaffDetailPageState extends ConsumerState<StaffDetailPage> {
  StaffMember? _staff;
  var _loading = true;
  var _saving = false;
  String? _error;

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
    final result = unwrapApi<StaffMember>(
      await ref.read(staffApiProvider).getStaff(widget.staffId),
    );
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final value):
          _staff = value;
        case Err(:final failure):
          _error = failure.message;
      }
    });
  }

  Future<void> _toggle() async {
    final staff = _staff;
    if (staff == null) {
      return;
    }
    setState(() => _saving = true);
    final result = unwrapApi<StaffMember>(
      await ref.read(staffApiProvider).setActive(id: staff.id, active: !staff.active),
    );
    if (!mounted) {
      return;
    }
    setState(() => _saving = false);
    if (result is Err) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(result.failure.message)));
      return;
    }
    await _load();
  }

  Future<void> _remove(StaffMember staff) async {
    final confirmed = await showConfirmDialog(
      context,
      title: AppStrings.removeFromWorkspace,
      message: AppStrings.removeFromWorkspaceMessage(staff.fullName),
      confirmLabel: AppStrings.removeFromWorkspace,
    );
    if (!confirmed || !mounted) {
      return;
    }
    setState(() => _saving = true);
    final result = unwrapApi<Object?>(
      await ref.read(staffApiProvider).removeStaff(staff.id),
    );
    if (!mounted) {
      return;
    }
    setState(() => _saving = false);
    if (result is Err) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(result.failure.message)));
      return;
    }
    context.pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final staff = _staff;
    final user = ref.watch(authControllerProvider).user;
    final canReadPerformance = user?.canReadPerformance == true;
    final isSelf = staff?.isCurrentUser(user) == true;
    return AppScaffold(
      title: staff?.fullName ?? AppStrings.staff,
      actions: [
        IconButton(
          onPressed: staff == null
              ? null
              : () async {
                  await context.push(AppRoutes.staffEditPath(staff.id));
                  await _load();
                },
          icon: const Icon(Icons.edit),
        ),
      ],
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(child: Text(_error!))
          : staff == null
          ? const SizedBox.shrink()
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                if (_saving) const LinearProgressIndicator(),
                ListTile(
                  title: const Text(AppStrings.email),
                  subtitle: Text(staff.email ?? '—'),
                ),
                ListTile(
                  title: const Text(AppStrings.designation),
                  subtitle: Text(staff.designation ?? '—'),
                ),
                ListTile(
                  title: const Text(AppStrings.employeeCode),
                  subtitle: Text(staff.employeeCode ?? '—'),
                ),
                ListTile(
                  title: const Text(AppStrings.assignRoles),
                  subtitle: Text(
                    staff.roles.map((role) => role.name).join(', ').ifEmpty('—'),
                  ),
                ),
                ListTile(
                  title: const Text(AppStrings.teams),
                  subtitle: Text(
                    staff.teams.map((team) => team.name).join(', ').ifEmpty('—'),
                  ),
                ),
                if (canReadPerformance)
                  ListTile(
                    title: const Text(AppStrings.staffPerformance),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push(AppRoutes.performanceDetailPath(staff.id)),
                  ),
                if (isSelf)
                  ListTile(
                    title: Text(staff.active ? AppStrings.active : AppStrings.inactive),
                    subtitle: const Text(AppStrings.cannotDeactivateSelf),
                  )
                else
                  SwitchListTile(
                    title: Text(staff.active ? AppStrings.active : AppStrings.inactive),
                    value: staff.active,
                    onChanged: _saving ? null : (_) => _toggle(),
                  ),
                if (!isSelf && user?.canManageUsers == true)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.md),
                    child: OutlinedButton.icon(
                      onPressed: _saving
                          ? null
                          : () => context.push(
                              AppRoutes.staffResetPasswordPath(staff.id, email: staff.email),
                            ),
                      icon: const Icon(Icons.lock_reset_outlined),
                      label: const Text(AppStrings.resetPassword),
                    ),
                  ),
                if (!isSelf && user?.canManageUsers == true)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.md),
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Theme.of(context).colorScheme.error,
                      ),
                      onPressed: _saving ? null : () => _remove(staff),
                      icon: const Icon(Icons.person_remove_outlined),
                      label: const Text(AppStrings.removeFromWorkspace),
                    ),
                  ),
              ],
            ),
    );
  }
}

extension on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}
