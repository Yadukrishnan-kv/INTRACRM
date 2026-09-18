import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/auth_controller.dart';
import '../domain/password_rules.dart';

class ChangePasswordPage extends ConsumerStatefulWidget {
  const ChangePasswordPage({super.key});

  @override
  ConsumerState<ChangePasswordPage> createState() => _ChangePasswordPageState();
}

class _ChangePasswordPageState extends ConsumerState<ChangePasswordPage> {
  final _formKey = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  var _submitting = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    setState(() => _submitting = true);
    final result = await ref.read(authControllerProvider.notifier).changePassword(
      currentPassword: _current.text,
      newPassword: _next.text,
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
    if (!context.mounted) {
      return;
    }
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text(AppStrings.passwordChanged)));
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final email = ref.watch(authControllerProvider).user?.email;
    return AppScaffold(
      title: AppStrings.changePassword,
      body: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              AppTextField(
                controller: _current,
                label: AppStrings.currentPassword,
                obscureText: true,
                validator: (value) =>
                    value == null || value.isEmpty ? 'Current password is required' : null,
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _next,
                label: AppStrings.newPassword,
                obscureText: true,
                validator: (value) => PasswordRules.validate(value, email: email),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: AppStrings.changePassword,
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
