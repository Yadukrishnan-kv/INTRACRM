import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/logging/app_logger.dart';
import 'package:intra_leads/features/comms/application/comms_providers.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:url_launcher_platform_interface/link.dart';
import 'package:url_launcher_platform_interface/url_launcher_platform_interface.dart';

class _CapturingLogger extends AppLogger {
  const _CapturingLogger(this.lines);

  final List<String> lines;

  @override
  void error(String message, [Object? error, StackTrace? stackTrace]) {
    lines.add(message);
  }
}

/// Stands in for the platform plugin so the failure modes url_launcher
/// documents ("returns false or throws a PlatformException") can be exercised.
class _FakeUrlLauncher extends UrlLauncherPlatform with MockPlatformInterfaceMixin {
  _FakeUrlLauncher({this.onLaunch});

  final Future<bool> Function(String url)? onLaunch;
  String? lastUrl;

  @override
  LinkDelegate? get linkDelegate => null;

  @override
  Future<bool> canLaunch(String url) async => true;

  @override
  Future<bool> launchUrl(String url, LaunchOptions options) {
    lastUrl = url;
    return onLaunch?.call(url) ?? Future<bool>.value(true);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final original = UrlLauncherPlatform.instance;
  tearDown(() => UrlLauncherPlatform.instance = original);

  test('a PlatformException becomes false instead of escaping to the UI', () async {
    UrlLauncherPlatform.instance = _FakeUrlLauncher(
      onLaunch: (_) => Future<bool>.error(
        PlatformException(code: 'ACTIVITY_NOT_FOUND', message: 'No dialer'),
      ),
    );
    final lines = <String>[];

    final opened = await CommsLauncher(logger: _CapturingLogger(lines))
        .open('tel:+919876543210');

    expect(opened, isFalse, reason: 'the caller shows a snackbar on false');
    expect(lines.single, contains('launch failed'));
    expect(lines.single, contains('tel'));
  });

  test('a missing plugin registration is reported rather than thrown', () async {
    UrlLauncherPlatform.instance = _FakeUrlLauncher(
      onLaunch: (_) =>
          Future<bool>.error(MissingPluginException('No implementation found')),
    );
    final lines = <String>[];

    final opened = await CommsLauncher(logger: _CapturingLogger(lines))
        .open('sms:+919876543210?body=hi');

    expect(opened, isFalse);
    expect(lines.single, contains('url_launcher unavailable'));
  });

  test('a malformed URI is reported rather than thrown', () async {
    final lines = <String>[];
    final opened = await CommsLauncher(logger: _CapturingLogger(lines))
        .open('tel://[::bad');
    expect(opened, isFalse);
    expect(lines.single, contains('cannot parse launch URI'));
  });

  test('a launcher refusal is passed through as false', () async {
    UrlLauncherPlatform.instance =
        _FakeUrlLauncher(onLaunch: (_) async => false);
    final lines = <String>[];

    final opened = await CommsLauncher(logger: _CapturingLogger(lines))
        .open('tel:+919876543210');

    expect(opened, isFalse);
    expect(lines, isEmpty, reason: 'false is not an error, the UI reports it');
  });

  test('a URI outside the expected schemes never reaches the platform', () async {
    final fake = _FakeUrlLauncher();
    UrlLauncherPlatform.instance = fake;
    final lines = <String>[];
    final launcher = CommsLauncher(logger: _CapturingLogger(lines));

    // launchUri is server-supplied and goes straight to ACTION_VIEW, so a
    // wrong or tampered value must not become an arbitrary app launch.
    for (final uri in const [
      'intent://scan/#Intent;scheme=zxing;end',
      'file:///data/data/com.example/databases/intra.db',
      'market://details?id=com.example',
      'javascript:alert(1)',
      'http://intracrm.mobilegear.co.in/api/v1/leads',
    ]) {
      expect(await launcher.open(uri), isFalse, reason: uri);
    }

    expect(fake.lastUrl, isNull, reason: 'nothing was handed to url_launcher');
    expect(lines, hasLength(5));
    expect(lines.every((line) => line.contains('refusing to launch')), isTrue);
  });

  test('a URI with no scheme is refused rather than launched', () async {
    final fake = _FakeUrlLauncher();
    UrlLauncherPlatform.instance = fake;
    final lines = <String>[];

    final opened = await CommsLauncher(logger: _CapturingLogger(lines))
        .open('+919876543210');

    expect(opened, isFalse);
    expect(fake.lastUrl, isNull);
    expect(lines.single, contains('refusing to launch'));
  });

  test('the API-built URIs reach the platform unchanged', () async {
    final fake = _FakeUrlLauncher();
    UrlLauncherPlatform.instance = fake;
    final launcher = CommsLauncher(logger: _CapturingLogger(<String>[]));

    expect(await launcher.open('tel:+919876543210'), isTrue);
    expect(fake.lastUrl, 'tel:+919876543210');

    expect(await launcher.open('sms:+919876543210?body=Hello%20there'), isTrue);
    expect(fake.lastUrl, 'sms:+919876543210?body=Hello%20there');

    expect(await launcher.open('https://wa.me/919876543210?text=Hi'), isTrue);
    expect(fake.lastUrl, 'https://wa.me/919876543210?text=Hi');

    expect(await launcher.open('smsto:+919876543210'), isTrue);
    expect(fake.lastUrl, 'smsto:+919876543210');
  });
}
