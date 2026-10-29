import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_palette.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../auth/application/auth_controller.dart';
import '../../home/presentation/app_nav_drawer.dart';
import '../../performance/domain/performance.dart';
import '../../targets/domain/target.dart';
import '../application/dashboard_providers.dart';
import '../domain/dashboard.dart';

class StaffDashboardPage extends ConsumerWidget {
  const StaffDashboardPage({super.key, this.asHome = false});

  /// True when this is the home tab (users without `dashboard:read`), so it
  /// carries the nav drawer instead of being a page pushed over the shell.
  final bool asHome;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncBoard = ref.watch(staffDashboardProvider);
    final canReadTarget = ref.watch(authControllerProvider).user?.canReadTarget == true;
    return AppScaffold(
      title: AppStrings.staffDashboard,
      drawer: asHome ? const AppNavDrawer() : null,
      body: RefreshIndicator(
        onRefresh: () => ref.read(staffDashboardProvider.notifier).refresh(),
        child: AppAsyncBody(
          asyncValue: asyncBoard,
          emptyTitle: 'No personal dashboard',
          emptyMessage: 'Your leads, follow-ups, and targets will appear here.',
          builder: (board) {
            final revenue = board.targets.where((t) => t.metricCode == 'revenue').firstOrNull;
            final others = board.targets.where((t) => t != revenue).toList();
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
              children: [
                _HeroCard(board: board),
                const SizedBox(height: AppSpacing.md),
                const _SectionTitle('Today'),
                const SizedBox(height: AppSpacing.sm),
                _TodayGrid(board: board),
                const SizedBox(height: AppSpacing.md),
                _SalesTargetCard(
                  month: board.month.label,
                  target: revenue,
                  sales: board.widgets[DashboardWidgets.sales],
                  onOpenBoard: canReadTarget ? () => context.push(AppRoutes.salesTarget) : null,
                ),
                if (others.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.md),
                  SectionCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const _SectionTitle(AppStrings.targetTracking),
                        const SizedBox(height: AppSpacing.sm),
                        for (final target in others) _TargetRow(target: target),
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: () => context.push(AppRoutes.targets),
                            child: const Text('View all'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: AppSpacing.md),
                const _SectionTitle(AppStrings.personalKpis),
                const SizedBox(height: AppSpacing.sm),
                _KpiGrid(kpis: board.kpis),
                const SizedBox(height: AppSpacing.md),
                OutlinedButton.icon(
                  onPressed: () => context.push(AppRoutes.performanceDetailPath(board.membership.id)),
                  icon: const Icon(Icons.insights_outlined),
                  label: const Text(AppStrings.performanceScore),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Teal reads well on the light canvas but sinks into the dark one, so text
/// accents lift it there.
Color _accent(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? const Color(0xFF5FC4AE) : AppColors.teal;

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
    );
  }
}

/// Who, where they stand, and the month being scored — tap for the full score.
class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.board});

  final StaffDashboard board;

  @override
  Widget build(BuildContext context) {
    final member = board.membership;
    final theme = Theme.of(context);
    final parts = member.name.trim().split(RegExp(r'\s+'));
    final initials = parts.take(2).map((p) => p.isEmpty ? '' : p[0].toUpperCase()).join();
    final subtitle = [
      if (member.designation != null) member.designation!,
      if (member.teamName != null) member.teamName!,
    ].join(' · ');

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => context.push(AppRoutes.performanceDetailPath(member.id)),
        child: Ink(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.teal, AppColors.tealDark],
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: Colors.white.withValues(alpha: 0.18),
                    child: Text(
                      initials.isEmpty ? '?' : initials,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          member.name,
                          style: theme.textTheme.titleLarge?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        if (subtitle.isNotEmpty)
                          Text(
                            subtitle,
                            style: theme.textTheme.bodySmall?.copyWith(color: Colors.white70),
                          ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text(
                      board.month.label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: _HeroStat(
                      label: 'Score',
                      value: member.scoreLabel,
                      caption: PerformanceBands.title(member.scoreBand),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _HeroStat(
                      label: 'Company rank',
                      value: '#${member.rank}',
                      caption: 'of ${member.rankedOutOf}',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _HeroStat(
                      label: 'Team rank',
                      value: member.teamRank == null ? '—' : '#${member.teamRank}',
                      caption: member.teamName ?? 'No team',
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({required this.label, required this.value, required this.caption});

  final String label;
  final String value;
  final String caption;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11)),
          const SizedBox(height: 2),
          Text(
            value,
            style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800),
          ),
          Text(
            caption,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white70, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

/// The four things that need the rep's attention today, each one tap away.
class _TodayGrid extends StatelessWidget {
  const _TodayGrid({required this.board});

  final StaffDashboard board;

  int _metric(String widget, String code) {
    for (final metric in board.widgets[widget]?.metrics ?? const <DashboardMetric>[]) {
      if (metric.code == code) {
        return metric.value;
      }
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final tiles = [
      _TodayTile(
        icon: Icons.warning_amber_rounded,
        color: AppColors.danger,
        surface: palette.dangerSurface,
        value: _metric(DashboardWidgets.followUps, 'overdue'),
        label: 'Overdue follow-ups',
        onTap: () => context.push(AppRoutes.tasks),
      ),
      _TodayTile(
        icon: Icons.schedule,
        color: AppColors.warning,
        surface: palette.warningSurface,
        value: _metric(DashboardWidgets.followUps, 'remaining'),
        label: 'Due today',
        onTap: () => context.push(AppRoutes.followUpCalendar),
      ),
      _TodayTile(
        icon: Icons.person_search_outlined,
        color: AppColors.info,
        surface: palette.infoSurface,
        value: _metric(DashboardWidgets.leads, 'open'),
        label: 'Open leads',
        onTap: () => context.push(AppRoutes.leads),
      ),
      _TodayTile(
        icon: Icons.request_quote_outlined,
        color: AppColors.teal,
        surface: palette.tealSoft,
        value: _metric(DashboardWidgets.quotations, 'open'),
        label: 'Open quotations',
        onTap: () => context.push(AppRoutes.quotations),
      ),
    ];
    return Column(
      children: [
        Row(
          children: [
            Expanded(child: tiles[0]),
            const SizedBox(width: AppSpacing.sm),
            Expanded(child: tiles[1]),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Row(
          children: [
            Expanded(child: tiles[2]),
            const SizedBox(width: AppSpacing.sm),
            Expanded(child: tiles[3]),
          ],
        ),
      ],
    );
  }
}

class _TodayTile extends StatelessWidget {
  const _TodayTile({
    required this.icon,
    required this.color,
    required this.surface,
    required this.value,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final Color surface;
  final int value;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: surface, borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: color, size: 22),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$value',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        // Only an overdue count is alarming; zero is good news.
                        color: value > 0 && color == AppColors.danger ? color : null,
                      ),
                    ),
                    Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11, color: context.palette.muted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The month's revenue target: donut, the numbers behind it, and the pace.
class _SalesTargetCard extends StatelessWidget {
  const _SalesTargetCard({
    required this.month,
    required this.target,
    required this.sales,
    required this.onOpenBoard,
  });

  final String month;
  final Target? target;
  final DashboardWidget? sales;
  final VoidCallback? onOpenBoard;

  int _salesMetric(String code) {
    for (final metric in sales?.metrics ?? const <DashboardMetric>[]) {
      if (metric.code == code) {
        return metric.value;
      }
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = target;
    // Without a revenue target the sales widget still knows the month's numbers.
    final achievedMinor = t?.achievedValue ?? _salesMetric('month');
    final targetMinor = t?.targetValue ?? _salesMetric('target');
    final progress = t?.fraction ?? (targetMinor <= 0 ? 0.0 : (achievedMinor / targetMinor).clamp(0.0, 1.0));
    final hasTarget = targetMinor > 0;
    final onTrack = t?.onTrack ?? true;

    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(child: _SectionTitle('Sales target')),
              if (hasTarget && t != null)
                _Pill(
                  label: t.paceLabel,
                  color: onTrack ? _successText(context) : AppColors.warning,
                  surface: onTrack ? context.palette.successSurface : context.palette.warningSurface,
                ),
            ],
          ),
          Text(month, style: theme.textTheme.bodySmall?.copyWith(color: context.palette.muted)),
          const SizedBox(height: AppSpacing.md),
          if (!hasTarget)
            Text(
              'No revenue target set for this month yet.',
              style: theme.textTheme.bodyMedium?.copyWith(color: context.palette.muted),
            )
          else
            Row(
              children: [
                AppDonut(
                  progress: progress,
                  label: '${(progress * 100).round()}%',
                  caption: 'Achieved',
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    children: [
                      _Figure(label: 'Achieved', value: formatRupeesShort(achievedMinor), strong: true),
                      _Figure(label: 'Target', value: formatRupeesShort(targetMinor)),
                      if (t != null) ...[
                        _Figure(
                          label: 'Need per day',
                          value: t.dailyRequired == null
                              ? '—'
                              : t.isMoney
                                  ? formatRupeesShort(t.dailyRequired!)
                                  : t.dailyRequiredLabel,
                        ),
                        _Figure(label: 'Days left', value: '${t.daysRemaining}'),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          if (onOpenBoard != null)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: onOpenBoard,
                icon: const Icon(Icons.speed_outlined, size: 18),
                label: const Text('Sales board'),
              ),
            ),
        ],
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.value, this.strong = false});

  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: TextStyle(fontSize: 12, color: context.palette.muted)),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: strong ? 16 : 13,
              fontWeight: strong ? FontWeight.w800 : FontWeight.w600,
              color: strong ? _accent(context) : null,
            ),
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.color, required this.surface});

  final String label;
  final Color color;
  final Color surface;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: surface, borderRadius: BorderRadius.circular(99)),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }
}

Color _successText(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? const Color(0xFF6FD39B) : AppColors.success;

/// One non-revenue target as a compact progress row.
class _TargetRow extends StatelessWidget {
  const _TargetRow({required this.target});

  final Target target;

  @override
  Widget build(BuildContext context) {
    final color = target.onTrack ? _accent(context) : AppColors.warning;
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => context.push(AppRoutes.targetDetailPath(target.id)),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    target.metricName,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                Text(
                  '${target.achievedLabel} / ${target.targetLabel}',
                  style: TextStyle(fontSize: 12, color: context.palette.muted),
                ),
                const SizedBox(width: 8),
                Text(
                  target.percentLabel,
                  style: TextStyle(fontWeight: FontWeight.w800, color: color),
                ),
              ],
            ),
            const SizedBox(height: 6),
            LinearProgressIndicator(
              value: target.fraction,
              minHeight: 7,
              borderRadius: BorderRadius.circular(99),
              color: color,
              backgroundColor: context.palette.tealSoft,
            ),
          ],
        ),
      ),
    );
  }
}

