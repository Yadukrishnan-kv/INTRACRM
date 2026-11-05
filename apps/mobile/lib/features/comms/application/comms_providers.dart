import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../core/logging/app_logger.dart';
import '../../../core/network/api_envelope.dart';
import '../data/comms_api.dart';

final commsApiProvider = Provider<CommsApi>((ref) {
  return CommsApi(ref.watch(apiClientProvider));
});

final commsLauncherProvider = Provider<CommsLauncher>((ref) {
  return const CommsLauncher();
});

Result<T> unwrapComms<T>(Result<ApiSuccess<T>> result) =>
    unwrapEnvelope(result);

class CommsLauncher {
  const CommsLauncher({AppLogger logger = const AppLogger()}) : _logger = logger;

  final AppLogger _logger;

  /// Schemes this launcher is expected to open: `tel:` for click-to-call,
  /// `sms:`/`smsto:` for device SMS, `https:` for `wa.me` chat deep links
  /// (all built by the comms API), and `whatsapp:` for the client-built
  /// `whatsapp://call?phone=` voice-call deep link.
  ///
  /// `http` is deliberately absent -- the flavor already refuses cleartext
  /// outside dev, and a launch URI is no place to reintroduce it.
  static const _launchableSchemes = <String>{'tel', 'sms', 'smsto', 'https', 'whatsapp'};

  /// Opens a `tel:`, `sms:`, `https://wa.me/` or `whatsapp://call` URI.
  ///
  /// `launchUrl` returns false *or* throws a [PlatformException] depending on
  /// how it fails, so both are folded into a single false here and the caller
  /// shows one message instead of an unhandled async error reaching the UI.
  ///
  /// Most of these URIs are chosen by the server; the `whatsapp://call` one
  /// is built on-device. Either way the scheme is checked against
  /// [_launchableSchemes] rather than launched on trust: a wrong or tampered
  /// URI must not be able to make the app open an arbitrary `intent:`,
  /// `file:` or `market:` target. A URI with no scheme fails the same check
  /// instead of reaching the platform.
  Future<bool> open(String uri) async {
    final Uri parsed;
    try {
      parsed = Uri.parse(uri);
    } on FormatException catch (error) {
      // AppLogger.error is not gated on kDebugMode, so the URI itself stays
      // out of the message: it carries the customer's phone number, which
      // does not belong in a shipped binary's device log.
      _logger.error('Comms: cannot parse launch URI: ${error.message}');
      return false;
    }
    if (!_launchableSchemes.contains(parsed.scheme)) {
      _logger.error(
        'Comms: refusing to launch unsupported scheme "${parsed.scheme}"',
      );
      return false;
    }
    try {
      return await launchUrl(parsed, mode: LaunchMode.externalApplication);
    } on PlatformException catch (error) {
      _logger.error('Comms: ${parsed.scheme}: launch failed: ${error.message}');
      return false;
    } on MissingPluginException catch (error) {
      _logger.error('Comms: url_launcher unavailable: ${error.message}');
      return false;
    }
  }
}
