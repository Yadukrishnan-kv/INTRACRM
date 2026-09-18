import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../application/rbac_controller.dart';
import '../domain/rbac_models.dart';

class MembersPage extends ConsumerStatefulWidget {
  const MembersPage({super.key});

  @override
  ConsumerState<MembersPage> createState() => _MembersPageState();
}

class _MembersPageState extends ConsumerState<MembersPage> {
  var _loading = true;
  String? _error;
  List<RbacMembership> _members = const [];
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
    final repository = ref.read(rbacRepositoryProvider);
    final members = await repository.listMemberships();
    final roles = await repository.listRoles();
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      if (members is Err) {
        _error = members.failure.message;
        return;
      }
      if (roles is Err) {
        _error = roles.failure.message;
        return;
      }
      _members = (members as Success<List<RbacMembership>>).value;
      _roles = (roles as Success<List<RbacRole>>).value;
    });
  }

  Future<void> _invite() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _InviteSheet(roles: _roles),
    );
    if (created == true) {
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: AppStrings.members,
      floatingActionButton: FloatingActionButton(
        onPressed: _roles.isEmpty ? null : _invite,
        child: const Icon(Icons.person_add_alt_1),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(child: Text(_error!))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView.builder(
                itemCount: _members.length,
                itemBuilder: (context, index) {
                  final member = _members[index];
                  return ListTile(
                    title: Text(member.fullName),
                    subtitle: Text(
                      [
                        member.email ?? member.userId,
                        member.status,
                        member.roles.map((role) => role.name).join(', '),
                      ].where((item) => item.isNotEmpty).join(' · '),
                    ),
                    onTap: () async {
                      await context.push(
                        AppRoutes.memberRolesPath(member.id),
                        extra: member,
                      );
                      await _load();
                    },
                  );
                },
              ),
            ),
    );
  }
}

class _InviteSheet extends ConsumerStatefulWidget {
  const _InviteSheet({required this.roles});

  final List<RbacRole> roles;

  @override
  ConsumerState<_InviteSheet> createState() => _InviteSheetState();
}

class _InviteSheetState extends ConsumerState<_InviteSheet> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _name = TextEditingController();
  final _selected = <String>{};
  var _submitting = false;

  @override
  void dispose() {
    _email.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false) || _selected.isEmpty) {
      return;
    }
    setState(() => _submitting = true);
    final result = await ref.read(rbacRepositoryProvider).assignUser(
      email: _email.text.trim(),
      fullName: _name.text.trim(),
      roleIds: _selected.toList(),
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
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: AppSpacing.lg,
        right: AppSpacing.lg,
        top: AppSpacing.lg,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.lg,
      ),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(AppStrings.assignUser, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _name,
                label: AppStrings.fullName,
                validator: (value) =>
                    value == null || value.trim().length < 2 ? 'Name is required' : null,
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _email,
                label: AppStrings.email,
                keyboardType: TextInputType.emailAddress,
                validator: (value) =>
                    value == null || !value.contains('@') ? 'Email is required' : null,
              ),
              const SizedBox(height: AppSpacing.md),
              Wrap(
                spacing: AppSpacing.xs,
                children: [
                  for (final role in widget.roles)
                    FilterChip(
                      label: Text(role.name),
                      selected: _selected.contains(role.id),
                      onSelected: (selected) {
                        setState(() {
                          if (selected) {
                            _selected.add(role.id);
                          } else {
                            _selected.remove(role.id);
                          }
                        });
                      },
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: AppStrings.assignUser,
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
