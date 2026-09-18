import 'dart:io';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';

import '../config/app_env.dart';
import 'ssl_pinning.dart';

void applySslPinning(Dio dio, AppFlavor flavor) {
  dio.httpClientAdapter = IOHttpClientAdapter(
    createHttpClient: () {
      final client = HttpClient();
      client.badCertificateCallback = (cert, host, port) => false;
      return client;
    },
    validateCertificate: (cert, host, port) {
      if (cert == null) {
        return false;
      }
      if (flavor.sslPins.isEmpty) {
        return true;
      }
      return certificateMatchesPins(der: cert.der, pins: flavor.sslPins);
    },
  );
}
