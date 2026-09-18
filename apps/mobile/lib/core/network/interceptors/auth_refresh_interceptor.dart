import 'package:dio/dio.dart';

import '../../auth/auth_session_invalidator.dart';
import '../../auth/token_store.dart';
import '../../utils/id_generator.dart';
import '../api_exception.dart';
import '../api_headers.dart';

class AuthRefreshInterceptor extends QueuedInterceptor {
  AuthRefreshInterceptor({
    required Dio dio,
    required Dio refreshDio,
    required TokenStore tokenStore,
    required AuthSessionInvalidator invalidator,
    required IdGenerator ids,
  }) : _dio = dio,
       _refreshDio = refreshDio,
       _tokenStore = tokenStore,
       _invalidator = invalidator,
       _ids = ids;

  static const _retryExtra = 'auth_retried';

  final Dio _dio;
  final Dio _refreshDio;
  final TokenStore _tokenStore;
  final AuthSessionInvalidator _invalidator;
  final IdGenerator _ids;

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (!_shouldRefresh(err)) {
      if (_isDeviceMismatch(err)) {
        await _forceLogout();
      }
      handler.next(err);
      return;
    }

    final tokens = await _tokenStore.read();
    if (tokens == null) {
      handler.next(err);
      return;
    }

    try {
      final refreshed = await _refreshDio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {
          'refreshToken': tokens.refreshToken,
          'deviceId': await _tokenStore.deviceId(),
        },
        options: Options(
          headers: {
            'Accept': 'application/json',
            ApiHeaders.requestId: _ids.v7(),
            ApiHeaders.deviceId: await _tokenStore.deviceId(),
          },
        ),
      );
      final payload = refreshed.data?['data'];
      if (payload is! Map<String, dynamic>) {
        await _forceLogout();
        handler.next(err);
        return;
      }
      final user = payload['user'] as Map<String, dynamic>? ?? const {};
      await _tokenStore.save(
        AuthTokens(
          accessToken: payload['accessToken'] as String,
          refreshToken: payload['refreshToken'] as String,
          userId: user['id'] as String? ?? tokens.userId,
          tenantId: payload['tenantId'] as String? ?? tokens.tenantId,
          sessionId: payload['sessionId'] as String? ?? tokens.sessionId,
          fullName: user['fullName'] as String? ?? tokens.fullName,
          email: user['email'] as String? ?? tokens.email,
        ),
      );

      final retry = err.requestOptions;
      retry.headers[ApiHeaders.authorization] =
          'Bearer ${payload['accessToken']}';
      retry.extra[_retryExtra] = true;
      final response = await _dio.fetch<dynamic>(retry);
      handler.resolve(response);
    } catch (_) {
      await _forceLogout();
      handler.next(err);
    }
  }

  bool _shouldRefresh(DioException err) {
    if (err.response?.statusCode != 401) {
      return false;
    }
    if (_isDeviceMismatch(err)) {
      return false;
    }
    if (err.requestOptions.extra[_retryExtra] == true) {
      return false;
    }
    final path = err.requestOptions.path;
    return !path.contains('/auth/login') &&
        !path.contains('/auth/refresh') &&
        !path.contains('/auth/forgot-password') &&
        !path.contains('/auth/reset-password') &&
        !path.contains('/public/warranty');
  }

  bool _isDeviceMismatch(DioException err) {
    final wrapped = err.error;
    return wrapped is ApiException && wrapped.body.code == 'DEVICE_MISMATCH';
  }

  Future<void> _forceLogout() async {
    await _tokenStore.clear();
    _invalidator.invalidate();
  }
}
