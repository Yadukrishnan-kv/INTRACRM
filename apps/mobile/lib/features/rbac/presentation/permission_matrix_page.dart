import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/rbac_controller.dart';
import '../domain/rbac_models.dart';

class PermissionMatrixPage extends ConsumerStatefulWidget {
  const PermissionMatrixPage({super.key});

  @override
  ConsumerState<PermissionMatrixPage> createState() => _PermissionMatrixPageState();
}

class _PermissionMatrixPageState extends ConsumerState<PermissionMatrixPage> {
  var _loading = true;
  String? _error;
  PermissionMatrix? _matrix;
  final Map<String, Set<String>> _draft = {};
  var _saving = false;

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
    final result = await ref.read(rbacRepositoryProvider).matrix();
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final value):
          _matrix = value;
          _draft
            ..clear()
            ..addEntries(
              value.roles.map(
                (role) => MapEntry(role.id, role.permissionCodes.toSet()),
              ),
            );
        case Err(:final failure):
          _error = failure.message;
      }
    });
  }

  Future<void> _toggle(RbacRole role, String permission) async {
    if (role.isSystem) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(AppStrings.systemRoleLocked)),
      );
      return;
    }
    final next = {...(_draft[role.id] ?? <String>{})};
    if (next.contains(permission)) {
      next.remove(permission);
    } else {
      next.add(permission);
    }
    setState(() {
      _draft[role.id] = next;
      _saving = true;
    });
    final result = await ref.read(rbacRepositoryProvider).replacePermissions(
      roleId: role.id,
      permissionCodes: next.toList(),
    );
    if (!mounted) {
      return;
    }
    setState(() => _saving = false);
    if (result is Err) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(result.failure.message)));
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final matrix = _matrix;
    return AppScaffold(
      title: AppStrings.permissionMatrix,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(child: Text(_error!))
          : matrix == null
          ? const SizedBox.shrink()
          : Column(
              children: [
                if (_saving) const LinearProgressIndicator(),
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      child: DataTable(
                        columns: [
                          const DataColumn(label: Text('Permission')),
                          for (final role in matrix.roles)
                            DataColumn(label: Text(role.name)),
                        ],
                        rows: [
                          for (final permission in matrix.permissions)
                            DataRow(
                              cells: [
                                DataCell(
                                  Text(
                                    permission.code,
                                    style: Theme.of(context).textTheme.bodySmall,
                                  ),
                                ),
                                for (final role in matrix.roles)
                                  DataCell(
                                    Checkbox(
                                      value:
                                          _draft[role.id]?.contains(permission.code) ??
                                          false,
                                      onChanged: (_) => _toggle(role, permission.code),
                                    ),
                                  ),
                              ],
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
