import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/design_system/theme/app_theme.dart';
import 'package:intra_leads/design_system/tokens/app_colors.dart';
import 'package:intra_leads/design_system/tokens/app_palette.dart';

void main() {
  test('both themes carry a palette', () {
    expect(AppTheme.light().extension<AppPalette>(), AppPalette.light);
    expect(AppTheme.dark().extension<AppPalette>(), AppPalette.dark);
  });

  test('light palette preserves the original brand tones', () {
    // These are the values the app shipped before dark mode was fixed; light
    // mode must stay pixel-identical.
    expect(AppPalette.light.canvas, const Color(0xFFF3F6F5));
    expect(AppPalette.light.card, const Color(0xFFFFFFFF));
    expect(AppPalette.light.tealSoft, const Color(0xFFE6F3F0));
    expect(AppPalette.light.muted, const Color(0xFF5F6B68));
  });

  test('dark surfaces are darker than their text', () {
    final scheme = AppTheme.dark().colorScheme;
    for (final surface in <Color>[
      AppPalette.dark.canvas,
      AppPalette.dark.card,
      AppPalette.dark.tealSoft,
      AppPalette.dark.successSurface,
      AppPalette.dark.dangerSurface,
      AppPalette.dark.warningSurface,
      AppPalette.dark.infoSurface,
    ]) {
      expect(
        surface.computeLuminance(),
        lessThan(scheme.onSurface.computeLuminance()),
        reason: 'a dark surface must not be lighter than the text drawn on it',
      );
    }
  });

  test('scaffold background follows the palette in both themes', () {
    expect(AppTheme.light().scaffoldBackgroundColor, AppPalette.light.canvas);
    expect(AppTheme.dark().scaffoldBackgroundColor, AppPalette.dark.canvas);
  });

  test('status tones resolve their surface from the palette', () {
    final won = StatusTone.forLabel('won', AppPalette.dark);
    expect(won.background, AppPalette.dark.successSurface);
    expect(won.foreground, AppColors.success);

    final lost = StatusTone.forLabel('lost', AppPalette.light);
    expect(lost.background, AppPalette.light.dangerSurface);
    expect(lost.foreground, AppColors.danger);
  });

  test('muted text stays readable on the dark card', () {
    // Contrast ratio per WCAG: (L1 + 0.05) / (L2 + 0.05).
    final muted = AppPalette.dark.muted.computeLuminance();
    final card = AppPalette.dark.card.computeLuminance();
    final ratio = (muted + 0.05) / (card + 0.05);
    expect(ratio, greaterThan(4.5));
  });
}
