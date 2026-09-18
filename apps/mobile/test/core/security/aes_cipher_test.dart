import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/security/aes_cipher.dart';

void main() {
  test('AES-256-GCM round-trips and rejects a different key', () async {
    final key = List<int>.filled(32, 7);
    final cipher = AesCipher(keyBytes: key);
    final packed = await cipher.encrypt('{"lead":1}');
    expect(packed.startsWith('v1.'), isTrue);
    expect(await cipher.decrypt(packed), '{"lead":1}');

    final other = AesCipher(keyBytes: List<int>.filled(32, 9));
    await expectLater(other.decrypt(packed), throwsA(isA<Exception>()));
  });
}
