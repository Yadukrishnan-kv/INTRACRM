import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/app_empty_state.dart';
import '../../../design_system/components/app_error_view.dart';
import '../../../design_system/components/app_loading.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_palette.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../auth/application/auth_controller.dart';
import '../../comms/application/comms_providers.dart';
import '../../comms/domain/comms_models.dart';
import '../../leads/domain/lead.dart';
import '../../staff/domain/staff_models.dart';
import '../application/follow_up_providers.dart';
import '../domain/follow_up_calendar.dart';

/// Follow-Up Reminders: a month grid of per-day counts with the selected
/// day's agenda underneath, one tap from calling the customer.
class FollowUpCalendarPage extends ConsumerWidget {
  const FollowUpCalendarPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncMonth = ref.watch(followUpCalendarProvider);
    final filter = ref.watch(followUpCalendarFilterProvider);
    final canCreate = ref.watch(authControllerProvider).user?.canCreateFollowUp == true;

    return AppScaffold(
      title: AppStrings.followUpCalendar,
      actions: [
        IconButton(
          tooltip: AppStrings.followUps,
          icon: const Icon(Icons.view_list_outlined),
          onPressed: () => context.push(AppRoutes.tasks),
        ),
      ],
      floatingActionButton: canCreate
          ? FloatingActionButton(
              heroTag: 'fab-follow-up-calendar',
              onPressed: () async {
                await context.push(AppRoutes.followUpCreate);
                await _refresh(ref);
              },
              child: const Icon(Icons.add),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: AppAsyncBody<FollowUpCalendarMonth>(
          asyncValue: asyncMonth,
          builder: (month) {
            final selected = filter.selectedDay ?? month.defaultSelectedDay;
            final day = month.dayFor(selected);
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.md,
                AppSpacing.sm,
                AppSpacing.md,
                AppSpacing.xl,
              ),
              children: [
                const _OwnerSelector(),
                const SizedBox(height: AppSpacing.xs),
                SectionCard(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: [
                      _MonthHeader(month: month),
                      const SizedBox(height: AppSpacing.xs),
                      _MonthGrid(
                        month: month,
                        selected: selected,
                        onSelect: (date) => ref
                            .read(followUpCalendarFilterProvider.notifier)
                            .update((current) => current.copyWith(selectedDay: date)),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                _BandLegend(totals: month.totals),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      _longDate(selected),
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      '${day?.total ?? 0} ${AppStrings.events}',
                      style: Theme.of(context)
                          .textTheme
                          .labelSmall
                          ?.copyWith(color: context.palette.muted, letterSpacing: 1.2),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xs),
                _DayAgenda(day: selected),
              ],
            );
          },
        ),
      ),
    );
  }

  Future<void> _refresh(WidgetRef ref) async {
    await ref.read(followUpCalendarProvider.notifier).refresh();
    final selected = ref.read(followUpCalendarFilterProvider).selectedDay;
    if (selected != null) {
      ref.invalidate(followUpDayAgendaProvider(selected));
    }
  }
}

/// "All Users" / one staff member. Managers see the picker; a rep without
/// staff-read permission only ever sees their own board anyway.
class _OwnerSelector extends ConsumerWidget {
  const _OwnerSelector();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(followUpCalendarFilterProvider);
    // Only a manager can look at someone else's calendar; everyone else
    // simply sees their own and needs no picker.
    final canPick = ref.watch(authControllerProvider).user?.canManageUsers == true;
    if (!canPick) {
      return const SizedBox.shrink();
    }
    final options =
        ref.watch(followUpOwnerOptionsProvider).asData?.value ?? const <StaffMember>[];
    final selectedName = filter.assignedToMembershipId == null
        ? AppStrings.allUsers
        : options
                .where((member) => member.id == filter.assignedToMembershipId)
                .map((member) => member.fullName)
                .firstOrNull ??
            AppStrings.allUsers;

