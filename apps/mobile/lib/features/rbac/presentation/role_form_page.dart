import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_loading.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/rbac_controller.dart';
import '../domain/rbac_models.dart';

/// Creates a role, or edits one (rename + permissions) when [roleId] is set.
class RoleFormPage extends ConsumerStatefulWidget {
  const RoleFormPage({super.key, this.roleId});

  final String? roleId;

  @override
  ConsumerState<RoleFormPage> createState() => _RoleFormPageState();
}

class _RoleFormPageState extends ConsumerState<RoleFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _code = TextEditingController();
  final _name = TextEditingController();
  final _description = TextEditingController();
  final _selected = <String>{};
  List<RbacPermission> _permissions = const [];
  RbacRole? _existing;
  var _loading = true;
  var _submitting = false;
  String? _error;

  bool get _isEdit => widget.roleId != null;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _code.dispose();
    _name.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final repository = ref.read(rbacRepositoryProvider);
    final permissions = await repository.listPermissions();
    final role = _isEdit ? await repository.getRole(widget.roleId!) : null;
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (permissions) {
        case Success(:final value):
          _permissions = value;
        case Err(:final failure):
          _error = failure.message;
      }
      switch (role) {
        case Success(:final value):
          _existing = value;
          _code.text = value.code;
          _name.text = value.name;
          _description.text = value.description ?? '';
          _selected.addAll(value.permissionCodes);
        case Err(:final failure):
          _error = failure.message;
        case null:
          break;
      }
    });
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    setState(() => _submitting = true);
    final repository = ref.read(rbacRepositoryProvider);
    final existing = _existing;
    Result<RbacRole> result;
    if (existing == null) {
      result = await repository.createRole(
        code: _code.text.trim(),
        name: _name.text.trim(),
        description: _description.text.trim(),
        permissionCodes: _selected.toList(),
      );
    } else {
      result = await repository.updateRole(
        roleId: existing.id,
        name: _name.text.trim(),
        description: _description.text.trim(),
      );
      final changed = _selected.length != existing.permissionCodes.length ||
          !_selected.containsAll(existing.permissionCodes);
      if (result is Success && changed) {
        result = await repository.replacePermissions(
          roleId: existing.id,
          permissionCodes: _selected.toList(),
        );
      }
    }
    if (!mounted) {
      return;
    }
    setState(() => _submitting = false);
    if (result is Err) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(result.failure.message)));
      return;
    }
    context.pop(true);
  }

  Map<String, List<RbacPermission>> get _byResource {
    final groups = <String, List<RbacPermission>>{};
    for (final permission in _permissions) {
      groups.putIfAbsent(permission.resource, () => []).add(permission);
    }
    return groups;
  }

  @override
  Widget build(BuildContext context) {
    final title = _isEdit ? AppStrings.editRole : AppStrings.createRole;
    if (_loading) {
      return AppScaffold(title: title, body: const AppLoading());
    }
    if (_isEdit && _existing == null) {
      return AppScaffold(title: title, body: Center(child: Text(_error ?? '')));
    }
    return AppScaffold(
      title: title,
      body: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              AppTextField(
                controller: _name,
                label: AppStrings.roleName,
                validator: (value) =>
                    value == null || value.trim().length < 2 ? 'Name is required' : null,
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _code,
                label: AppStrings.roleCode,
                enabled: !_isEdit,
                validator: (value) {
                  final code = value?.trim() ?? '';
                  if (!RegExp(r'^[a-z][a-z0-9_.]*$').hasMatch(code)) {
                    return 'Use lowercase letters, numbers, dots, or underscores.';
                  }
                  return null;
                },
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _description,
                label: AppStrings.description,
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(AppStrings.permissions, style: Theme.of(context).textTheme.titleMedium),
              if (_error != null) Text(_error!),
              for (final entry in _byResource.entries) ...[
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Text(entry.key, style: Theme.of(context).textTheme.labelLarge),
                ),
                for (final permission in entry.value)
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text(permission.code),
                    subtitle: permission.description == null
                        ? null
                        : Text(permission.description!),
                    value: _selected.contains(permission.code),
                    onChanged: (checked) => setState(() {
                      if (checked == true) {
                        _selected.add(permission.code);
                      } else {
                        _selected.remove(permission.code);
                      }
                    }),
                  ),
              ],
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: _isEdit ? AppStrings.save : AppStrings.createRole,
                loading: _submitting,
                onPressed: _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
