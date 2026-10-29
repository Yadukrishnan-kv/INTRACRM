import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../../../core/auth/token_store.dart';
import '../data/notifications_api.dart';
import '../domain/notification_target.dart';
import 'push_platform.dart';

/// FCM background isolate entry point.
///
/// The backend always sends a `notification` block, so the OS renders the
/// alert itself and this handler does not need to display anything. It exists
/// because firebase_messaging requires a registered background handler to set
/// up the background isolate; taps are routed on resume by [PushNotificationService]
/// through onMessageOpenedApp / getInitialMessage.
@pragma('vm:entry-point')
Future<void> handleBackgroundMessage(RemoteMessage message) async {}

/// Whether a `Firebase.initializeApp` failure means "this build ships no
/// Firebase config" rather than a genuine runtime fault.
///
/// Each platform words it differently: Android fails to read the
/// `google-services.json`-generated resources, iOS misses
/// `GoogleService-Info.plist`, and the Dart layer reports an uninitialised
/// default app. None of them can recover without a rebuild, so they are the
/// outcomes [PushNotificationService] caches and reports in a single line.
bool isMissingFirebaseConfig(String message) {
  const signatures = <String>[
    'initializeApp',
    'no-app',
    'FirebaseOptions from resource',
    'GoogleService-Info.plist',
    'default options',
  ];
  return signatures.any(message.contains);
}

typedef PushOpened = void Function(String location);
typedef PushForeground = void Function();

class PushNotificationService {
  PushNotificationService({
    required TokenStore tokens,
    required NotificationsApi api,
    required PushOpened onOpened,
    required PushForeground onForeground,
  }) : _tokens = tokens,
       _api = api,
       _onOpened = onOpened,
       _onForeground = onForeground;

  final TokenStore _tokens;
  final NotificationsApi _api;
  final PushOpened _onOpened;
  final PushForeground _onForeground;

  StreamSubscription<String>? _tokenSub;
  StreamSubscription<RemoteMessage>? _foregroundSub;
  StreamSubscription<RemoteMessage>? _openedSub;
  bool _started = false;

  Future<void> start() async {
    if (!isPushPlatform || _started) {
      return;
    }
    final ready = await _ensureFirebase();
    if (!ready) {
      return;
    }
    _started = true;
    FirebaseMessaging.onBackgroundMessage(handleBackgroundMessage);
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(alert: true, badge: true, sound: true);
    await _registerToken(await messaging.getToken());
    _tokenSub = messaging.onTokenRefresh.listen(_registerToken);
    _foregroundSub = FirebaseMessaging.onMessage.listen((message) {
      _onForeground();
    });
    _openedSub = FirebaseMessaging.onMessageOpenedApp.listen(_open);
    final initial = await messaging.getInitialMessage();
    if (initial != null) {
      _open(initial);
    }
  }

  Future<void> stop() async {
    await _tokenSub?.cancel();
    await _foregroundSub?.cancel();
    await _openedSub?.cancel();
    _tokenSub = null;
    _foregroundSub = null;
    _openedSub = null;
    _started = false;
  }

  Future<void> unregister() async {
    final deviceId = await _tokens.deviceId();
    await _api.revokeDevice(deviceId);
    if (_started) {
      try {
        await FirebaseMessaging.instance.deleteToken();
      } catch (_) {}
    }
    await stop();
  }

  Future<void> _registerToken(String? token) async {
    if (token == null || token.isEmpty) {
      return;
    }
    final deviceId = await _tokens.deviceId();
    await _api.registerDevice(
      deviceId: deviceId,
      platform: currentPushPlatform(),
      token: token,
    );
  }

  void _open(RemoteMessage message) {
    final data = message.data;
    final location = locationForNotification(
      resourceType: data['resourceType'] as String?,
      resourceId: data['resourceId'] as String?,
    );
    if (location != null) {
      _onOpened(location);
    }
  }

  /// Whether Firebase could be initialised.
  ///
  /// Only permanent outcomes are cached. A build without
  /// `GoogleService-Info.plist` / `google-services.json` can never succeed, and
  /// [start] runs on every login, so that case is remembered to avoid
  /// reprinting the same failure. Anything else -- Play Services mid-update, a
  /// slow cold start, a transient native error -- is left uncached so the next
  /// [start] retries instead of disabling push for the life of the process.
  bool? _firebaseAvailable;

  Future<bool> _ensureFirebase() async {
    final cached = _firebaseAvailable;
    if (cached != null) {
      return cached;
    }
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp();
      }
      return _firebaseAvailable = true;
    } catch (error, stack) {
      // Missing config is the normal case for local builds; report it in one
      // line and keep the stack for genuine failures.
      final message = error.toString();
      if (isMissingFirebaseConfig(message)) {
        debugPrint(
          'Push disabled: Firebase is not configured for this build.',
        );
        return _firebaseAvailable = false;
      }
      debugPrint('Push unavailable: Firebase init failed: $error');
      if (kDebugMode) {
        debugPrint(stack.toString());
      }
      return false;
    }
  }
}
