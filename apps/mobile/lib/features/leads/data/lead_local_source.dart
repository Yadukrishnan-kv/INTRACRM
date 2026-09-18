import 'dart:convert';

import '../../../core/storage/cache_store.dart';
import 'lead_dto.dart';

class LeadLocalSource {
  LeadLocalSource(this._cache);

  final CacheStore _cache;

  static const _listKey = 'leads.list';

  Future<void> saveList(String tenantId, List<LeadDto> leads) {
    return _cache.write(
      key: _listKey,
      tenantId: tenantId,
      payload: jsonEncode([for (final lead in leads) lead.toJson()]),
    );
  }

  Future<List<LeadDto>> readList(String tenantId) async {
    final payload = await _cache.read(key: _listKey, tenantId: tenantId);
    if (payload == null) {
      return const [];
    }
    final decoded = jsonDecode(payload);
    if (decoded is! List) {
      return const [];
    }
    return [
      for (final item in decoded)
        if (item is Map)
          LeadDto.fromJson(Map<String, dynamic>.from(item)),
    ];
  }

  static const _lookupsKey = 'leads.lookups';

  Future<void> saveLookups(String tenantId, LeadLookupsDto lookups) {
    return _cache.write(
      key: _lookupsKey,
      tenantId: tenantId,
      payload: jsonEncode({
        'qualities': [
          for (final quality in lookups.qualities)
            {'code': quality.code, 'name': quality.name},
        ],
        'sources': [
          for (final source in lookups.sources)
            {'id': source.id, 'code': source.code, 'name': source.name},
        ],
        'staff': [
          for (final staff in lookups.staff)
            {
              'id': staff.id,
              'fullName': staff.fullName,
              'designation': staff.designation,
            },
        ],
      }),
    );
  }

  Future<LeadLookupsDto?> readLookups(String tenantId) async {
    final payload = await _cache.read(key: _lookupsKey, tenantId: tenantId);
    if (payload == null) {
      return null;
    }
    final decoded = jsonDecode(payload);
    if (decoded is! Map) {
      return null;
    }
    return LeadLookupsDto.fromJson(Map<String, dynamic>.from(decoded));
  }
}
