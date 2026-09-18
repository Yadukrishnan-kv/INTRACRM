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
      query: {if (channel != null) 'channel': channel},
      parse: (json) => _maps(json).map(CommsTemplate.fromJson).toList(),
    );
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
        if (body != null) 'body': body,
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
        if (body != null) 'body': body,
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
