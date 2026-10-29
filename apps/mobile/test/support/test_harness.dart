import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intra_leads/core/error/result.dart';
import 'package:intra_leads/core/network/api_client.dart';
import 'package:intra_leads/core/network/api_envelope.dart';
import 'package:intra_leads/design_system/theme/app_theme.dart';
import 'package:intra_leads/features/auth/application/auth_controller.dart';
import 'package:intra_leads/features/auth/domain/auth_user.dart';

final testMeta = ResponseMeta(requestId: 'r', timestamp: DateTime.utc(2026, 10, 5));

Success<ApiSuccess<T>> ok<T>(T data) => Success(ApiSuccess(data: data, meta: testMeta));

/// An [ApiClient] that never hits the network; fakes override API methods.
ApiClient offlineClient() => ApiClient(Dio());

AuthUser testUser(
  List<String> permissions, {
  String id = 'user-me',
  String? membershipId = 'member-me',
}) {
  return AuthUser(
    id: id,
    fullName: 'Test User',
    email: 't@example.com',
    tenantId: 't1',
    membershipId: membershipId,
    permissions: permissions,
  );
}

class _FixedAuth extends AuthController {
  _FixedAuth(this._state);

  final AuthState _state;

  @override
  AuthState build() => _state;
}

Override authOverride(AuthUser user) {
  return authControllerProvider.overrideWith(
    () => _FixedAuth(AuthState(status: AuthStatus.authenticated, user: user)),
  );
}

/// Pumps [page] as a child route of a home route, so `context.pop()` works.
Future<void> pumpPage(
  WidgetTester tester,
  Widget page, {
  required List<Override> overrides,
}) async {
  final router = GoRouter(
    initialLocation: '/page',
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const Scaffold(body: Text('home')),
        routes: [GoRoute(path: 'page', builder: (context, state) => page)],
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
}

/// A recorded HTTP call made through [RecordingClient].
class RecordedRequest {
  RecordedRequest(this.method, this.path, this.data, [this.query = const {}]);

  final String method;
  final String path;
  final Object? data;
  final Map<String, dynamic> query;
}

/// An [ApiClient] whose Dio answers every request with [responseData] and
/// records method, path, query and body, to assert an API method's request shape.
class RecordingClient {
  RecordingClient(Object? responseData) {
    final dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          requests.add(
            RecordedRequest(options.method, options.path, options.data, options.queryParameters),
          );
          handler.resolve(
            Response<Map<String, dynamic>>(
              requestOptions: options,
              statusCode: 200,
              data: {'data': responseData},
            ),
          );
        },
      ),
    );
    client = ApiClient(dio);
  }

  late final ApiClient client;
  final requests = <RecordedRequest>[];
}
