import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../rbac/application/rbac_controller.dart';
import '../../rbac/domain/rbac_models.dart';
import '../application/staff_providers.dart';
import '../domain/staff_models.dart';

class StaffFormPage extends ConsumerStatefulWidget {
  const StaffFormPage({super.key, this.staffId});

  final String? staffId;

  @override
  ConsumerState<StaffFormPage> createState() => _StaffFormPageState();
}

class _StaffFormPageState extends ConsumerState<StaffFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _designation = TextEditingController();
  final _employeeCode = TextEditingController();
  final _selectedRoles = <String>{};
  final _selectedTeams = <String>{};
  List<RbacRole> _roles = const [];
  List<StaffTeam> _teams = const [];
  var _loading = true;
  var _submitting = false;
  String? _error;

  bool get _isEdit => widget.staffId != null;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _designation.dispose();
    _employeeCode.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final roles = await ref.read(rbacRepositoryProvider).listRoles();
    final teams = unwrapApi<List<StaffTeam>>(await ref.read(staffApiProvider).listTeams());
    StaffMember? existing;
    if (widget.staffId != null) {
      final loaded = unwrapApi<StaffMember>(
        await ref.read(staffApiProvider).getStaff(widget.staffId!),
      );
      if (loaded is Success<StaffMember>) {
        existing = loaded.value;
      } else if (loaded is Err<StaffMember>) {
        _error = loaded.failure.message;
      }
    }
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      if (roles is Success<List<RbacRole>>) {
        _roles = roles.value;
      } else if (roles is Err<List<RbacRole>>) {
        _error = roles.failure.message;
      }
      if (teams is Success<List<StaffTeam>>) {
        _teams = teams.value;
      }
      if (existing != null) {
        _name.text = existing.fullName;
        _email.text = existing.email ?? '';
        _designation.text = existing.designation ?? '';
        _employeeCode.text = existing.employeeCode ?? '';
        _selectedRoles.addAll(existing.roles.map((role) => role.id));
        _selectedTeams.addAll(existing.teams.map((team) => team.id));
      }
    });
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false) || _selectedRoles.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one role')),
      );
      return;
    }
    setState(() => _submitting = true);
    final api = ref.read(staffApiProvider);
    final result = widget.staffId == null
        ? unwrapApi<StaffMember>(
            await api.createStaff(
              email: _email.text.trim(),
              fullName: _name.text.trim(),
              roleIds: _selectedRoles.toList(),
              designation: _designation.text.trim(),
              employeeCode: _employeeCode.text.trim(),
              teamIds: _selectedTeams.toList(),
            ),
          )
        : unwrapApi<StaffMember>(
            await api.updateStaff(
              id: widget.staffId!,
              email: _email.text.trim(),
              fullName: _name.text.trim(),
              designation: _designation.text.trim(),
              employeeCode: _employeeCode.text.trim(),
              roleIds: _selectedRoles.toList(),
              teamIds: _selectedTeams.toList(),
            ),
          );
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
    if (context.mounted) {
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: _isEdit ? AppStrings.editStaff : AppStrings.createStaff,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(child: Text(_error!))
          : Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Form(
                key: _formKey,
                child: ListView(
                  children: [
                    AppTextField(
                      controller: _name,
                      label: AppStrings.fullName,
                      validator: (value) =>
                          value == null || value.trim().length < 2
                          ? 'Name is required'
                          : null,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      controller: _email,
                      label: AppStrings.email,
                      keyboardType: TextInputType.emailAddress,
                      validator: (value) =>
                          value == null || !value.contains('@')
                          ? 'Email is required'
                          : null,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      controller: _designation,
                      label: AppStrings.designation,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      controller: _employeeCode,
                      label: AppStrings.employeeCode,
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text(AppStrings.assignRoles, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: AppSpacing.sm),
                    Wrap(
                      spacing: AppSpacing.xs,
                      children: [
                        for (final role in _roles)
                          FilterChip(
                            label: Text(role.name),
                            selected: _selectedRoles.contains(role.id),
                            onSelected: (selected) {
                              setState(() {
                                if (selected) {
                                  _selectedRoles.add(role.id);
                                } else {
                                  _selectedRoles.remove(role.id);
                                }
                              });
                            },
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text(AppStrings.teams, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: AppSpacing.sm),
                    Wrap(
                      spacing: AppSpacing.xs,
                      children: [
                        for (final team in _teams)
                          FilterChip(
                            label: Text(team.name),
                            selected: _selectedTeams.contains(team.id),
                            onSelected: (selected) {
                              setState(() {
                                if (selected) {
                                  _selectedTeams.add(team.id);
                                } else {
                                  _selectedTeams.remove(team.id);
                                }
                              });
                            },
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    AppButton(
                      label: _isEdit ? AppStrings.saveStaff : AppStrings.createStaff,
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
