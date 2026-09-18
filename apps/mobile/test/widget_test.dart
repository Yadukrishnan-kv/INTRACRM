import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/design_system/theme/app_theme.dart';

void main() {
  test('app theme is configured', () {
    expect(AppTheme.light().useMaterial3, isTrue);
  });
}