    return SectionCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        dense: true,
        leading: const Icon(Icons.person_outline),
        title: Text(selectedName, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(
          AppStrings.tapToSelectUsers,
          style: TextStyle(fontSize: 11, color: context.palette.muted),
        ),
        trailing: const Icon(Icons.arrow_drop_down),
        onTap: () async {
          final picked = await showModalBottomSheet<_OwnerChoice>(
            context: context,
            showDragHandle: true,
            builder: (sheetContext) => SafeArea(
              child: ListView(
                shrinkWrap: true,
                children: [
                  ListTile(
                    leading: const Icon(Icons.groups_outlined),
                    title: const Text(AppStrings.allUsers),
                    onTap: () => Navigator.pop(sheetContext, const _OwnerChoice(null)),
                  ),
                  for (final member in options)
                    ListTile(
                      leading: InitialsAvatar(name: member.fullName, size: 32),
                      title: Text(member.fullName),
                      subtitle: member.designation == null ? null : Text(member.designation!),
                      onTap: () => Navigator.pop(sheetContext, _OwnerChoice(member.id)),
                    ),
                ],
              ),
            ),
          );
          if (picked != null) {
            ref.read(followUpCalendarFilterProvider.notifier).update(
                  (current) => current.copyWith(assignedToMembershipId: picked.membershipId),
                );
          }
        },
      ),
    );
  }
}

/// Wrapper so "All Users" (a null id) is distinguishable from a dismissed sheet.
class _OwnerChoice {
  const _OwnerChoice(this.membershipId);

  final String? membershipId;
}

class _MonthHeader extends ConsumerWidget {
  const _MonthHeader({required this.month});

  final FollowUpCalendarMonth month;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    void step(int delta) {
      ref.read(followUpCalendarFilterProvider.notifier).update(
            (current) => current.copyWith(
              month: shiftMonth(month.month, delta),
              selectedDay: null,
            ),
          );
    }

