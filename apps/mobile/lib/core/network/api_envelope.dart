class PageMeta {
  const PageMeta({
    required this.limit,
    required this.hasMore,
    this.nextCursor,
    this.prevCursor,
  });

  final int limit;
  final bool hasMore;
  final String? nextCursor;
  final String? prevCursor;

  factory PageMeta.fromJson(Map<String, dynamic> json) {
    return PageMeta(
      limit: json['limit'] as int? ?? 20,
      hasMore: json['hasMore'] as bool? ?? false,
      nextCursor: json['nextCursor'] as String?,
      prevCursor: json['prevCursor'] as String?,
    );
  }
}

class ResponseMeta {
  const ResponseMeta({
    required this.requestId,
    required this.timestamp,
    this.page,
  });

  final String requestId;
  final DateTime timestamp;
  final PageMeta? page;

  factory ResponseMeta.fromJson(Map<String, dynamic> json) {
    final page = json['page'];
    return ResponseMeta(
      requestId: json['requestId'] as String? ?? '',
      timestamp:
          DateTime.tryParse(json['timestamp'] as String? ?? '') ??
          DateTime.now().toUtc(),
      page: page is Map<String, dynamic> ? PageMeta.fromJson(page) : null,
    );
  }
}

class ApiSuccess<T> {
  const ApiSuccess({required this.data, required this.meta});

  final T data;
  final ResponseMeta meta;
}

class ApiFieldError {
  const ApiFieldError({
    required this.field,
    required this.code,
    required this.message,
  });

  final String field;
  final String code;
  final String message;

  factory ApiFieldError.fromJson(Map<String, dynamic> json) {
    return ApiFieldError(
      field: json['field'] as String? ?? 'body',
      code: json['code'] as String? ?? 'invalid',
      message: json['message'] as String? ?? 'Invalid value',
    );
  }
}

class ApiErrorBody {
  const ApiErrorBody({
    required this.type,
    required this.title,
    required this.status,
    required this.code,
    required this.detail,
    required this.instance,
    required this.requestId,
    this.errors = const [],
  });

  final String type;
  final String title;
  final int status;
  final String code;
  final String detail;
  final String instance;
  final String requestId;
  final List<ApiFieldError> errors;

  factory ApiErrorBody.fromJson(Map<String, dynamic> json) {
    final errors = json['errors'];
    return ApiErrorBody(
      type: json['type'] as String? ?? '',
      title: json['title'] as String? ?? 'Error',
      status: json['status'] as int? ?? 500,
      code: json['code'] as String? ?? 'INTERNAL_ERROR',
      detail: json['detail'] as String? ?? 'Unexpected error',
      instance: json['instance'] as String? ?? '',
      requestId: json['requestId'] as String? ?? '',
      errors: errors is List
          ? errors
                .whereType<Map<dynamic, dynamic>>()
                .map(
                  (item) =>
                      ApiFieldError.fromJson(Map<String, dynamic>.from(item)),
                )
                .toList()
          : const [],
    );
  }
}

class PagedData<T> {
  const PagedData({required this.items, required this.page});

  final List<T> items;
  final PageMeta page;
}
