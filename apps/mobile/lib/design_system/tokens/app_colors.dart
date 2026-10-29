import 'package:flutter/material.dart';

import 'app_palette.dart';

class AppColors {
  static const seed = Color(0xFF0B6B5A);
  static const tealDark = Color(0xFF085547);
  static const teal = Color(0xFF0B6B5A);
  static const tealSoft = Color(0xFFE6F3F0);
  static const canvas = Color(0xFFF3F6F5);
  static const card = Color(0xFFFFFFFF);
  static const success = Color(0xFF1B7F4E);
  static const warning = Color(0xFFE08A00);
  static const danger = Color(0xFFC62828);
  static const info = Color(0xFF2F6FED);
  static const muted = Color(0xFF5F6B68);
}

class StatusTone {
  const StatusTone({required this.foreground, required this.background});

  final Color foreground;
  final Color background;

  /// Resolves a status tone against [palette] so the surface follows the
  /// ambient brightness while the foreground stays a brand constant.
  static StatusTone forLabel(String raw, AppPalette palette) {
    final value = raw.toLowerCase();
    if (value.contains('won') || value.contains('qualified') || value.contains('active') || value.contains('paid')) {
      return StatusTone(foreground: AppColors.success, background: palette.successSurface);
    }
    if (value.contains('lost') || value.contains('overdue') || value.contains('void') || value.contains('dead')) {
      return StatusTone(foreground: AppColors.danger, background: palette.dangerSurface);
    }
    if (value.contains('contact') ||
        value.contains('negotiat') ||
        value.contains('follow') ||
        value.contains('pending') ||
        value.contains('today') ||
        value.contains('warm')) {
      return StatusTone(foreground: AppColors.warning, background: palette.warningSurface);
    }
    if (value.contains('new') || value.contains('quote') || value.contains('hot') || value.contains('vip')) {
      return StatusTone(foreground: AppColors.info, background: palette.infoSurface);
    }
    return StatusTone(foreground: AppColors.teal, background: palette.tealSoft);
  }
}
