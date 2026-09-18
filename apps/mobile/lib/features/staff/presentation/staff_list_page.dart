import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../application/staff_providers.dart';
import '../domain/staff_models.dart';

class StaffListPage extends ConsumerStatefulWidget {
  const StaffListPage({super.key});

  @override
  ConsumerState<StaffListPage> createState() => _StaffListPageState();
}

class _StaffListPageState extends ConsumerState<StaffListPage> {
  var _loading = true;
  String? _error;
  String? _status;
  List<StaffMember> _staff = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final result = unwrapApi<List<StaffMember>>(
      await ref.read(staffApiProvider).listStaff(status: _status),
    );
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final value):
          _staff = value;
        case Err(:final failure):
          _error = failure.message;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: AppStrings.staff,
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          await context.push(AppRoutes.staffCreate);
          await _load();
        },
        child: const Icon(Icons.person_add_alt_1),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, 0),
            child: Wrap(
              spacing: AppSpacing.xs,
              children: [
                ChoiceChip(
                  label: const Text('All'),
                  selected: _status == null,
                  onSelected: (_) {
                    setState(() => _status = null);
                    _load();
                  },
                ),
                ChoiceChip(
                  label: const Text(AppStrings.active),
                  selected: _status == 'active',
                  onSelected: (_) {
                    setState(() => _status = 'active');
                    _load();
                  },
                ),
                ChoiceChip(
                  label: const Text(AppStrings.inactive),
                  selected: _status == 'suspended',
                  onSelected: (_) {
                    setState(() => _status = 'suspended');
                    _load();
                  },
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                ? Center(child: Text(_error!))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.builder(
                      itemCount: _staff.length,
                      itemBuilder: (context, index) {
                        final member = _staff[index];
                        return ListTile(
                          title: Text(member.fullName),
                          subtitle: Text(
                            [
                              member.email ?? member.employeeCode,
                              member.active ? AppStrings.active : AppStrings.inactive,
                              member.roles.map((role) => role.name).join(', '),
                              member.teams.map((team) => team.name).join(', '),
                            ].whereType<String>().where((item) => item.isNotEmpty).join(' · '),
                          ),
                          trailing: Icon(
                            member.active ? Icons.check_circle : Icons.pause_circle,
                            color: member.active ? Colors.green : Colors.orange,
                          ),
                          onTap: () async {
                            await context.push(AppRoutes.staffDetailPath(member.id));
                            await _load();
                          },
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
