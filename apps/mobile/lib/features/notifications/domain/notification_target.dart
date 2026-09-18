import '../../../router/app_routes.dart';

String? locationForNotification({
  String? resourceType,
  String? resourceId,
}) {
  final id = resourceId?.trim() ?? '';
  if (id.isEmpty) {
    return AppRoutes.notifications;
  }
  return switch (resourceType) {
    'follow_up' => AppRoutes.followUpDetailPath(id),
    'lead' => AppRoutes.leadDetailPath(id),
    'quotation' => AppRoutes.quotationDetailPath(id),
    _ => AppRoutes.notifications,
  };
}
