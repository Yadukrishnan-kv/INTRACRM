import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/staff_providers.dart';
import '../domain/staff_models.dart';

class TeamsPage extends ConsumerStatefulWidget {
  const TeamsPage({super.key});

  @override
  ConsumerState<TeamsPage> createState() => _TeamsPageState();
}

class _TeamsPageState extends ConsumerState<TeamsPage> {
  var _loading = true;
  String? _error;
  List<StaffTeam> _teams = const [];
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
    final teams = unwrapApi<List<StaffTeam>>(await ref.read(staffApiProvider).listTeams());
    final staff = unwrapApi<List<StaffMember>>(await ref.read(staffApiProvider).listStaff());
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      if (teams is Err) {
        _error = teams.failure.message;
        return;
      }
      if (staff is Err) {
        _error = staff.failure.message;
        return;
      }
      _teams = (teams as Success<List<StaffTeam>>).value;
      _staff = (staff as Success<List<StaffMember>>).value;
    });
  }

  Future<void> _create() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => const _TeamCreateSheet(),
    );
    if (created == true) {
      await _load();
    }
  }

  Future<void> _edit(StaffTeam team) async {
    final updated = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _TeamEditSheet(team: team),
    );
    if (updated == true) {
      await _load();
    }
  }

  Future<void> _delete(StaffTeam team) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text(AppStrings.deleteTeam),
          content: Text('Delete ${team.name}? Staff stay in the directory.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text(AppStrings.deleteTeam)),
          ],
        );
      },
    );
    if (confirmed != true) {
      return;
    }
    final result = unwrapApi<Map<String, dynamic>>(
      await ref.read(staffApiProvider).deleteTeam(team.id),
    );
    if (!mounted) {
      return;
    }
    if (result is Err) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.failure.message)));
      return;
    }
    await _load();
  }

  Future<void> _editMembers(StaffTeam team) async {
    final updated = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _TeamMembersSheet(team: team, staff: _staff),
    );
    if (updated == true) {
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: AppStrings.teams,
      floatingActionButton: FloatingActionButton(
        onPressed: _create,
        child: const Icon(Icons.group_add),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(child: Text(_error!))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView.builder(
                itemCount: _teams.length,
                itemBuilder: (context, index) {
                  final team = _teams[index];
                  return ListTile(
                    title: Text(team.name),
                    subtitle: Text(
                      '${team.code} · ${team.memberCount} members · ${team.isActive ? AppStrings.active : AppStrings.inactive}',
                    ),
                    trailing: PopupMenuButton<String>(
                      onSelected: (value) {
                        if (value == 'edit') {
                          _edit(team);
                        } else if (value == 'members') {
                          _editMembers(team);
                        } else if (value == 'delete') {
                          _delete(team);
                        }
                      },
                      itemBuilder: (context) => const [
                        PopupMenuItem(value: 'edit', child: Text(AppStrings.editTeam)),
                        PopupMenuItem(value: 'members', child: Text('Members')),
                        PopupMenuItem(value: 'delete', child: Text(AppStrings.deleteTeam)),
                      ],
                    ),
                    onTap: () => _editMembers(team),
                  );
                },
              ),
            ),
    );
  }
}

class _TeamCreateSheet extends ConsumerStatefulWidget {
  const _TeamCreateSheet();

  @override
  ConsumerState<_TeamCreateSheet> createState() => _TeamCreateSheetState();
}

class _TeamCreateSheetState extends ConsumerState<_TeamCreateSheet> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _code = TextEditingController();
  var _submitting = false;

  @override
  void dispose() {
    _name.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    setState(() => _submitting = true);
    final result = unwrapApi<StaffTeam>(
      await ref.read(staffApiProvider).createTeam(
        code: _code.text.trim(),
        name: _name.text.trim(),
      ),
    );
    if (!mounted) {
      return;
    }
    setState(() => _submitting = false);
    if (result is Err) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(result.failure.message)));
      return;
    }
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: AppSpacing.lg,
        right: AppSpacing.lg,
        top: AppSpacing.lg,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.lg,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppTextField(
              controller: _name,
              label: AppStrings.teamName,
              validator: (value) =>
                  value == null || value.trim().length < 2 ? 'Name is required' : null,
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _code,
              label: AppStrings.teamCode,
              validator: (value) =>
                  value == null || value.trim().length < 2 ? 'Code is required' : null,
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: AppStrings.createTeam,
              loading: _submitting,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}

class _TeamEditSheet extends ConsumerStatefulWidget {
  const _TeamEditSheet({required this.team});

  final StaffTeam team;

  @override
  ConsumerState<_TeamEditSheet> createState() => _TeamEditSheetState();
}

class _TeamEditSheetState extends ConsumerState<_TeamEditSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late var _active = widget.team.isActive;
  var _submitting = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.team.name);
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    setState(() => _submitting = true);
    final result = unwrapApi<StaffTeam>(
      await ref.read(staffApiProvider).updateTeam(
        teamId: widget.team.id,
        name: _name.text.trim(),
        isActive: _active,
      ),
    );
    if (!mounted) {
      return;
    }
    setState(() => _submitting = false);
    if (result is Err) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.failure.message)));
      return;
    }
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: AppSpacing.lg,
        right: AppSpacing.lg,
        top: AppSpacing.lg,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.lg,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppTextField(
              controller: _name,
              label: AppStrings.teamName,
              validator: (value) =>
                  value == null || value.trim().length < 2 ? 'Name is required' : null,
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text(AppStrings.active),
              value: _active,
              onChanged: (value) => setState(() => _active = value),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: AppStrings.saveTeam,
              loading: _submitting,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}

class _TeamMembersSheet extends ConsumerStatefulWidget {
  const _TeamMembersSheet({required this.team, required this.staff});

  final StaffTeam team;
  final List<StaffMember> staff;

  @override
  ConsumerState<_TeamMembersSheet> createState() => _TeamMembersSheetState();
}

class _TeamMembersSheetState extends ConsumerState<_TeamMembersSheet> {
  late Set<String> _selected;
  var _saving = false;

  @override
  void initState() {
    super.initState();
    _selected = widget.team.members.map((member) => member.id).toSet();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final result = unwrapApi<StaffTeam>(
      await ref.read(staffApiProvider).replaceTeamMembers(
        teamId: widget.team.id,
        membershipIds: _selected.toList(),
      ),
    );
    if (!mounted) {
      return;
    }
    setState(() => _saving = false);
    if (result is Err) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(result.failure.message)));
      return;
    }
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.7,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          children: [
            Text(widget.team.name, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: AppSpacing.md),
            Expanded(
              child: ListView(
                children: [
                  for (final member in widget.staff)
                    CheckboxListTile(
                      title: Text(member.fullName),
                      subtitle: Text(member.email ?? member.status),
                      value: _selected.contains(member.id),
                      onChanged: (checked) {
                        setState(() {
                          if (checked == true) {
                            _selected.add(member.id);
                          } else {
                            _selected.remove(member.id);
                          }
                        });
                      },
                    ),
                ],
              ),
            ),
            AppButton(
              label: AppStrings.saveTeamMembers,
              loading: _saving,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}
