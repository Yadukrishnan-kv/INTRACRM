import '../storage/secure_store.dart';
import '../utils/id_generator.dart';

class AuthTokens {
  const AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.userId,
    required this.tenantId,
    this.sessionId,
    this.fullName,
    this.email,
  });

  final String accessToken;
  final String refreshToken;
  final String userId;
  final String tenantId;
  final String? sessionId;
  final String? fullName;
  final String? email;
}

class TokenStore {
  TokenStore(this._secureStore, this._ids);

  final SecureStore _secureStore;
  final IdGenerator _ids;

  Future<void> save(AuthTokens tokens) async {
    await _secureStore.write(SecureKeys.accessToken, tokens.accessToken);
    await _secureStore.write(SecureKeys.refreshToken, tokens.refreshToken);
    await _secureStore.write(SecureKeys.userId, tokens.userId);
    await _secureStore.write(SecureKeys.tenantId, tokens.tenantId);
    if (tokens.sessionId != null) {
      await _secureStore.write(SecureKeys.sessionId, tokens.sessionId!);
    }
    if (tokens.fullName != null) {
      await _secureStore.write(SecureKeys.fullName, tokens.fullName!);
    }
    if (tokens.email != null) {
      await _secureStore.write(SecureKeys.email, tokens.email!);
    }
  }

  Future<AuthTokens?> read() async {
    final accessToken = await _secureStore.read(SecureKeys.accessToken);
    final refreshToken = await _secureStore.read(SecureKeys.refreshToken);
    final userId = await _secureStore.read(SecureKeys.userId);
    final tenantId = await _secureStore.read(SecureKeys.tenantId);
    if (accessToken == null ||
        refreshToken == null ||
        userId == null ||
        tenantId == null) {
      return null;
    }
    return AuthTokens(
      accessToken: accessToken,
      refreshToken: refreshToken,
      userId: userId,
      tenantId: tenantId,
      sessionId: await _secureStore.read(SecureKeys.sessionId),
      fullName: await _secureStore.read(SecureKeys.fullName),
      email: await _secureStore.read(SecureKeys.email),
    );
  }

  Future<String> deviceId() async {
    final existing = await _secureStore.read(SecureKeys.deviceId);
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }
    final created = _ids.v4();
    await _secureStore.write(SecureKeys.deviceId, created);
    return created;
  }

  Future<void> clear() async {
    await _secureStore.delete(SecureKeys.accessToken);
    await _secureStore.delete(SecureKeys.refreshToken);
    await _secureStore.delete(SecureKeys.userId);
    await _secureStore.delete(SecureKeys.tenantId);
    await _secureStore.delete(SecureKeys.sessionId);
    await _secureStore.delete(SecureKeys.fullName);
    await _secureStore.delete(SecureKeys.email);
  }
}
