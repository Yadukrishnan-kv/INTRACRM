import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/rbac_controller.dart';
import '../domain/rbac_models.dart';

class MemberRolesPage extends ConsumerStatefulWidget {
  const MemberRolesPage({super.key, required this.membership});

  final RbacMembership membership;

  @override
  ConsumerState<MemberRolesPage> createState() => _MemberRolesPageState();
}

class _MemberRolesPageState extends ConsumerState<MemberRolesPage> {
  List<RbacRole> _roles = const [];
  late Set<String> _selected;
  var _loading = true;
  var _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _selected = widget.membership.roles.map((role) => role.id).toSet();
    _load();
  }

  Future<void> _load() async {
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

  Future<void> _save() async {
    if (_selected.isEmpty) {
      return;
    }
    setState(() => _saving = true);
    final result = await ref.read(rbacRepositoryProvider).assignRoles(
      membershipId: widget.membership.id,
      roleIds: _selected.toList(),
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
    if (context.mounted) {
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: widget.membership.fullName,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(child: Text(_error!))
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                Text(
                  widget.membership.email ?? widget.membership.userId,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: AppSpacing.md),
                for (final role in _roles)
                  CheckboxListTile(
                    title: Text(role.name),
                    subtitle: Text(role.code),
                    value: _selected.contains(role.id),
                    onChanged: (checked) {
                      setState(() {
                        if (checked == true) {
                          _selected.add(role.id);
                        } else {
                          _selected.remove(role.id);
                        }
                      });
                    },
                  ),
                const SizedBox(height: AppSpacing.lg),
                AppButton(
                  label: AppStrings.saveRoles,
                  loading: _saving,
                  onPressed: _save,
                ),
              ],
            ),
    );
  }
}
