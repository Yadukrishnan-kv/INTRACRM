import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/features/notifications/domain/notification_target.dart';
import 'package:intra_leads/router/app_routes.dart';

void main() {
  test('opens lead, follow-up, and quotation targets', () {
    expect(
      locationForNotification(resourceType: 'lead', resourceId: 'lead-1'),
      AppRoutes.leadDetailPath('lead-1'),
    );
    expect(
      locationForNotification(resourceType: 'follow_up', resourceId: 'fu-1'),
      AppRoutes.followUpDetailPath('fu-1'),
    );
    expect(
      locationForNotification(resourceType: 'quotation', resourceId: 'q-1'),
      AppRoutes.quotationDetailPath('q-1'),
    );
    expect(
      locationForNotification(resourceType: 'unknown', resourceId: 'x'),
      AppRoutes.notifications,
    );
  });
}
