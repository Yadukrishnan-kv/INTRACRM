import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/features/notifications/application/push_notification_service.dart';

void main() {
  test('recognises the Android missing google-services.json failure', () {
    expect(
      isMissingFirebaseConfig(
        'PlatformException(java.lang.Exception: Failed to load FirebaseOptions '
        'from resource. Check that you have defined values.xml correctly., '
        'Exception, Cause: null, Stacktrace: ...)',
      ),
      isTrue,
    );
  });

  test('recognises the iOS and Dart-layer missing config failures', () {
    expect(
      isMissingFirebaseConfig(
        '[core/not-initialized] GoogleService-Info.plist is missing',
      ),
      isTrue,
    );
    expect(
      isMissingFirebaseConfig(
        '[core/no-app] No Firebase App has been created - '
        'call Firebase.initializeApp()',
      ),
      isTrue,
    );
  });

  test('leaves a genuine runtime failure to the noisy branch', () {
    expect(
      isMissingFirebaseConfig(
        'PlatformException(java.io.IOException: Timed out waiting for Play '
        'Services, Exception, Cause: null)',
      ),
      isFalse,
    );
  });
}
