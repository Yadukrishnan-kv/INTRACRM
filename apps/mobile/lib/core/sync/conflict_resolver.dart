const serverWinsLeadFields = [
  'ownerMembershipId',
  'lifecycleStatus',
  'stageId',
  'stageName',
];

const mergeLeadFields = [
  'title',
  'customerName',
  'primaryPhone',
  'primaryEmail',
  'city',
  'requirement',
];

Map<String, dynamic> mergeLeadConflict(
  Map<String, dynamic> local,
  Map<String, dynamic> server,
) {
  final merged = Map<String, dynamic>.from(server);
  for (final field in mergeLeadFields) {
    final localValue = local[field];
    if (localValue != null && localValue != server[field]) {
      merged[field] = localValue;
    }
  }
  for (final field in serverWinsLeadFields) {
    if (server.containsKey(field)) {
      merged[field] = server[field];
    }
  }
  merged['version'] = server['version'];
  merged['updatedAt'] = server['updatedAt'];
  return merged;
}

Map<String, dynamic> mergeFollowUpConflict(
  Map<String, dynamic> local,
  Map<String, dynamic> server,
) {
  final merged = Map<String, dynamic>.from(server);
  final status = server['status'] as String?;
  if (status == 'completed' || status == 'cancelled') {
    return merged;
  }
  final localNotes = local['notes'];
  if (localNotes is String && localNotes != server['notes']) {
    merged['notes'] = mergeNotes(server['notes'] as String?, localNotes);
  }
  if (local['dueAt'] != null && local['dueAt'] != server['dueAt']) {
    merged['dueAt'] = local['dueAt'];
  }
  final title = local['title'];
  if (title is String && title.trim().isNotEmpty) {
    merged['title'] = title;
  }
  merged['version'] = server['version'];
  return merged;
}

String mergeNotes(String? server, String local) {
  if (server == null || server.trim().isEmpty || server == local) {
    return local;
  }
  if (server.contains(local)) {
    return server;
  }
  return '${server.trim()}\n${local.trim()}';
}
