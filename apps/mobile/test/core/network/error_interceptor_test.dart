import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/logging/app_logger.dart';
import 'package:intra_leads/core/network/api_envelope.dart';
import 'package:intra_leads/core/network/api_exception.dart';
import 'package:intra_leads/core/network/interceptors/error_interceptor.dart';

class _CapturingLogger extends AppLogger {
  const _CapturingLogger(this.lines);

  final List<String> lines;

  @override
  void error(String message, [Object? error, StackTrace? stackTrace]) {
    lines.add(message);
  }
}

ApiErrorBody _body({
  int status = 422,
  String code = 'VALIDATION_ERROR',
  String detail = 'deviceId must be longer than or equal to 8 characters',
  String requestId = '01a0ada6-d841-7329-a8df-12f5eca47be5',
  List<ApiFieldError> errors = const [],
}) {
  return ApiErrorBody(
    type: '',
    title: 'Validation failed',
    status: status,
    code: code,
    detail: detail,
    instance: '/api/v1/auth/login',
    requestId: requestId,
    errors: errors,
  );
}

void main() {
  test('an API error prints status, code, method and path', () {
    final lines = <String>[];
    logApiError(
      RequestOptions(path: '/auth/login', method: 'post'),
      _body(),
      _CapturingLogger(lines),
    );
    expect(lines.first, 'API 422 VALIDATION_ERROR - POST /auth/login');
  });

  test('an API error prints the requestId so it can be traced server-side', () {
    final lines = <String>[];
    logApiError(
      RequestOptions(path: '/auth/login', method: 'post'),
      _body(),
      _CapturingLogger(lines),
    );
    expect(
      lines,
      contains('  requestId: 01a0ada6-d841-7329-a8df-12f5eca47be5'),
    );
    expect(
      lines,
      contains(
        '  detail: deviceId must be longer than or equal to 8 characters',
      ),
    );
  });

  test('field errors are listed one per line', () {
    final lines = <String>[];
    logApiError(
      RequestOptions(path: '/auth/login', method: 'post'),
      _body(
        errors: const [
          ApiFieldError(
            field: 'deviceId',
            code: 'minLength',
            message: 'too short',
          ),
          ApiFieldError(
            field: 'email',
            code: 'isEmail',
            message: 'not an email',
          ),
        ],
      ),
      _CapturingLogger(lines),
    );
    expect(lines, contains('  field deviceId (minLength): too short'));
    expect(lines, contains('  field email (isEmail): not an email'));
  });

  test('a request that never reached the API reports it as unreachable', () {
    final lines = <String>[];
    logTransportError(
      DioException(
        requestOptions: RequestOptions(
          path: '/leads',
          method: 'get',
          baseUrl: 'http://192.168.1.71:3000/api/v1',
        ),
        type: DioExceptionType.connectionError,
        error: 'SocketException: Connection refused',
      ),
      _CapturingLogger(lines),
    );
    expect(
      lines.first,
      'API unreachable - GET http://192.168.1.71:3000/api/v1/leads',
    );
    expect(lines, contains('  cause: connectionError'));
    expect(lines, contains('  error: SocketException: Connection refused'));
  });

  test('the interceptor logs and still converts the body to ApiException', () async {
    final lines = <String>[];
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1/api/v1'))
      ..interceptors.add(ErrorInterceptor(logger: _CapturingLogger(lines)));

    Object? thrown;
    try {
      await dio.get<dynamic>('/leads');
    } catch (error) {
      thrown = error;
    }

    // Nothing is listening on port 1, so this is the transport path.
    expect(thrown, isA<DioException>());
    expect(lines.first, startsWith('API unreachable - GET '));
    expect(lines.any((line) => line.startsWith('  cause: ')), isTrue);
  });

  test('ApiException still maps status to the right failure', () {
    expect(ApiException(_body(status: 401)).toFailure().runtimeType.toString(),
        'UnauthorizedFailure');
  });
}
