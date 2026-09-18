import 'dart:convert';

import 'package:crypto/crypto.dart';

String sha256Hex(List<int> bytes) => sha256.convert(bytes).toString();

String sha256Base64(List<int> bytes) => base64.encode(sha256.convert(bytes).bytes);

List<String> parseSslPins(String raw) {
  return [
    for (final part in raw.split(','))
      if (part.trim().isNotEmpty) part.trim(),
  ];
}

bool certificateMatchesPins({
  required List<int> der,
  required List<String> pins,
}) {
  if (pins.isEmpty) {
    return true;
  }
  final hex = sha256Hex(der);
  final b64 = sha256Base64(der);
  final candidates = <String>{
    hex,
    hex.toUpperCase(),
    'sha256/$b64',
    'sha256/${b64.replaceAll('=', '')}',
  };
  return pins.any(candidates.contains);
}

bool requiresHttps(Uri uri, {required bool allowCleartext}) {
  if (uri.scheme == 'https') {
    return true;
  }
  return allowCleartext && uri.scheme == 'http';
}
