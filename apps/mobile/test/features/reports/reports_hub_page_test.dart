import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/design_system/theme/app_theme.dart';
import 'package:intra_leads/features/auth/application/auth_controller.dart';
import 'package:intra_leads/features/auth/domain/auth_user.dart';
import 'package:intra_leads/features/reports/presentation/reports_hub_page.dart';
import 'package:intra_leads/l10n/app_strings.dart';

class _FixedAuth extends AuthController {
  _FixedAuth(this._state);

  final AuthState _state;

  @override
  AuthState build() => _state;
}

Future<void> _pump(WidgetTester tester, List<String> permissions) async {
  final user = AuthUser(
    id: 'u1',
    fullName: 'Test',
    email: 't@example.com',
    tenantId: 't1',
    permissions: permissions,
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authControllerProvider.overrideWith(
          () => _FixedAuth(AuthState(status: AuthStatus.authenticated, user: user)),
        ),
      ],
      child: MaterialApp(theme: AppTheme.light(), home: const ReportsHubPage()),
    ),
  );
}

void main() {
  testWidgets('staff, target and warranty reports show with their permissions', (tester) async {
    await _pump(tester, ['tenant:manage_users', 'target:read', 'warranty:read']);

    expect(find.text(AppStrings.staffReport), findsOneWidget);
    await tester.scrollUntilVisible(find.text(AppStrings.targetReport), 200);
    expect(find.text(AppStrings.targetReport), findsOneWidget);
    await tester.scrollUntilVisible(find.text(AppStrings.warrantyReport), 200);
    expect(find.text(AppStrings.warrantyReport), findsOneWidget);
  });

  testWidgets('those reports are hidden without the permissions', (tester) async {
    await _pump(tester, ['lead:read']);

    expect(find.text(AppStrings.leadReport), findsOneWidget);
    expect(find.text(AppStrings.staffReport), findsNothing);
    expect(find.text(AppStrings.targetReport), findsNothing);
    expect(find.text(AppStrings.warrantyReport), findsNothing);
  });
}
