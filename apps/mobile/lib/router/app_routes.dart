class AppRoutes {
  static const splash = '/splash';
  static const login = '/login';
  static const forgotPassword = '/forgot-password';
  static const resetPassword = '/reset-password';
  static const changePassword = '/change-password';
  static const sessions = '/sessions';
  static const leads = '/leads';
  static const leadCreate = '/leads/create';
  static const leadEdit = '/leads/:leadId/edit';
  static const tasks = '/tasks';
  static const followUpCreate = '/tasks/create';
  static const followUpDetail = '/tasks/:followUpId';
  static const followUpCalendar = '/tasks/calendar';
  static const followUpEdit = '/tasks/:followUpId/edit';
  static const notifications = '/notifications';
  static const search = '/search';
  static const notificationPreferences = '/settings/notifications';
  static const settings = '/settings';
  static const generalSettings = '/settings/general';
  static const taxesSettings = '/settings/general/taxes';
  static const messageTemplates = '/settings/templates';
  static const catalog = '/catalog';
  static const catalogKind = '/catalog/:kind';
  static const catalogCreate = '/catalog/:kind/create';
  static const catalogEdit = '/catalog/:kind/:id/edit';
  static const roles = '/roles';
  static const roleCreate = '/roles/create';
  static const roleEdit = '/roles/:roleId/edit';
  static const permissionMatrix = '/rbac/matrix';
  static const staff = '/staff';
  static const staffCreate = '/staff/create';
  static const staffDetail = '/staff/:staffId';
  static const staffEdit = '/staff/:staffId/edit';
  static const staffResetPassword = '/staff/:staffId/password';
  static const teams = '/teams';
  static const staffReport = '/reports/staff';
  static const pipeline = '/pipeline';
  static const pipelineAnalytics = '/reports/pipeline';
  static const timeline = '/timeline';
  static const siteVisits = '/visits';
  static const siteVisitCreate = '/visits/create';
  static const siteVisitDetail = '/visits/:visitId';
  static const siteVisitEdit = '/visits/:visitId/edit';
  static const siteVisitReport = '/reports/site-visits';
  static const attendance = '/attendance';
  static const attendanceReport = '/reports/attendance';
  static const quotations = '/quotations';
  static const quotationCreate = '/quotations/create';
  static const quotationEdit = '/quotations/:quotationId/edit';
  static const quotationDetail = '/quotations/:quotationId';
  static const quotationReport = '/reports/quotations';
  static const targets = '/targets';
  static const targetCreate = '/targets/create';
  static const targetDetail = '/targets/:targetId';
  static const targetEdit = '/targets/:targetId/edit';
  static const targetReport = '/reports/targets';
  static const salesTarget = '/targets/sales-board';
  static const performance = '/performance';
  static const performanceDetail = '/performance/:membershipId';
  static const performanceReport = '/reports/performance';
  static const dashboard = '/dashboard';
  static const dashboardWidget = '/dashboard/:widgetCode';
  static const staffDashboard = '/dashboard/me';
  static const analytics = '/analytics';
  static const analyticsMetric = '/analytics/:metricCode';
  static const staffAnalytics = '/analytics/me';
  static const funnelReport = '/reports/funnel';
  static const staffFunnelReport = '/reports/funnel/me';
  static const trackReport = '/reports/tracks';
  static const warranties = '/warranties';
  static const warrantyCreate = '/warranties/create';
  static const warrantyEdit = '/warranties/:warrantyId/edit';
  static const warrantyDetail = '/warranties/:warrantyId';
  static const warrantyReport = '/reports/warranties';
  static const reports = '/reports';
  static const leadReport = '/reports/leads';
  static const followUpReport = '/reports/follow-ups';
  static const salesReport = '/reports/sales';
  static const incentiveReport = '/reports/incentives';
  static const incentivePlans = '/incentives/plans';
  static const incentivePlanCreate = '/incentives/plans/new';
  static const verifyWarranty = '/verify-warranty';
  static const verifyWarrantyScan = '/verify-warranty/scan';

  static const publicAuth = {login, forgotPassword, resetPassword};

  static bool isPublicPortal(String location) {
    return location == verifyWarranty || location.startsWith('$verifyWarranty/');
  }

  static String verifyWarrantyPath(String token) => '/verify-warranty/$token';

  static String leadDetailPath(String leadId) => '/leads/$leadId';
  static String leadEditPath(String leadId) => '/leads/$leadId/edit';
  static String incentivePlanEditPath(String planId) => '/incentives/plans/$planId/edit';
  static String followUpDetailPath(String followUpId) => '/tasks/$followUpId';
  static String followUpEditPath(String followUpId) => '/tasks/$followUpId/edit';
  static String followUpCreatePath({String? leadId}) =>
      leadId == null ? followUpCreate : '$followUpCreate?leadId=$leadId';
  static String staffDetailPath(String staffId) => '/staff/$staffId';
  static String siteVisitDetailPath(String visitId) => '/visits/$visitId';
  static String siteVisitCreatePath({String? leadId}) =>
      leadId == null ? siteVisitCreate : '$siteVisitCreate?leadId=$leadId';
  static String quotationDetailPath(String quotationId) => '/quotations/$quotationId';
  static String quotationCreatePath({String? leadId}) =>
      leadId == null ? quotationCreate : '$quotationCreate?leadId=$leadId';
  static String quotationEditPath(String quotationId) => '/quotations/$quotationId/edit';
  static String targetDetailPath(String targetId) => '/targets/$targetId';
  static String targetEditPath(String targetId) => '/targets/$targetId/edit';
  static String roleEditPath(String roleId) => '/roles/$roleId/edit';
  static String siteVisitEditPath(String visitId) => '/visits/$visitId/edit';
  static String performanceDetailPath(String membershipId) => '/performance/$membershipId';
  static String dashboardWidgetPath(String widgetCode) => '/dashboard/$widgetCode';
  static String analyticsMetricPath(String metricCode) => '/analytics/$metricCode';
  static String warrantyDetailPath(String warrantyId) => '/warranties/$warrantyId';
  static String warrantyEditPath(String warrantyId) => '/warranties/$warrantyId/edit';
  static String warrantyCreatePath({String? leadId, String? quotationId}) {
    final params = <String, String>{
      'leadId': ?leadId,
      'quotationId': ?quotationId,
    };
    if (params.isEmpty) {
      return warrantyCreate;
    }
    return '$warrantyCreate?${params.entries.map((entry) => '${entry.key}=${entry.value}').join('&')}';
  }
  static String catalogKindPath(String kind) => '/catalog/$kind';
  static String catalogCreatePath(String kind) => '/catalog/$kind/create';
  static String catalogEditPath(String kind, String id) => '/catalog/$kind/$id/edit';
  static String staffEditPath(String staffId) => '/staff/$staffId/edit';
  static String staffResetPasswordPath(String staffId, {String? email}) {
    final base = '/staff/$staffId/password';
    if (email == null || email.isEmpty) {
      return base;
    }
    return '$base?email=${Uri.encodeQueryComponent(email)}';
  }
}
