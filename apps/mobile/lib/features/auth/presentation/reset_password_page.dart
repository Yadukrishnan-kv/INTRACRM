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
import '../application/auth_controller.dart';
import '../domain/password_rules.dart';

class ResetPasswordPage extends ConsumerStatefulWidget {
  const ResetPasswordPage({super.key, this.email = ''});

  final String email;

  @override
  ConsumerState<ResetPasswordPage> createState() => _ResetPasswordPageState();
}

class _ResetPasswordPageState extends ConsumerState<ResetPasswordPage> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _email;
  final _otp = TextEditingController();
  final _password = TextEditingController();
  var _submitting = false;

  @override
  void initState() {
    super.initState();
    _email = TextEditingController(text: widget.email);
  }

  @override
  void dispose() {
    _email.dispose();
    _otp.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    setState(() => _submitting = true);
    final result = await ref.read(authControllerProvider.notifier).resetPassword(
      email: _email.text.trim(),
      otp: _otp.text.trim(),
      newPassword: _password.text,
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
    ).showSnackBar(const SnackBar(content: Text(AppStrings.passwordReset)));
    context.go(AppRoutes.login);
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
              AppTextField(
                controller: _email,
                label: AppStrings.email,
                keyboardType: TextInputType.emailAddress,
                validator: (value) =>
                    value == null || value.isEmpty ? 'Email is required' : null,
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _otp,
                label: AppStrings.resetCode,
                keyboardType: TextInputType.number,
                validator: (value) =>
                    value == null || value.length != 6 ? 'Enter the 6-digit code' : null,
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _password,
                label: AppStrings.newPassword,
                obscureText: true,
                validator: (value) =>
                    PasswordRules.validate(value, email: _email.text.trim()),
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
