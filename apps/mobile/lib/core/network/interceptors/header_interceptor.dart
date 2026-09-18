import 'package:dio/dio.dart';

import '../../auth/token_store.dart';
import '../../utils/id_generator.dart';
import '../api_headers.dart';

class HeaderInterceptor extends Interceptor {
  HeaderInterceptor({
    required TokenStore tokenStore,
    required IdGenerator ids,
  }) : _tokenStore = tokenStore,
       _ids = ids;

  final TokenStore _tokenStore;
  final IdGenerator _ids;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final tokens = await _tokenStore.read();
    if (tokens != null) {
      options.headers[ApiHeaders.authorization] = 'Bearer ${tokens.accessToken}';
      options.headers[ApiHeaders.tenantId] = tokens.tenantId;
    }
    options.headers[ApiHeaders.requestId] = _ids.v7();
    options.headers[ApiHeaders.deviceId] = await _tokenStore.deviceId();

    final path = options.path;
    final skipIdempotency = path.contains('/auth/refresh');
    final isUnsafe = const {'POST', 'PUT', 'PATCH', 'DELETE'}.contains(
      options.method.toUpperCase(),
    );
    if (isUnsafe &&
        !skipIdempotency &&
        options.headers[ApiHeaders.idempotencyKey] == null) {
      options.headers[ApiHeaders.idempotencyKey] = _ids.v4();
    }
    handler.next(options);
  }
}
