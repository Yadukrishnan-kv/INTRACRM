import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/components/confirm_dialog.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../application/comms_providers.dart';
import '../domain/comms_models.dart';

/// Settings → Message templates: WhatsApp / SMS templates used by the lead
/// comms bar. Management needs `tenant:manage_settings` (route-guarded).
class MessageTemplatesPage extends ConsumerStatefulWidget {
  const MessageTemplatesPage({super.key});

  @override
  ConsumerState<MessageTemplatesPage> createState() => _MessageTemplatesPageState();
}

class _MessageTemplatesPageState extends ConsumerState<MessageTemplatesPage> {
  var _loading = true;
  String? _error;
  List<CommsTemplate> _templates = const [];

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
    final result = unwrapComms<List<CommsTemplate>>(
      await ref.read(commsApiProvider).templates(),
    );
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final value):
          _templates = value;
        case Err(:final failure):
          _error = failure.message;
      }
    });
  }

  Future<void> _openEditor([CommsTemplate? template]) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _TemplateSheet(template: template),
    );
    if (saved == true) {
      await _load();
    }
  }

  Future<void> _delete(CommsTemplate template) async {
    final confirmed = await showConfirmDialog(
      context,
      title: AppStrings.deleteTemplate,
      message: AppStrings.deleteTemplateMessage(template.name),
      confirmLabel: AppStrings.deleteTemplate,
    );
    if (!confirmed || !mounted) {
      return;
    }
    final result = await ref.read(commsApiProvider).deleteTemplate(template.id);
    if (!mounted) {
      return;
    }
    if (result is Err) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.failure.message)));
      return;
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: AppStrings.messageTemplates,
      floatingActionButton: FloatingActionButton(
        heroTag: 'fab-templates',
        tooltip: AppStrings.newTemplate,
        onPressed: () => _openEditor(),
        child: const Icon(Icons.add),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(child: Text(_error!))
          : _templates.isEmpty
          ? const Center(child: Text(AppStrings.noTemplates))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView.builder(
                itemCount: _templates.length,
                itemBuilder: (context, index) {
                  final template = _templates[index];
                  return ListTile(
                    leading: Icon(
                      template.channel == 'sms' ? Icons.sms_outlined : Icons.chat_outlined,
                    ),
                    title: Text(template.name),
                    subtitle: Text(
                      '${template.code} · ${template.body}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    trailing: PopupMenuButton<String>(
                      onSelected: (value) {
                        if (value == 'edit') {
                          _openEditor(template);
                        } else if (value == 'delete') {
                          _delete(template);
                        }
                      },
                      itemBuilder: (context) => const [
                        PopupMenuItem(value: 'edit', child: Text(AppStrings.editTemplate)),
                        PopupMenuItem(value: 'delete', child: Text(AppStrings.deleteTemplate)),
                      ],
                    ),
                    onTap: () => _openEditor(template),
                  );
                },
              ),
            ),
    );
  }
}

class _TemplateSheet extends ConsumerStatefulWidget {
  const _TemplateSheet({this.template});

  final CommsTemplate? template;

  @override
  ConsumerState<_TemplateSheet> createState() => _TemplateSheetState();
}

class _TemplateSheetState extends ConsumerState<_TemplateSheet> {
  static const _channels = ['whatsapp', 'sms'];

  final _formKey = GlobalKey<FormState>();
  late final _code = TextEditingController(text: widget.template?.code ?? '');
  late final _name = TextEditingController(text: widget.template?.name ?? '');
  late final _body = TextEditingController(text: widget.template?.body ?? '');
  late var _channel = widget.template?.channel ?? _channels.first;
  var _saving = false;

  bool get _isEdit => widget.template != null;

  @override
  void dispose() {
    _code.dispose();
    _name.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    setState(() => _saving = true);
    final api = ref.read(commsApiProvider);
    final template = widget.template;
    final result = template == null
        ? await api.createTemplate(
            channel: _channel,
            code: _code.text.trim(),
            name: _name.text.trim(),
            body: _body.text.trim(),
          )
        : await api.updateTemplate(
            template.id,
            name: _name.text.trim(),
            body: _body.text.trim(),
          );
    if (!mounted) {
      return;
    }
    setState(() => _saving = false);
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
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _isEdit ? AppStrings.editTemplate : AppStrings.newTemplate,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: AppSpacing.md),
              DropdownButtonFormField<String>(
                initialValue: _channel,
                decoration: const InputDecoration(labelText: AppStrings.templateChannel),
                items: const [
                  DropdownMenuItem(value: 'whatsapp', child: Text(AppStrings.whatsapp)),
                  DropdownMenuItem(value: 'sms', child: Text(AppStrings.sms)),
                ],
                onChanged: _isEdit ? null : (value) => setState(() => _channel = value ?? _channel),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _code,
                label: AppStrings.templateCode,
                enabled: !_isEdit,
                validator: (value) => RegExp(r'^[a-z][a-z0-9_]{1,79}$').hasMatch(value?.trim() ?? '')
                    ? null
                    : AppStrings.templateCodeRule,
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _name,
                label: AppStrings.templateName,
                validator: (value) =>
                    (value?.trim().length ?? 0) < 2 ? AppStrings.templateNameRequired : null,
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _body,
                label: AppStrings.templateBody,
                maxLines: 5,
                validator: (value) =>
                    (value?.trim().isEmpty ?? true) ? AppStrings.templateBodyRequired : null,
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(label: AppStrings.save, loading: _saving, onPressed: _save),
            ],
          ),
        ),
      ),
    );
  }
}
