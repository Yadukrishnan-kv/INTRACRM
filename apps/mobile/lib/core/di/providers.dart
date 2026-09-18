import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_session_invalidator.dart';
import '../auth/token_store.dart';
import '../config/app_env.dart';
import '../logging/app_logger.dart';
import '../network/api_client.dart';
import '../network/connectivity_service.dart';
import '../network/interceptors/auth_refresh_interceptor.dart';
import '../network/interceptors/error_interceptor.dart';
import '../network/interceptors/header_interceptor.dart';
import '../storage/cache_store.dart';
import '../storage/id_map_store.dart';
import '../storage/local_database.dart';
import '../storage/offline_store.dart';
import '../storage/outbox_store.dart';
import '../storage/secure_store.dart';
import '../sync/outbox_processor.dart';
import '../sync/sync_api.dart';
import '../sync/sync_cursor_store.dart';
import '../sync/sync_engine.dart';
import '../../features/follow_ups/data/follow_up_api.dart';
import '../../features/leads/data/lead_api.dart';
import '../utils/id_generator.dart';
import '../security/aes_cipher.dart';
import '../security/ssl_pinning.dart';
import '../security/ssl_pinning_adapter.dart';

final appFlavorProvider = Provider<AppFlavor>((ref) {
  return AppFlavor.fromEnvironment();
});

final appLoggerProvider = Provider<AppLogger>((ref) => const AppLogger());

final idGeneratorProvider = Provider<IdGenerator>((ref) => const IdGenerator());

final secureStoreProvider = Provider<SecureStore>((ref) => SecureStore());

final tokenStoreProvider = Provider<TokenStore>((ref) {
  return TokenStore(ref.watch(secureStoreProvider), ref.watch(idGeneratorProvider));
});

final authSessionInvalidatorProvider = Provider<AuthSessionInvalidator>((ref) {
  return AuthSessionInvalidator();
});

final localDatabaseProvider = Provider<LocalDatabase>((ref) {
  final database = LocalDatabase();
  ref.onDispose(database.close);
  return database;
});

final aesCipherProvider = Provider<AesCipher>((ref) {
  return AesCipher(store: ref.watch(secureStoreProvider));
});

final cacheStoreProvider = Provider<CacheStore>((ref) {
  return CacheStore(ref.watch(localDatabaseProvider), ref.watch(aesCipherProvider));
});

final outboxStoreProvider = Provider<OutboxStore>((ref) {
  return OutboxStore(ref.watch(localDatabaseProvider), ref.watch(aesCipherProvider));
});

final idMapStoreProvider = Provider<IdMapStore>((ref) {
  return IdMapStore(ref.watch(localDatabaseProvider));
});

final offlineStoreProvider = Provider<OfflineStore>((ref) {
  return OfflineStore(
    ref.watch(localDatabaseProvider),
    ref.watch(aesCipherProvider),
    ref.watch(idMapStoreProvider),
  );
});

final syncCursorStoreProvider = Provider<SyncCursorStore>((ref) {
  return SyncCursorStore(ref.watch(localDatabaseProvider));
});

final connectivityServiceProvider = Provider<ConnectivityService>((ref) {
  return ConnectivityService();
});

final dioProvider = Provider<Dio>((ref) {
  final flavor = ref.watch(appFlavorProvider);
  final tokenStore = ref.watch(tokenStoreProvider);
  final ids = ref.watch(idGeneratorProvider);
  final options = BaseOptions(
    baseUrl: flavor.apiBaseUrl,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 20),
    headers: const {'Accept': 'application/json'},
  );
  final dio = Dio(options);
  final refreshDio = Dio(options);
  applySslPinning(dio, flavor);
  applySslPinning(refreshDio, flavor);
  dio.interceptors.addAll([
    _HttpsPolicyInterceptor(flavor),
    HeaderInterceptor(tokenStore: tokenStore, ids: ids),
    AuthRefreshInterceptor(
      dio: dio,
      refreshDio: refreshDio,
      tokenStore: tokenStore,
      invalidator: ref.watch(authSessionInvalidatorProvider),
      ids: ids,
    ),
    ErrorInterceptor(),
  ]);
  return dio;
});

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(ref.watch(dioProvider));
});

final outboxProcessorProvider = Provider<OutboxProcessor>((ref) {
  return OutboxProcessor(
    store: ref.watch(outboxStoreProvider),
    dio: ref.watch(dioProvider),
    connectivity: ref.watch(connectivityServiceProvider),
    logger: ref.watch(appLoggerProvider),
    idMap: ref.watch(idMapStoreProvider),
    offline: ref.watch(offlineStoreProvider),
  );
});

final syncApiProvider = Provider<SyncApi>((ref) {
  return SyncApi(ref.watch(apiClientProvider));
});

final syncEngineProvider = Provider<SyncEngine>((ref) {
  final engine = SyncEngine(
    outbox: ref.watch(outboxProcessorProvider),
    outboxStore: ref.watch(outboxStoreProvider),
    offline: ref.watch(offlineStoreProvider),
    idMap: ref.watch(idMapStoreProvider),
    cursors: ref.watch(syncCursorStoreProvider),
    syncApi: ref.watch(syncApiProvider),
    leadApi: LeadApi(ref.watch(apiClientProvider)),
    followUpApi: FollowUpApi(ref.watch(apiClientProvider)),
    connectivity: ref.watch(connectivityServiceProvider),
    tokens: ref.watch(tokenStoreProvider),
    ids: ref.watch(idGeneratorProvider),
    logger: ref.watch(appLoggerProvider),
  );
  ref.onDispose(engine.stop);
  return engine;
});

class _HttpsPolicyInterceptor extends Interceptor {
  _HttpsPolicyInterceptor(this._flavor);

  final AppFlavor _flavor;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final uri = options.uri;
    if (!requiresHttps(uri, allowCleartext: _flavor.allowCleartext)) {
      handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.badCertificate,
          error: 'HTTPS is required',
        ),
      );
      return;
    }
    handler.next(options);
  }
}
