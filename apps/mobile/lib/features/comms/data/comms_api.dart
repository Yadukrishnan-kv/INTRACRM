import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_envelope.dart';
import '../domain/comms_models.dart';

class CommsApi {
  CommsApi(this._client);

  final ApiClient _client;

  Future<Result<ApiSuccess<List<CommsTemplate>>>> templates({String? channel}) {
    return _client.get(
      '/comms/templates',
      query: {'channel': ?channel},
      parse: (json) => _maps(json).map(CommsTemplate.fromJson).toList(),
    );
  }

  /// `POST /comms/templates` (`tenant:manage_settings`).
  Future<Result<ApiSuccess<CommsTemplate>>> createTemplate({
    required String channel,
    required String code,
    required String name,
    required String body,
  }) {
    return _client.post(
      '/comms/templates',
      data: {'channel': channel, 'code': code, 'name': name, 'body': body},
      parse: (json) => CommsTemplate.fromJson(json! as Map<String, dynamic>),
    );
  }

  /// `PATCH /comms/templates/:id` (`tenant:manage_settings`).
  Future<Result<ApiSuccess<CommsTemplate>>> updateTemplate(
    String id, {
    String? name,
    String? body,
    bool? isActive,
  }) {
    return _client.patch(
      '/comms/templates/$id',
      data: {'name': ?name, 'body': ?body, 'isActive': ?isActive},
      parse: (json) => CommsTemplate.fromJson(json! as Map<String, dynamic>),
    );
  }

  /// `DELETE /comms/templates/:id` (`tenant:manage_settings`).
  Future<Result<ApiSuccess<Object?>>> deleteTemplate(String id) {
    return _client.delete('/comms/templates/$id', parse: (json) => json);
  }

  Future<Result<ApiSuccess<CommsResult>>> call(String leadId, {String? notes}) {
    return _client.post(
      '/leads/$leadId/comms/call',
      data: {if (notes != null && notes.isNotEmpty) 'notes': notes},
      parse: (json) => CommsResult.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<CommsResult>>> whatsapp(
    String leadId, {
    String? templateCode,
    String? body,
  }) {
    return _client.post(
      '/leads/$leadId/comms/whatsapp',
      data: {
        if (templateCode != null && templateCode.isNotEmpty) 'templateCode': templateCode,
        'body': ?body,
      },
      parse: (json) => CommsResult.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<Result<ApiSuccess<CommsResult>>> sms(
    String leadId, {
    String? templateCode,
    String? body,
  }) {
    return _client.post(
      '/leads/$leadId/comms/sms',
      data: {
        if (templateCode != null && templateCode.isNotEmpty) 'templateCode': templateCode,
        'body': ?body,
      },
      parse: (json) => CommsResult.fromJson(json! as Map<String, dynamic>),
    );
  }

  List<Map<String, dynamic>> _maps(Object? json) {
    if (json is! List) {
      return const [];
    }
    return json
        .whereType<Map<dynamic, dynamic>>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }
}
