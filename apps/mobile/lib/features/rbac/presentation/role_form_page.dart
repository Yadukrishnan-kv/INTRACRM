import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/rbac_controller.dart';

class RoleFormPage extends ConsumerStatefulWidget {
  const RoleFormPage({super.key});

  @override
  ConsumerState<RoleFormPage> createState() => _RoleFormPageState();
}

class _RoleFormPageState extends ConsumerState<RoleFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _code = TextEditingController();
  final _name = TextEditingController();
  final _description = TextEditingController();
  var _submitting = false;

  @override
  void dispose() {
    _code.dispose();
    _name.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    setState(() => _submitting = true);
    final result = await ref.read(rbacRepositoryProvider).createRole(
      code: _code.text.trim(),
      name: _name.text.trim(),
      description: _description.text.trim(),
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
      title: AppStrings.createRole,
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
              AppButton(
                label: AppStrings.createRole,
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
