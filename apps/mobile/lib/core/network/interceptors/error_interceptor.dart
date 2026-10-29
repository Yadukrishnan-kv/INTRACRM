import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../logging/app_logger.dart';
import '../api_envelope.dart';
import '../api_exception.dart';

class ErrorInterceptor extends Interceptor {
  ErrorInterceptor({AppLogger logger = const AppLogger()}) : _logger = logger;

  final AppLogger _logger;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final data = err.response?.data;
    if (data is Map<String, dynamic>) {
      final error = data['error'];
      if (error is Map<String, dynamic>) {
        final body = ApiErrorBody.fromJson(error);
        logApiError(err.requestOptions, body, _logger);
        handler.reject(
          DioException(
            requestOptions: err.requestOptions,
            response: err.response,
            type: err.type,
            error: ApiException(body),
          ),
        );
        return;
      }
    }
    logTransportError(err, _logger);
    handler.next(err);
  }
}

/// Prints a failed API response to the debug console.
///
/// Debug builds only: the lines carry the server URL and the error detail, and
/// neither belongs in a shipped binary's device log. [ApiErrorBody.requestId]
/// matches the `requestId` the API logs for the same request, so a failure here
/// can be traced straight to its server-side line.
@visibleForTesting
void logApiError(
  RequestOptions options,
  ApiErrorBody body,
  AppLogger logger,
) {
  if (!kDebugMode) {
    return;
  }
  final method = options.method.toUpperCase();
  logger.error('API ${body.status} ${body.code} - $method ${options.path}');
  if (body.detail.isNotEmpty) {
    logger.error('  detail: ${body.detail}');
  }
  if (body.requestId.isNotEmpty) {
    logger.error('  requestId: ${body.requestId}');
  }
  for (final field in body.errors) {
    logger.error('  field ${field.field} (${field.code}): ${field.message}');
  }
}

/// Prints a request that never reached the API - DNS, refused connection,
/// timeout, TLS or the cleartext policy - to the debug console.
///
/// Debug builds only, for the same reason as [logApiError].
@visibleForTesting
void logTransportError(DioException err, AppLogger logger) {
  if (!kDebugMode) {
    return;
  }
  final options = err.requestOptions;
  final method = options.method.toUpperCase();
  final status = err.response?.statusCode;
  final label = status == null ? 'unreachable' : 'HTTP $status';
  logger.error('API $label - $method ${options.uri}');
  logger.error('  cause: ${err.type.name}');
  final inner = err.error;
  if (inner != null) {
    logger.error('  error: $inner');
  } else if (err.message != null) {
    logger.error('  error: ${err.message}');
  }
}
