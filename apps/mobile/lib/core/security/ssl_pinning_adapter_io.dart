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
      // Dio runs this for every response, and cert is null over cleartext
      // HTTP, so the no-pins case must be settled before the null guard.
      if (flavor.sslPins.isEmpty) {
        return true;
      }
      if (cert == null) {
        return false;
      }
      return certificateMatchesPins(der: cert.der, pins: flavor.sslPins);
    },
  );
}