/// The four score inputs, two per row, coloured by how healthy each one is.
class _KpiGrid extends StatelessWidget {
  const _KpiGrid({required this.kpis});

  final List<PersonalKpi> kpis;

  @override
  Widget build(BuildContext context) {
    if (kpis.isEmpty) {
      return Text(
        'KPIs appear once leads and follow-ups are logged.',
        style: TextStyle(color: context.palette.muted),
      );
    }
    final rows = <Widget>[];
    for (var i = 0; i < kpis.length; i += 2) {
      if (rows.isNotEmpty) {
        rows.add(const SizedBox(height: AppSpacing.sm));
      }
      rows.add(
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: _KpiTile(kpi: kpis[i])),
            const SizedBox(width: AppSpacing.sm),
            Expanded(child: i + 1 < kpis.length ? _KpiTile(kpi: kpis[i + 1]) : const SizedBox()),
          ],
        ),
      );
    }
    return Column(children: rows);
  }
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({required this.kpi});

  final PersonalKpi kpi;

  Color _tone(BuildContext context) {
    final bps = kpi.valueBps;
    if (bps == null) {
      return AppColors.muted;
    }
    if (bps >= 7000) {
      return _successText(context);
    }
    if (bps >= 4000) {
      return AppColors.warning;
    }
    return AppColors.danger;
  }

  @override
  Widget build(BuildContext context) {
    final tone = _tone(context);
    return SectionCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            kpi.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12, color: context.palette.muted),
          ),
          const SizedBox(height: 4),
          Text(
            kpi.valueBps == null ? '—' : kpi.valueLabel,
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: tone),
          ),
          const SizedBox(height: 6),
          LinearProgressIndicator(
            value: kpi.valueBps == null ? 0 : kpi.fraction,
            minHeight: 6,
            borderRadius: BorderRadius.circular(99),
            color: tone,
            backgroundColor: context.palette.tealSoft,
          ),
          const SizedBox(height: 6),
          Text(
            kpi.detail,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 11, color: context.palette.muted),
          ),
        ],
      ),
    );
  }
}
