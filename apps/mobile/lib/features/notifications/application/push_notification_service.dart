import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../../../core/auth/token_store.dart';
import '../data/notifications_api.dart';
import '../domain/notification_target.dart';
import 'push_platform.dart';

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

  Future<bool> _ensureFirebase() async {
    try {
      if (Firebase.apps.isNotEmpty) {
        return true;
      }
      await Firebase.initializeApp();
      return true;
    } catch (error, stack) {
      debugPrint('FCM skipped: $error\n$stack');
      return false;
    }
  }
}
