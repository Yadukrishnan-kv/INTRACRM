import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../notifications/application/notification_providers.dart';
import '../data/auth_api.dart';
import '../data/auth_repository_impl.dart';
import '../domain/auth_repository.dart';
import '../domain/auth_user.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState {
  const AuthState({required this.status, this.user, this.failure});

  const AuthState.unknown() : this(status: AuthStatus.unknown);
  const AuthState.unauthenticated() : this(status: AuthStatus.unauthenticated);

  final AuthStatus status;
  final AuthUser? user;
  final Failure? failure;

  bool get isAuthenticated => status == AuthStatus.authenticated;
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepositoryImpl(
    api: AuthApi(ref.watch(apiClientProvider)),
    tokenStore: ref.watch(tokenStoreProvider),
  );
});

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    final invalidator = ref.read(authSessionInvalidatorProvider);
    invalidator.register(() {
      ref.read(pushNotificationServiceProvider).stop();
      state = const AuthState.unauthenticated();
    });
    ref.onDispose(() {
      invalidator.register(() {});
    });
    return const AuthState.unknown();
  }

  AuthRepository get _repository => ref.read(authRepositoryProvider);

  Future<void> restoreSession() async {
    final tokens = await _repository.restore();
    if (tokens == null) {
      state = const AuthState.unauthenticated();
      return;
    }
    state = AuthState(
      status: AuthStatus.authenticated,
      user: AuthUser(
        id: tokens.userId,
        fullName: tokens.fullName ?? '',
        email: tokens.email ?? '',
        tenantId: tokens.tenantId,
      ),
    );
    final profile = await _repository.loadProfile();
    if (profile case Success(:final value)) {
      state = AuthState(status: AuthStatus.authenticated, user: value);
    }
    await ref.read(pushNotificationServiceProvider).start();
  }

  Future<Result<AuthUser>> login({
    required String email,
    required String password,
  }) async {
    final result = await _repository.login(email: email, password: password);
    switch (result) {
      case Success(:final value):
        state = AuthState(status: AuthStatus.authenticated, user: value);
        await ref.read(pushNotificationServiceProvider).start();
      case Err(:final failure):
        state = AuthState(
          status: AuthStatus.unauthenticated,
          failure: failure,
        );
    }
    return result;
  }

  Future<Result<void>> forgotPassword({required String email}) {
    return _repository.forgotPassword(email: email);
  }

  Future<Result<void>> resetPassword({
    required String email,
    required String otp,
    required String newPassword,
  }) {
    return _repository.resetPassword(
      email: email,
      otp: otp,
      newPassword: newPassword,
    );
  }

  Future<Result<void>> changePassword({
    required String currentPassword,
    required String newPassword,
  }) {
    return _repository.changePassword(
      currentPassword: currentPassword,
      newPassword: newPassword,
    );
  }

  Future<void> logout() async {
    await ref.read(pushNotificationServiceProvider).unregister();
    await _repository.logout();
    state = const AuthState.unauthenticated();
  }
}
