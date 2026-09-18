import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../home/presentation/app_nav_drawer.dart';
import '../../notifications/presentation/notifications_page.dart';
import '../../performance/domain/performance.dart';
import '../application/dashboard_providers.dart';
import '../domain/dashboard.dart';

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncBoard = ref.watch(dashboardOverviewProvider);
    final unread = ref.watch(notificationInboxProvider).asData?.value;
    final unreadCount = unread == null
        ? 0
        : unread.when(success: (page) => page.items.where((item) => item.unread).length, failure: (_) => 0);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      drawer: const AppNavDrawer(),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => ref.read(dashboardOverviewProvider.notifier).refresh(),
          child: AppAsyncBody(
            asyncValue: asyncBoard,
            isEmpty: (board) => board.ordered.isEmpty,
            emptyTitle: 'No dashboard data',
            emptyMessage: 'Leads, follow-ups, and quotations will appear here as work is logged.',
            builder: (board) {
              final leads = board.widget(DashboardWidgets.leads);
              final followUps = board.widget(DashboardWidgets.followUps);
              final quotations = board.widget(DashboardWidgets.quotations);
              final orders = board.widget(DashboardWidgets.orders);
              final sales = board.widget(DashboardWidgets.sales);
              final staff = board.widget(DashboardWidgets.staffPerformance);
              final target = sales == null
                  ? 0
                  : sales.metrics
                      .where((item) => item.code == 'target')
                      .map((item) => item.value)
                      .firstWhere((_) => true, orElse: () => 0);
              final achieved = sales?.month ?? 0;
              final progress = target <= 0 ? 0.0 : (achieved / target).clamp(0.0, 1.0);
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                children: [
                  _Header(unreadCount: unreadCount),
                  const SizedBox(height: AppSpacing.md),
                  Text('Dashboard', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                  Text(
                    _prettyDate(board.today),
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.muted),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _GlanceCard(
                    leads: leads?.primary ?? 0,
                    followUps: followUps?.primary ?? 0,
                    quotations: quotations?.metrics
                            .where((item) => item.code == 'open')
                            .map((item) => item.value)
                            .firstWhere((_) => true, orElse: () => quotations.month) ??
                        0,
                    orders: orders?.primary ?? 0,
                    sales: sales?.primaryText ?? '₹0',
                    target: formatDashboardValue(target, money: true, score: false),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  SectionCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Follow-up Alerts', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(height: AppSpacing.sm),
                        _AlertRow(
                          color: AppColors.danger,
                          icon: Icons.warning_amber_rounded,
                          title: 'Overdue Follow-ups',
                          count: _metric(followUps, 'overdue'),
                          onTap: () => context.push(AppRoutes.tasks),
                        ),
                        _AlertRow(
                          color: AppColors.warning,
                          icon: Icons.schedule,
                          title: 'Follow-ups Due Today',
                          count: followUps?.primary ?? 0,
                          onTap: () => context.push(AppRoutes.tasks),
                        ),
                        _AlertRow(
                          color: AppColors.info,
                          icon: Icons.request_quote_outlined,
                          title: 'Quotation Follow-ups',
                          count: _metric(quotations, 'open'),
                          onTap: () => context.push(AppRoutes.quotations),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  SectionCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('MTD Performance', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(height: AppSpacing.sm),
                        Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(board.month.label, style: Theme.of(context).textTheme.bodySmall),
                                  const SizedBox(height: 8),
                                  Text('Target', style: Theme.of(context).textTheme.labelMedium),
                                  Text(formatDashboardValue(target, money: true, score: false), style: Theme.of(context).textTheme.titleMedium),
                                  const SizedBox(height: 8),
                                  Text('Achievement', style: Theme.of(context).textTheme.labelMedium),
                                  Text(formatDashboardValue(achieved, money: true, score: false), style: Theme.of(context).textTheme.titleMedium),
                                ],
                              ),
                            ),
                            AppDonut(progress: progress, caption: 'Achievement'),
                          ],
                        ),
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: () => context.push(
                              AppRoutes.dashboardWidgetPath(DashboardWidgets.sales),
                            ),
                            child: const Text('View details'),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  SectionCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Staff Performance (MTD)', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(height: AppSpacing.sm),
                        if (staff == null || staff.series.isEmpty)
                          const Text('Staff scores appear once activity is logged.'),
                        for (final point in (staff?.series ?? const <DashboardSeriesPoint>[]).take(5)) ...[
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Row(
                              children: [
                                InitialsAvatar(name: point.label, size: 36),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(point.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                                      const SizedBox(height: 6),
                                      LinearProgressIndicator(
                                        value: (point.value.clamp(0, 10000)) / 10000,
                                        minHeight: 7,
                                        borderRadius: BorderRadius.circular(99),
                                        color: AppColors.teal,
                                        backgroundColor: AppColors.tealSoft,
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  bpsLabel(point.value),
                                  style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.teal),
                                ),
                              ],
                            ),
                          ),
                        ],
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: () => context.push(AppRoutes.performance),
                            child: const Text('View all'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  int _metric(DashboardWidget? widget, String code) {
    if (widget == null) {
      return 0;
    }
    for (final metric in widget.metrics) {
      if (metric.code == code) {
        return metric.value;
      }
    }
    return 0;
  }

  String _prettyDate(String ymd) {
    final parts = ymd.split('-');
    if (parts.length != 3) {
      return ymd;
    }
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    final month = int.tryParse(parts[1]) ?? 1;
    return '${int.tryParse(parts[2]) ?? parts[2]} ${months[month - 1]} ${parts[0]}';
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.unreadCount});

  final int unreadCount;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconButton(
          tooltip: 'Open screens',
          onPressed: () => Scaffold.of(context).openDrawer(),
          icon: const Icon(Icons.menu),
        ),
        Expanded(
          child: Text(
            AppStrings.appTitle,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: AppColors.teal,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
            ),
          ),
        ),
        IconButton(
          onPressed: () => context.push(AppRoutes.notifications),
          icon: Badge(
            isLabelVisible: unreadCount > 0,
            label: Text('$unreadCount'),
            child: const Icon(Icons.notifications_outlined),
          ),
        ),
      ],
    );
  }
}

