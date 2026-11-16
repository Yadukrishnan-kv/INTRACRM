import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:in_app_update/in_app_update.dart';

import '../../l10n/app_strings.dart';
import '../logging/app_logger.dart';

/// What the Play Store reports about this install.
enum PlayUpdateState { none, available, downloaded }

/// Thin seam over Google Play's in-app update API so the gate can be tested.
class PlayUpdateClient {
  const PlayUpdateClient();

  /// Play in-app updates only exist on Android builds installed from Play.
  bool get isSupported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Future<PlayUpdateState> check() async {
    final info = await InAppUpdate.checkForUpdate();
    if (info.installStatus == InstallStatus.downloaded) {
      return PlayUpdateState.downloaded;
    }
    final available =
        info.updateAvailability == UpdateAvailability.updateAvailable &&
        (info.flexibleUpdateAllowed || info.immediateUpdateAllowed);
    _preferFlexible = info.flexibleUpdateAllowed;
    return available ? PlayUpdateState.available : PlayUpdateState.none;
  }

  static bool _preferFlexible = true;

  /// Shows Play's own update prompt. Returns true once the update has been
  /// downloaded in the background and is waiting for a restart to install.
  Future<bool> startUpdate() async {
    if (!_preferFlexible) {
      // Play takes over the screen and restarts the app itself.
      await InAppUpdate.performImmediateUpdate();
      return false;
    }
    final result = await InAppUpdate.startFlexibleUpdate();
    return result == AppUpdateResult.success;
  }

  Future<void> install() => InAppUpdate.completeFlexibleUpdate();
}

/// Checks the Play Store for a newer version on launch and whenever the app
/// returns to the foreground. When one exists, Play's update prompt pops up;
/// the download runs in the background and a snackbar offers the restart.
class AppUpdateGate extends StatefulWidget {
  const AppUpdateGate({
    super.key,
    required this.child,
    this.client = const PlayUpdateClient(),
  });

  final Widget child;
  final PlayUpdateClient client;

  @override
  State<AppUpdateGate> createState() => _AppUpdateGateState();
}

class _AppUpdateGateState extends State<AppUpdateGate> with WidgetsBindingObserver {
  static const _logger = AppLogger();

  bool _busy = false;

  /// Set when the user dismisses Play's prompt, so it is not shown again on
  /// every resume. It comes back on the next cold start.
  bool _declined = false;
  bool _restartOffered = false;

  @override
  void initState() {
    super.initState();
    if (!widget.client.isSupported) {
      return;
    }
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _check();
    }
  }

  Future<void> _check() async {
    // Play's prompt is its own activity, so the app "resumes" when it closes;
    // _busy keeps that from starting a second flow.
    if (_busy) {
      return;
    }
    _busy = true;
    try {
      final state = await widget.client.check();
      if (state == PlayUpdateState.downloaded) {
        _offerRestart();
      } else if (state == PlayUpdateState.available && !_declined) {
        final downloaded = await widget.client.startUpdate();
        if (downloaded) {
          _offerRestart();
        } else {
          _declined = true;
        }
      }
    } on Exception catch (error) {
      // Sideloaded/debug builds, no Play Services, offline: nothing to do.
      _logger.debug('In-app update check skipped', error);
    } finally {
      _busy = false;
    }
  }

  void _offerRestart() {
    if (!mounted || _restartOffered) {
      return;
    }
    _restartOffered = true;
    ScaffoldMessenger.of(context)
        .showSnackBar(
          SnackBar(
            content: const Text(AppStrings.updateDownloaded),
            duration: const Duration(days: 1),
            action: SnackBarAction(
              label: AppStrings.restartToUpdate,
              onPressed: () async {
                try {
                  await widget.client.install();
                } on Exception catch (error) {
                  _logger.error('In-app update install failed', error);
                }
              },
            ),
          ),
        )
        .closed
        .then((_) => _restartOffered = false);
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
