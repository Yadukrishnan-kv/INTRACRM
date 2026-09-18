import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

import '../storage/secure_store.dart';

class AesCipher {
  AesCipher({SecureStore? store, List<int>? keyBytes})
    : _secureStore = store,
      _keyBytes = keyBytes;

  static const _version = 'v1';
  final SecureStore? _secureStore;
  final List<int>? _keyBytes;
  final AesGcm _algorithm = AesGcm.with256bits();
  SecretKey? _cachedKey;

  Future<String> encrypt(String plain) async {
    final key = await _key();
    final secretBox = await _algorithm.encrypt(
      utf8.encode(plain),
      secretKey: key,
    );
    return [
      _version,
      base64Encode(secretBox.nonce),
      base64Encode(secretBox.cipherText),
      base64Encode(secretBox.mac.bytes),
    ].join('.');
  }

  Future<String> decrypt(String packed) async {
    final parts = packed.split('.');
    if (parts.length != 4 || parts[0] != _version) {
      throw const FormatException('Invalid ciphertext');
    }
    final key = await _key();
    final clear = await _algorithm.decrypt(
      SecretBox(
        base64Decode(parts[2]),
        nonce: base64Decode(parts[1]),
        mac: Mac(base64Decode(parts[3])),
      ),
      secretKey: key,
    );
    return utf8.decode(clear);
  }

  Future<SecretKey> _key() async {
    final cached = _cachedKey;
    if (cached != null) {
      return cached;
    }
    final override = _keyBytes;
    if (override != null) {
      final key = SecretKey(override);
      _cachedKey = key;
      return key;
    }
    final store = _secureStore;
    if (store == null) {
      throw StateError('AES key store is not configured');
    }
    final stored = await store.read(SecureKeys.aesKey);
    final Uint8List bytes;
    if (stored == null || stored.isEmpty) {
      bytes = _randomBytes(32);
      await store.write(SecureKeys.aesKey, base64Encode(bytes));
    } else {
      bytes = Uint8List.fromList(base64Decode(stored));
    }
    final key = SecretKey(bytes);
    _cachedKey = key;
    return key;
  }

  Uint8List _randomBytes(int length) {
    final random = Random.secure();
    return Uint8List.fromList(List<int>.generate(length, (_) => random.nextInt(256)));
  }
}