class _GlanceCard extends StatelessWidget {
  const _GlanceCard({
    required this.leads,
    required this.followUps,
    required this.quotations,
    required this.orders,
    required this.sales,
    required this.target,
  });

  final int leads;
  final int followUps;
  final int quotations;
  final int orders;
  final String sales;
  final String target;

  @override
  Widget build(BuildContext context) {
    const style = TextStyle(color: Colors.white70, fontSize: 11);
    const valueStyle = TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800);
    Widget cell(String label, String value) {
      return Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: valueStyle),
            const SizedBox(height: 2),
            Text(label, style: style),
          ],
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: AppColors.teal,
        borderRadius: BorderRadius.circular(18),
      ),
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Today at a Glance', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 1.15,
            children: [
              cell('New Leads', '$leads'),
              cell('Follow-ups Today', '$followUps'),
              cell('Quotation Follow-up', '$quotations'),
              cell('Orders Won', '$orders'),
              cell("Today's Sales (₹)", sales),
              cell("Today's Target (₹)", target),
            ],
          ),
        ],
      ),
    );
  }
}

class _AlertRow extends StatelessWidget {
  const _AlertRow({
    required this.color,
    required this.icon,
    required this.title,
    required this.count,
    required this.onTap,
  });

  final Color color;
  final IconData icon;
  final String title;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(backgroundColor: color.withValues(alpha: 0.15), child: Icon(icon, color: color)),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      trailing: Text('$count', style: TextStyle(fontWeight: FontWeight.w800, color: color, fontSize: 16)),
      onTap: onTap,
    );
  }
}
