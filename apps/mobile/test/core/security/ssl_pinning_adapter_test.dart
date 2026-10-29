import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/config/app_env.dart';
import 'package:intra_leads/core/security/ssl_pinning_adapter_io.dart';

void main() {
  late HttpServer server;

  setUp(() async {
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      request.response.write('{"ok":true}');
      await request.response.close();
    });
  });

  tearDown(() async => server.close(force: true));

  test('allows a cleartext response when no pins are configured', () async {
    const flavor = AppFlavor(
      env: AppEnv.dev,
      apiBaseUrl: 'http://127.0.0.1',
      appName: 'test',
    );
    final dio = Dio();
    applySslPinning(dio, flavor);

    final response = await dio.getUri<String>(
      Uri.parse('http://127.0.0.1:${server.port}/'),
    );

    expect(response.statusCode, 200);
  });

  test('rejects a certificate-less response when pins are configured', () async {
    const flavor = AppFlavor(
      env: AppEnv.prod,
      apiBaseUrl: 'http://127.0.0.1',
      appName: 'test',
      sslPins: ['sha256/deadbeef'],
    );
    final dio = Dio();
    applySslPinning(dio, flavor);

    await expectLater(
      dio.getUri<String>(Uri.parse('http://127.0.0.1:${server.port}/')),
      throwsA(
        isA<DioException>().having(
          (e) => e.type,
          'type',
          DioExceptionType.badCertificate,
        ),
      ),
    );
  });
}