    return Row(
      children: [
        IconButton(
          icon: const Icon(Icons.chevron_left),
          onPressed: () => step(-1),
        ),
        Expanded(
          child: Column(
            children: [
              Text(
                monthNameOf(month.month),
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              Text(
                yearOf(month.month),
                style: Theme.of(context)
                    .textTheme
                    .labelSmall
                    ?.copyWith(color: context.palette.muted),
              ),
            ],
          ),
        ),
        IconButton(
          icon: const Icon(Icons.chevron_right),
          onPressed: () => step(1),
        ),
      ],
    );
  }
}

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({
    required this.month,
    required this.selected,
    required this.onSelect,
  });

  final FollowUpCalendarMonth month;
  final String selected;
  final void Function(String date) onSelect;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            for (final label in followUpWeekdayLabels)
              Expanded(
                child: Center(
                  child: Text(
                    label,
                    style: Theme.of(context)
                        .textTheme
                        .labelSmall
                        ?.copyWith(color: context.palette.muted),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 4),
        for (final week in month.weeks)
          Row(
            children: [
              for (final day in week)
                Expanded(
                  child: _DayCell(
                    day: day,
                    selected: day.date == selected,
                    onTap: () => onSelect(day.date),
                  ),
                ),
            ],
          ),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({required this.day, required this.selected, required this.onTap});

  final FollowUpCalendarDay day;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = !day.inMonth;
    final badge = bandColor(day.band, context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        height: 44,
        margin: const EdgeInsets.all(1),
        decoration: BoxDecoration(
          color: selected ? AppColors.teal : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: day.isToday && !selected
              ? Border.all(color: AppColors.teal, width: 1.4)
              : null,
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Text(
              day.dayLabel,
              style: theme.textTheme.bodySmall?.copyWith(
                fontWeight: day.isToday ? FontWeight.w800 : FontWeight.w500,
                color: selected
                    ? Colors.white
                    : muted
                        ? context.palette.muted.withValues(alpha: 0.5)
                        : null,
              ),
            ),
            if (day.total > 0 && badge != null)
              Positioned(
                top: 2,
                right: 4,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  decoration: BoxDecoration(
                    color: badge,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    '${day.total}',
                    style: const TextStyle(
                      fontSize: 9,
                      height: 1.2,
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

Color? bandColor(FollowUpDayBand? band, BuildContext context) {
  return switch (band) {
    FollowUpDayBand.overdue => AppColors.danger,
    FollowUpDayBand.due => AppColors.info,
    FollowUpDayBand.completed => AppColors.success,
    FollowUpDayBand.cancelled => context.palette.muted,
    null => null,
  };
}

class _BandLegend extends StatelessWidget {
  const _BandLegend({required this.totals});

  final FollowUpCalendarTotals totals;

  @override
  Widget build(BuildContext context) {
    final entries = <(String, int, Color)>[
      (AppStrings.overdueLabel, totals.overdue, AppColors.danger),
      (AppStrings.dueLabel, totals.due, AppColors.info),
      (AppStrings.completedLabel, totals.completed, AppColors.success),
    ];
    return Wrap(
      spacing: AppSpacing.md,
      children: [
        for (final (label, count, color) in entries)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 5),
              Text(
                '$label · $count',
                style: Theme.of(context)
                    .textTheme
                    .labelSmall
                    ?.copyWith(color: context.palette.muted),
              ),
            ],
          ),
      ],
    );
  }
}

class _DayAgenda extends ConsumerWidget {
  const _DayAgenda({required this.day});

  final String day;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final agenda = ref.watch(followUpDayAgendaProvider(day));
    return agenda.when(
      loading: () => const Padding(padding: EdgeInsets.all(24), child: AppLoading()),
      error: (error, _) => AppErrorView(failure: UnexpectedFailure(error.toString())),
      data: (result) => result.when(
        failure: (failure) => AppErrorView(failure: failure),
        success: (items) {
          if (items.isEmpty) {
            return const AppEmptyState(
              title: AppStrings.noFollowUpsOnDay,
              message: AppStrings.noFollowUpsOnDayMessage,
            );
          }
          return Column(
            children: [
              for (final item in items) _AgendaTile(followUp: item),
            ],
          );
        },
      ),
    );
  }
}

class _AgendaTile extends ConsumerWidget {
  const _AgendaTile({required this.followUp});

  final LeadFollowUp followUp;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final accent = followUp.status == 'completed'
        ? AppColors.success
        : followUp.overdue
            ? AppColors.danger
            : AppColors.info;
    final customer = followUp.leadCustomerName ?? followUp.leadTitle ?? followUp.title;
    final company = followUp.leadTitle == customer ? null : followUp.leadTitle;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          children: [
            Container(width: 4, color: accent),
            Expanded(
              child: ListTile(
                onTap: () => context.push(AppRoutes.followUpDetailPath(followUp.id)),
                title: Text(
                  customer,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (company != null)
                      Text(
                        company,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 11, color: context.palette.muted),
                      ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Icon(Icons.schedule, size: 12, color: context.palette.muted),
                        const SizedBox(width: 4),
                        Text(_time(followUp.dueAt), style: theme.textTheme.labelSmall),
                        const SizedBox(width: 8),
                        StatusBadge(label: FollowUpTypes.title(followUp.type)),
                      ],
                    ),
                  ],
                ),
                trailing: followUp.leadId == null || (followUp.leadPhone ?? '').isEmpty
                    ? null
                    : IconButton(
                        tooltip: AppStrings.call,
                        icon: const Icon(Icons.phone, color: AppColors.success),
                        onPressed: () => _call(context, ref, followUp.leadId!),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Logs the call through the comms API, then hands the `tel:` URI it returns
  /// to the launcher — the same path the lead detail comms bar takes, so the
  /// activity timeline records a call placed from the calendar too.
  Future<void> _call(BuildContext context, WidgetRef ref, String leadId) async {
    final messenger = ScaffoldMessenger.of(context);
    final result = unwrapComms<CommsResult>(await ref.read(commsApiProvider).call(leadId));
    if (!context.mounted) {
      return;
    }
    switch (result) {
      case Err(:final failure):
        messenger.showSnackBar(SnackBar(content: Text(failure.message)));
      case Success(:final value):
        final uri = value.launchUri;
        if (uri != null && !value.sentByGateway) {
          final opened = await ref.read(commsLauncherProvider).open(uri);
          if (!opened) {
            messenger.showSnackBar(const SnackBar(content: Text(AppStrings.callCouldNotOpen)));
            return;
          }
        }
        messenger.showSnackBar(const SnackBar(content: Text(AppStrings.callConnecting)));
    }
  }

  static String _time(DateTime value) {
    final local = value.toLocal();
    final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final minute = local.minute.toString().padLeft(2, '0');
    return '$hour:$minute ${local.hour < 12 ? 'AM' : 'PM'}';
  }
}

String _longDate(String ymd) {
  if (ymd.length < 10) {
    return ymd;
  }
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  final month = int.tryParse(ymd.substring(5, 7)) ?? 1;
  return '${months[(month - 1).clamp(0, 11)]} ${int.parse(ymd.substring(8, 10))}, ${ymd.substring(0, 4)}';
}
