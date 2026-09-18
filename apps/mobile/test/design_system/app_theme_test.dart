import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/design_system/theme/app_theme.dart';

void main() {
  test('themes enable Material 3', () {
    expect(AppTheme.light().useMaterial3, isTrue);
    expect(AppTheme.dark().useMaterial3, isTrue);
  });
}
