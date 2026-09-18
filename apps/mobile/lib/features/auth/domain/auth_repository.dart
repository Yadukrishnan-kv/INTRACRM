import '../../../core/auth/token_store.dart';
import '../../../core/error/result.dart';
import 'auth_session.dart';
import 'auth_user.dart';

abstract class AuthRepository {
  Future<Result<AuthUser>> login({
    required String email,
    required String password,
  });

  Future<AuthTokens?> restore();

  Future<Result<AuthUser>> loadProfile();

  Future<void> logout();

  Future<Result<void>> forgotPassword({required String email});

  Future<Result<void>> resetPassword({
    required String email,
    required String otp,
    required String newPassword,
  });

  Future<Result<void>> changePassword({
    required String currentPassword,
    required String newPassword,
  });

  Future<Result<List<AuthSession>>> listSessions();

  Future<Result<void>> revokeSession(String sessionId);

  Future<Result<void>> revokeOtherSessions();

  Future<Result<List<LoginHistoryEntry>>> loginHistory();
}
