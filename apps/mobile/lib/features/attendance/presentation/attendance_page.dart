import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_error_view.dart';
import '../../../design_system/components/app_loading.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../site_visits/application/device_location.dart';
import '../application/attendance_providers.dart';
import '../domain/attendance.dart';

class AttendancePage extends ConsumerStatefulWidget {
  const AttendancePage({super.key});

  @override
  ConsumerState<AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends ConsumerState<AttendancePage> {
  AttendanceToday? _today;
  AttendanceDaysPage? _days;
  Failure? _failure;
  var _loading = true;
  var _busy = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    final today = await ref.read(attendanceApiProvider).today();
    final days = await ref.read(attendanceApiProvider).days();
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      if (today is Success) {
        _today = today.value.data;
      } else if (today is Err) {
        _failure = today.failure;
      }
      if (days is Success) {
        _days = days.value.data;
      }
    });
  }

  Future<void> _punch(bool punchingIn) async {
    final location = await DeviceLocation.current();
    if (!mounted) {
      return;
    }
    if (location == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('GPS is required. Enable location and try again.')),
      );
      return;
    }
    setState(() => _busy = true);
    final result = punchingIn
        ? await ref.read(attendanceApiProvider).punchIn(location: location)
        : await ref.read(attendanceApiProvider).punchOut(location: location);
    if (!mounted) {
      return;
    }
    setState(() => _busy = false);
    if (result is Err) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.failure.message)),
      );
      return;
    }
    await _reload();
  }

  String _clock(DateTime? value) {
    if (value == null) {
      return '—';
    }
    final local = value.toLocal();
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  @override
  Widget build(BuildContext context) {
    final today = _today;
    return AppScaffold(
      title: AppStrings.attendance,
      actions: [
        IconButton(
          tooltip: AppStrings.attendanceReport,
          onPressed: () => context.push(AppRoutes.attendanceReport),
          icon: const Icon(Icons.bar_chart_outlined),
        ),
      ],
      body: _loading
          ? const AppLoading()
          : _failure != null || today == null
          ? AppErrorView(failure: _failure ?? const UnexpectedFailure('Attendance not found'), onRetry: _reload)
          : RefreshIndicator(
              onRefresh: _reload,
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.md),
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            AttendanceStatuses.title(today.today.status),
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          Text(
                            today.open == null
                                ? 'Not punched in · late after ${today.lateAfter}'
                                : 'Punched in at ${_clock(today.open!.punchedInAt)} · ${formatMinutes(today.open!.minutesWorked)}',
                          ),
                          if (today.open?.inLocation != null)
                            Text('GPS ${today.open!.inLocation!.label}'),
                          const SizedBox(height: AppSpacing.md),
                          if (_busy)
                            const AppLoading()
                          else if (today.open == null)
                            AppButton(label: AppStrings.punchIn, onPressed: () => _punch(true))
                          else
                            AppButton(label: AppStrings.punchOut, onPressed: () => _punch(false)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text(AppStrings.attendanceDays, style: Theme.of(context).textTheme.titleMedium),
                  if (_days == null || _days!.items.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: AppSpacing.sm),
                      child: Text('No days yet'),
                    )
                  else
                    for (final day in _days!.items)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(day.date),
                        subtitle: Text(
                          [
                            AttendanceStatuses.title(day.status),
                            if (day.firstInAt != null) 'In ${_clock(day.firstInAt)}',
                            if (day.lastOutAt != null) 'Out ${_clock(day.lastOutAt)}',
                            formatMinutes(day.minutesWorked),
                          ].join(' · '),
                        ),
                      ),
                ],
              ),
            ),
    );
  }
}
