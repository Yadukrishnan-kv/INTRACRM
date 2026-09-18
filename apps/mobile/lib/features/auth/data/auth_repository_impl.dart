import '../../../core/auth/token_store.dart';
import '../../../core/error/result.dart';
import '../../../core/utils/device_name.dart';
import '../domain/auth_repository.dart';
import '../domain/auth_session.dart';
import '../domain/auth_user.dart';
import 'auth_api.dart';

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl({required AuthApi api, required TokenStore tokenStore})
    : _api = api,
      _tokenStore = tokenStore;

  final AuthApi _api;
  final TokenStore _tokenStore;

  @override
  Future<Result<AuthUser>> login({
    required String email,
    required String password,
  }) async {
    final deviceId = await _tokenStore.deviceId();
    final result = await _api.login(
      email: email,
      password: password,
      deviceId: deviceId,
      deviceName: currentDeviceName(),
    );
    switch (result) {
      case Success(:final value):
        final data = value.data;
        await _tokenStore.save(
          AuthTokens(
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            userId: data.userId,
            tenantId: data.tenantId,
            sessionId: data.sessionId,
            fullName: data.fullName,
            email: data.email,
          ),
        );
        return Success(data.toUser());
      case Err(:final failure):
        return Err(failure);
    }
  }

  @override
  Future<AuthTokens?> restore() => _tokenStore.read();

  @override
  Future<Result<AuthUser>> loadProfile() async {
    final result = await _api.me();
    switch (result) {
      case Success(:final value):
        final tokens = await _tokenStore.read();
        if (tokens != null) {
          await _tokenStore.save(
            AuthTokens(
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              userId: value.data.id,
              tenantId: value.data.tenantId.isEmpty
                  ? tokens.tenantId
                  : value.data.tenantId,
              sessionId: tokens.sessionId,
              fullName: value.data.fullName,
              email: value.data.email,
            ),
          );
        }
        return Success(value.data);
      case Err(:final failure):
        return Err(failure);
    }
  }

  @override
  Future<void> logout() async {
    final tokens = await _tokenStore.read();
    if (tokens != null) {
      await _api.logout(refreshToken: tokens.refreshToken);
    }
    await _tokenStore.clear();
  }

  @override
  Future<Result<void>> forgotPassword({required String email}) {
    return _mapVoid(_api.forgotPassword(email: email));
  }

  @override
  Future<Result<void>> resetPassword({
    required String email,
    required String otp,
    required String newPassword,
  }) {
    return _mapVoid(
      _api.resetPassword(email: email, otp: otp, newPassword: newPassword),
    );
  }

  @override
  Future<Result<void>> changePassword({
    required String currentPassword,
    required String newPassword,
  }) {
    return _mapVoid(
      _api.changePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
      ),
    );
  }

  @override
  Future<Result<List<AuthSession>>> listSessions() async {
    final result = await _api.listSessions();
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }

  @override
  Future<Result<void>> revokeSession(String sessionId) {
    return _mapVoid(_api.revokeSession(sessionId));
  }

  @override
  Future<Result<void>> revokeOtherSessions() {
    return _mapVoid(_api.revokeOtherSessions());
  }

  @override
  Future<Result<List<LoginHistoryEntry>>> loginHistory() async {
    final result = await _api.loginHistory();
    return switch (result) {
      Success(:final value) => Success(value.data),
      Err(:final failure) => Err(failure),
    };
  }

  Future<Result<void>> _mapVoid<T>(Future<Result<dynamic>> request) async {
    final result = await request;
    return switch (result) {
      Success() => const Success(null),
      Err(:final failure) => Err(failure),
    };
  }
}
