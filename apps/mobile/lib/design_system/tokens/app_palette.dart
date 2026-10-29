import 'package:flutter/material.dart';

/// Brightness-aware surface and text tones.
///
/// [AppColors] holds brand constants that are the same in both themes. The
/// tones here differ per brightness, so widgets must read them from the theme
/// rather than referencing the light constants directly.
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.canvas,
    required this.card,
    required this.tealSoft,
    required this.muted,
    required this.successSurface,
    required this.dangerSurface,
    required this.warningSurface,
    required this.infoSurface,
  });

  final Color canvas;
  final Color card;
  final Color tealSoft;
  final Color muted;
  final Color successSurface;
  final Color dangerSurface;
  final Color warningSurface;
  final Color infoSurface;

  static const light = AppPalette(
    canvas: Color(0xFFF3F6F5),
    card: Color(0xFFFFFFFF),
    tealSoft: Color(0xFFE6F3F0),
    muted: Color(0xFF5F6B68),
    successSurface: Color(0xFFE4F5EC),
    dangerSurface: Color(0xFFFDECEA),
    warningSurface: Color(0xFFFDF3E0),
    infoSurface: Color(0xFFE8F0FE),
  );

  static const dark = AppPalette(
    canvas: Color(0xFF101614),
    card: Color(0xFF17201D),
    tealSoft: Color(0xFF17352E),
    muted: Color(0xFF9FADA9),
    successSurface: Color(0xFF12301F),
    dangerSurface: Color(0xFF3A1A18),
    warningSurface: Color(0xFF382A10),
    infoSurface: Color(0xFF15254A),
  );

  static AppPalette of(BuildContext context) =>
      Theme.of(context).extension<AppPalette>() ?? light;

  @override
  AppPalette copyWith({
    Color? canvas,
    Color? card,
    Color? tealSoft,
    Color? muted,
    Color? successSurface,
    Color? dangerSurface,
    Color? warningSurface,
    Color? infoSurface,
  }) {
    return AppPalette(
      canvas: canvas ?? this.canvas,
      card: card ?? this.card,
      tealSoft: tealSoft ?? this.tealSoft,
      muted: muted ?? this.muted,
      successSurface: successSurface ?? this.successSurface,
      dangerSurface: dangerSurface ?? this.dangerSurface,
      warningSurface: warningSurface ?? this.warningSurface,
      infoSurface: infoSurface ?? this.infoSurface,
    );
  }

  @override
  AppPalette lerp(ThemeExtension<AppPalette>? other, double t) {
    if (other is! AppPalette) {
      return this;
    }
    return AppPalette(
      canvas: Color.lerp(canvas, other.canvas, t)!,
      card: Color.lerp(card, other.card, t)!,
      tealSoft: Color.lerp(tealSoft, other.tealSoft, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      successSurface: Color.lerp(successSurface, other.successSurface, t)!,
      dangerSurface: Color.lerp(dangerSurface, other.dangerSurface, t)!,
      warningSurface: Color.lerp(warningSurface, other.warningSurface, t)!,
      infoSurface: Color.lerp(infoSurface, other.infoSurface, t)!,
    );
  }
}

/// Reads the brightness-aware palette for the ambient theme.
extension AppPaletteContext on BuildContext {
  AppPalette get palette => AppPalette.of(this);
}
