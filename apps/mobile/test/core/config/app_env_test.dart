import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/config/app_env.dart';

void main() {
  // The build-time defaults are what a `flutter build` with no --dart-define
  // gets. Because the fallback API_BASE_URL is the production host, the
  // fallback posture has to be the production one: a release built without
  // defines must not reach production with cleartext allowed, device
  // integrity unenforced and pinning off. Run with --dart-define-from-file
  // (dart_defines/local.json) to point a build at a dev backend.
  test('the default flavor carries the production posture', () {
    final flavor = AppFlavor.fromEnvironment();

    expect(flavor.env, AppEnv.prod);
    expect(flavor.apiBaseUrl, startsWith('https://'));
    expect(flavor.allowCleartext, isFalse);
    expect(flavor.enforceDeviceIntegrity, isTrue);
  });

  test('an unrecognised APP_ENV falls back to the strictest env', () {
    // e.g. --dart-define=APP_ENV=production, which is not an AppEnv name.
    expect(AppEnv.fromDefine('production'), AppEnv.prod);
    expect(AppEnv.fromDefine(''), AppEnv.prod);
  });

  test('a recognised APP_ENV is honoured', () {
    expect(AppEnv.fromDefine('dev'), AppEnv.dev);
    expect(AppEnv.fromDefine('staging'), AppEnv.staging);
    expect(AppEnv.fromDefine('prod'), AppEnv.prod);
  });
}
