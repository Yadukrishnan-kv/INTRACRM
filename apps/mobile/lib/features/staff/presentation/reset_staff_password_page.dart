import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../auth/domain/password_rules.dart';
import '../application/staff_providers.dart';

/// Admin-initiated password reset for another staff member.
class ResetStaffPasswordPage extends ConsumerStatefulWidget {
  const ResetStaffPasswordPage({
    super.key,
    required this.staffId,
    this.email,
  });

  final String staffId;
  final String? email;

  @override
  ConsumerState<ResetStaffPasswordPage> createState() => _ResetStaffPasswordPageState();
}

class _ResetStaffPasswordPageState extends ConsumerState<ResetStaffPasswordPage> {
  final _formKey = GlobalKey<FormState>();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  var _submitting = false;

  @override
  void dispose() {
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    setState(() => _submitting = true);
    final result = unwrapApi<Object?>(
      await ref.read(staffApiProvider).resetPassword(
            id: widget.staffId,
            newPassword: _next.text,
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
    if (!context.mounted) {
      return;
    }
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text(AppStrings.staffPasswordReset)));
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: AppStrings.resetPassword,
      body: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              const Text(AppStrings.resetStaffPasswordMessage),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(
                controller: _next,
                label: AppStrings.newPassword,
                obscureText: true,
                validator: (value) => PasswordRules.validate(value, email: widget.email),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _confirm,
                label: AppStrings.confirmNewPassword,
                obscureText: true,
                validator: (value) =>
                    value != _next.text ? AppStrings.passwordsDoNotMatch : null,
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: AppStrings.resetPassword,
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
