import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/auth_session.dart';
import '../domain/auth_user.dart';

List<String> _stringList(Object? value) {
  if (value is! List) {
    return const [];
  }
  return value.whereType<String>().toList();
}

class AuthTokensDto {
  const AuthTokensDto({
    required this.accessToken,
    required this.refreshToken,
    required this.userId,
    required this.fullName,
    required this.email,
    required this.tenantId,
    this.sessionId,
    this.roles = const [],
    this.permissions = const [],
  });

  final String accessToken;
  final String refreshToken;
  final String userId;
  final String fullName;
  final String email;
  final String tenantId;
  final String? sessionId;
  final List<String> roles;
  final List<String> permissions;

  factory AuthTokensDto.fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>? ?? const {};
    return AuthTokensDto(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      userId: user['id'] as String? ?? json['userId'] as String,
      fullName: user['fullName'] as String? ?? '',
      email: user['email'] as String? ?? '',
      tenantId: json['tenantId'] as String,
      sessionId: json['sessionId'] as String?,
      roles: _stringList(json['roles']),
      permissions: _stringList(json['permissions']),
    );
  }

  AuthUser toUser() {
    return AuthUser(
      id: userId,
      fullName: fullName,
      email: email,
      tenantId: tenantId,
      roles: roles,
      permissions: permissions,
    );
  }
}

class AuthApi {
  AuthApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<AuthTokensDto>>> login({
    required String email,
    required String password,
    required String deviceId,
    required String deviceName,
  }) {
    return _client.post(
      '/auth/login',
      data: {
        'email': email,
        'password': password,
        'deviceId': deviceId,
        'deviceName': deviceName,
      },
      parse: (json) => AuthTokensDto.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<bool>>> logout({String? refreshToken}) {
    return _client.post(
      '/auth/logout',
      data: {if (refreshToken != null) 'refreshToken': refreshToken},
      parse: (_) => true,
    );
  }

  Future<Result<ApiSuccess<Map<String, dynamic>>>> forgotPassword({
    required String email,
  }) {
    return _client.post(
      '/auth/forgot-password',
      data: {'email': email},
      parse: (json) => Map<String, dynamic>.from(json! as Map),
    );
  }

  Future<Result<ApiSuccess<bool>>> resetPassword({
    required String email,
    required String otp,
    required String newPassword,
  }) {
    return _client.post(
      '/auth/reset-password',
      data: {'email': email, 'otp': otp, 'newPassword': newPassword},
      parse: (_) => true,
    );
  }

  Future<Result<ApiSuccess<bool>>> changePassword({
    required String currentPassword,
    required String newPassword,
  }) {
    return _client.post(
      '/auth/change-password',
      data: {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      },
      parse: (_) => true,
    );
  }

  Future<Result<ApiSuccess<List<AuthSession>>>> listSessions() {
    return _client.get(
      '/auth/sessions',
      parse: (json) => _asList(json).map(AuthSession.fromJson).toList(),
    );
  }

  Future<Result<ApiSuccess<bool>>> revokeSession(String sessionId) {
    return _client.delete(
      '/auth/sessions/$sessionId',
      parse: (_) => true,
    );
  }

  Future<Result<ApiSuccess<bool>>> revokeOtherSessions() {
    return _client.post(
      '/auth/sessions/revoke-others',
      data: const {},
      parse: (_) => true,
    );
  }

  Future<Result<ApiSuccess<List<LoginHistoryEntry>>>> loginHistory() {
    return _client.get(
      '/auth/login-history',
      parse: (json) => _asList(json).map(LoginHistoryEntry.fromJson).toList(),
    );
  }

  Future<Result<ApiSuccess<AuthUser>>> me() {
    return _client.get(
      '/me',
      parse: (json) {
        final map = json! as Map<String, dynamic>;
        return AuthUser(
          id: map['id'] as String,
          fullName: map['fullName'] as String? ?? '',
          email: map['email'] as String? ?? '',
          tenantId: map['tenantId'] as String? ?? '',
          membershipId: map['membershipId'] as String?,
          roles: _stringList(map['roles']),
          permissions: _stringList(map['permissions']),
        );
      },
    );
  }

  List<Map<String, dynamic>> _asList(Object? json) {
    if (json is! List) {
      return const [];
    }
    return json
        .whereType<Map<dynamic, dynamic>>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }
}
