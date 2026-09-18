import 'package:dio/dio.dart';

import '../error/failure.dart';
import '../error/result.dart';
import 'api_envelope.dart';
import 'api_exception.dart';

class ApiClient {
  ApiClient(this._dio);

  final Dio _dio;

  Future<Result<ApiSuccess<T>>> get<T>(
    String path, {
    Map<String, dynamic>? query,
    required T Function(Object? json) parse,
  }) {
    return _send(
      () => _dio.get<Map<String, dynamic>>(path, queryParameters: query),
      parse,
    );
  }

  Future<Result<ApiSuccess<T>>> post<T>(
    String path, {
    Object? data,
    required T Function(Object? json) parse,
  }) {
    return _send(
      () => _dio.post<Map<String, dynamic>>(path, data: data),
      parse,
    );
  }

  Future<Result<ApiSuccess<T>>> put<T>(
    String path, {
    Object? data,
    required T Function(Object? json) parse,
  }) {
    return _send(
      () => _dio.put<Map<String, dynamic>>(path, data: data),
      parse,
    );
  }

  Future<Result<ApiSuccess<T>>> patch<T>(
    String path, {
    Object? data,
    required T Function(Object? json) parse,
  }) {
    return _send(
      () => _dio.patch<Map<String, dynamic>>(path, data: data),
      parse,
    );
  }

  Future<Result<ApiSuccess<T>>> delete<T>(
    String path, {
    Object? data,
    required T Function(Object? json) parse,
  }) {
    return _send(
      () => _dio.delete<Map<String, dynamic>>(path, data: data),
      parse,
    );
  }

  Future<Result<List<int>>> getBytes(
    String path, {
    Map<String, dynamic>? query,
  }) async {
    try {
      final response = await _dio.get<List<int>>(
        path,
        queryParameters: query,
        options: Options(responseType: ResponseType.bytes),
      );
      final bytes = response.data;
      if (bytes == null) {
        return const Err(UnexpectedFailure('Empty file'));
      }
      return Success(bytes);
    } on DioException catch (error) {
      return Err(_mapDio(error));
    } catch (error) {
      return Err(UnexpectedFailure(error.toString(), cause: error));
    }
  }

  Future<Result<ApiSuccess<T>>> _send<T>(
    Future<Response<Map<String, dynamic>>> Function() request,
    T Function(Object? json) parse,
  ) async {
    try {
      final response = await request();
      final body = response.data;
      if (body == null) {
        return const Err(UnexpectedFailure('Empty response'));
      }
      final metaJson = body['meta'];
      return Success(
        ApiSuccess(
          data: parse(body['data']),
          meta: metaJson is Map<String, dynamic>
              ? ResponseMeta.fromJson(metaJson)
              : ResponseMeta(
                  requestId: '',
                  timestamp: DateTime.now().toUtc(),
                ),
        ),
      );
    } on DioException catch (error) {
      return Err(_mapDio(error));
    } catch (error) {
      return Err(UnexpectedFailure(error.toString(), cause: error));
    }
  }

  Failure _mapDio(DioException error) {
    final wrapped = error.error;
    if (wrapped is ApiException) {
      return wrapped.toFailure();
    }
    return switch (error.type) {
      DioExceptionType.connectionError ||
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout => const NetworkFailure(
        'Unable to reach the server.',
      ),
      _ => UnexpectedFailure(error.message ?? 'Request failed', cause: error),
    };
  }
}
