import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/confirm_dialog.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../application/rbac_controller.dart';
import '../domain/rbac_models.dart';

class RolesPage extends ConsumerStatefulWidget {
  const RolesPage({super.key});

  @override
  ConsumerState<RolesPage> createState() => _RolesPageState();
}

class _RolesPageState extends ConsumerState<RolesPage> {
  var _loading = true;
  String? _error;
  List<RbacRole> _roles = const [];

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
    final result = await ref.read(rbacRepositoryProvider).listRoles();
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final value):
          _roles = value;
        case Err(:final failure):
          _error = failure.message;
      }
    });
  }

  Future<void> _edit(RbacRole role) async {
    final saved = await context.push<bool>(AppRoutes.roleEditPath(role.id));
    if (saved == true && mounted) {
      await _load();
    }
  }

  Future<void> _delete(RbacRole role) async {
    final confirmed = await showConfirmDialog(
      context,
      title: AppStrings.deleteRole,
      message: AppStrings.deleteRoleMessage(role.name),
      confirmLabel: AppStrings.deleteRole,
    );
    if (!confirmed || !mounted) {
      return;
    }
    final result = await ref.read(rbacRepositoryProvider).deleteRole(role.id);
    if (!mounted) {
      return;
    }
    if (result is Err) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.failure.message)));
      return;
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: AppStrings.roles,
      floatingActionButton: FloatingActionButton(
        heroTag: 'fab-roles',
        onPressed: () async {
          await context.push(AppRoutes.roleCreate);
          await _load();
        },
        child: const Icon(Icons.add),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(child: Text(_error!))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView.builder(
                itemCount: _roles.length,
                itemBuilder: (context, index) {
                  final role = _roles[index];
                  return ListTile(
                    title: Text(role.name),
                    subtitle: Text(
                      [
                        role.code,
                        if (role.isSystem) 'system',
                        '${role.permissionCodes.length} permissions',
                      ].join(' · '),
                    ),
                    trailing: role.isSystem
                        ? null
                        : PopupMenuButton<String>(
                            onSelected: (value) {
                              if (value == 'edit') {
                                _edit(role);
                              } else if (value == 'delete') {
                                _delete(role);
                              }
                            },
                            itemBuilder: (context) => const [
                              PopupMenuItem(value: 'edit', child: Text(AppStrings.editRole)),
                              PopupMenuItem(value: 'delete', child: Text(AppStrings.deleteRole)),
                            ],
                          ),
                    onTap: role.isSystem
                        ? () => context.push(AppRoutes.permissionMatrix)
                        : () => _edit(role),
                  );
                },
              ),
            ),
    );
  }
}
