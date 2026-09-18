import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/security/ssl_pinning.dart';

void main() {
  test('matches hex and sha256/ base64 pins', () {
    final der = utf8.encode('certificate-bytes');
    final hex = sha256Hex(der);
    final b64 = sha256Base64(der);
    expect(certificateMatchesPins(der: der, pins: [hex]), isTrue);
    expect(certificateMatchesPins(der: der, pins: ['sha256/$b64']), isTrue);
    expect(certificateMatchesPins(der: der, pins: ['other']), isFalse);
    expect(certificateMatchesPins(der: der, pins: const []), isTrue);
  });

  test('allows cleartext only when the flavor permits it', () {
    expect(
      requiresHttps(Uri.parse('https://api.example.com'), allowCleartext: false),
      isTrue,
    );
    expect(
      requiresHttps(Uri.parse('http://localhost:3000'), allowCleartext: true),
      isTrue,
    );
    expect(
      requiresHttps(Uri.parse('http://api.example.com'), allowCleartext: false),
      isFalse,
    );
  });
}
