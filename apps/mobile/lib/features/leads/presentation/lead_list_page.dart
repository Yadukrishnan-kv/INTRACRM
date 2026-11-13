import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_colors.dart';
import '../../../design_system/tokens/app_palette.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../features/auth/application/auth_controller.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../../comms/presentation/lead_contact_launch.dart';
import '../../home/presentation/app_nav_drawer.dart';
import '../application/lead_list_controller.dart';
import '../domain/lead.dart';
import '../domain/lead_list_filter.dart';

enum _LeadScope { all, mine, unassigned }

class LeadListPage extends ConsumerStatefulWidget {
  const LeadListPage({super.key, this.initialFilter});

  /// A drill-down filter from a report row, e.g. tapping "Facebook" under
  /// By source. Passed via `GoRouterState.extra` when pushing [AppRoutes.leads].
  final LeadListFilter? initialFilter;

  @override
  ConsumerState<LeadListPage> createState() => _LeadListPageState();
}

class _LeadListPageState extends ConsumerState<LeadListPage> {
  var _scope = _LeadScope.all;
  LeadListFilter? _filter;

  @override
  void initState() {
    super.initState();
    _filter = widget.initialFilter;
  }

  @override
  Widget build(BuildContext context) {
    final asyncLeads = ref.watch(leadListControllerProvider);
    final canCreate = ref.watch(authControllerProvider).user?.canCreateLead == true;
    final membershipId = ref.watch(authControllerProvider).user?.membershipId;

    return Scaffold(
      backgroundColor: context.palette.canvas,
      drawer: const AppNavDrawer(),
      appBar: AppBar(
        leading: const MenuDrawerButton(),
        title: const Text(AppStrings.leads),
        actions: [
          IconButton(
            tooltip: AppStrings.search,
            onPressed: () => context.push(AppRoutes.search),
            icon: const Icon(Icons.search),
          ),
          IconButton(
            tooltip: AppStrings.pipeline,
            onPressed: () => context.push(AppRoutes.pipeline),
            icon: const Icon(Icons.tune),
          ),
        ],
      ),
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              heroTag: 'fab-leads',
              onPressed: () async {
                await context.push(AppRoutes.leadCreate);
                await ref.read(leadListControllerProvider.notifier).refresh();
              },
              icon: const Icon(Icons.add),
              label: const Text('Add Lead'),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Row(
              children: [
                _tab('All Leads', _LeadScope.all),
                _tab('My Leads', _LeadScope.mine),
                _tab('Unassigned', _LeadScope.unassigned),
              ],
            ),
          ),
          if (_filter != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Chip(
                  avatar: const Icon(Icons.filter_alt, size: 16, color: AppColors.teal),
                  label: Text(_filter!.label),
                  backgroundColor: context.palette.tealSoft,
                  labelStyle: const TextStyle(color: AppColors.teal, fontWeight: FontWeight.w600),
                  deleteIcon: const Icon(Icons.close, size: 16),
                  onDeleted: () => setState(() => _filter = null),
                ),
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.read(leadListControllerProvider.notifier).refresh(),
              child: AppAsyncBody(
                asyncValue: asyncLeads,
                isEmpty: (page) => _visible(page.items, membershipId).isEmpty,
                emptyTitle: 'No leads yet',
                emptyMessage: 'Create a lead to capture customer demand.',
                builder: (page) {
                  final items = _visible(page.items, membershipId);
                  final extra = page.page.hasMore ? 1 : 0;
                  return NotificationListener<ScrollNotification>(
                    onNotification: (notification) {
                      if (notification.metrics.extentAfter < 240) {
                        ref.read(leadListControllerProvider.notifier).loadMore();
                      }
                      return false;
                    },
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                      itemCount: items.length + extra,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        if (index >= items.length) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 16),
                            child: Center(child: CircularProgressIndicator()),
                          );
                        }
                        return _LeadCard(lead: items[index]);
                      },
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tab(String label, _LeadScope scope) {
    final selected = _scope == scope;
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.only(right: 6),
        child: ChoiceChip(
          selected: selected,
          label: Text(label),
          selectedColor: context.palette.tealSoft,
          labelStyle: TextStyle(
            color: selected ? AppColors.teal : context.palette.muted,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            fontSize: 12,
          ),
          onSelected: (_) => setState(() => _scope = scope),
        ),
      ),
    );
  }

  List<Lead> _visible(List<Lead> items, String? membershipId) {
    return [
      for (final lead in items)
        if ((_scope == _LeadScope.all ||
                (_scope == _LeadScope.mine && lead.ownerMembershipId == membershipId) ||
                (_scope == _LeadScope.unassigned &&
                    (lead.ownerMembershipId == null || lead.ownerMembershipId!.isEmpty))) &&
            (_filter?.matches(lead) ?? true))
          lead,
    ];
  }
}

class _LeadCard extends ConsumerWidget {
  const _LeadCard({required this.lead});

  final Lead lead;

  bool get _hasPhone => lead.primaryPhone != null && lead.primaryPhone!.trim().isNotEmpty;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final follow = lead.nextFollowUpAt?.toLocal();
    return Card(
      child: InkWell(
        onTap: () => context.push(AppRoutes.leadDetailPath(lead.id)),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(lead.displayName, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  ),
                  StatusBadge(label: lead.stageName ?? lead.lifecycleStatus),
                  const SizedBox(width: 8),
                  Text(_relative(lead.lastActivityAt ?? lead.updatedAt), style: TextStyle(color: context.palette.muted, fontSize: 11)),
                ],
              ),
              SizedBox(height: 8),
              Wrap(
                spacing: 12,
                runSpacing: 4,
                children: [
                  _meta(context, Icons.campaign_outlined, lead.sourceName ?? '—'),
                  _meta(context, Icons.place_outlined, lead.city ?? '—'),
                  _meta(context, Icons.inventory_2_outlined, lead.requirement ?? lead.title),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.event, size: 16, color: AppColors.teal),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      follow == null
                          ? 'No follow-up scheduled'
                          : 'Next Follow-up  ${follow.day.toString().padLeft(2, '0')} ${_month(follow.month)} ${follow.year}',
                      style: TextStyle(fontSize: 12, color: context.palette.muted),
                    ),
                  ),
                  CircleAvatar(
                    radius: 16,
                    backgroundColor: context.palette.tealSoft,
                    child: IconButton(
                      padding: EdgeInsets.zero,
                      iconSize: 18,
                      color: AppColors.teal,
                      onPressed: _hasPhone ? () => _call(context, ref) : null,
                      icon: const Icon(Icons.call),
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

  Future<void> _call(BuildContext context, WidgetRef ref) =>
      openLeadDialer(context, ref, lead);

  Widget _meta(BuildContext context, IconData icon, String text) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: context.palette.muted),
        SizedBox(width: 4),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 140),
          child: Text(text, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: context.palette.muted)),
        ),
      ],
    );
  }

  String _relative(DateTime at) {
    final delta = DateTime.now().difference(at);
    if (delta.inMinutes < 60) {
      return '${delta.inMinutes.clamp(1, 59)}m ago';
    }
    if (delta.inHours < 24) {
      return '${delta.inHours}h ago';
    }
    return '${delta.inDays}d ago';
  }

  String _month(int month) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[month - 1];
  }
}
