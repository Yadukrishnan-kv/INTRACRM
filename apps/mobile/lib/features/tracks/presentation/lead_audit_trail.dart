import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/premium_ui.dart';
import '../../../design_system/tokens/app_palette.dart';
import '../../../l10n/app_strings.dart';
import '../domain/track_row.dart';
import 'track_report_page.dart';

/// Audit trail section for lead detail (mirrors web's lead "Audit trail" card).
/// Callers gate it on `audit:read`.
class LeadAuditTrail extends ConsumerStatefulWidget {
  const LeadAuditTrail({super.key, required this.leadId});

  final String leadId;

  @override
  ConsumerState<LeadAuditTrail> createState() => _LeadAuditTrailState();
}

class _LeadAuditTrailState extends ConsumerState<LeadAuditTrail> {
  final _rows = <TrackRow>[];
  String? _cursor;
  var _hasMore = false;
  var _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool more = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final result = await ref
        .read(tracksApiProvider)
        .leadTracks(widget.leadId, cursor: more ? _cursor : null);
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final value):
          if (!more) {
            _rows.clear();
          }
          _rows.addAll(value.data);
          _cursor = value.meta.page?.nextCursor;
          _hasMore = value.meta.page?.hasMore == true && _cursor != null;
        case Err(:final failure):
          _error = failure.message;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(color: context.palette.muted, fontSize: 12);
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            AppStrings.auditTrail,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          if (_loading && _rows.isEmpty) const LinearProgressIndicator(),
          if (_error != null) Text(_error!),
          if (!_loading && _error == null && _rows.isEmpty)
            const Text(AppStrings.noTrackedChanges),
          for (final row in _rows)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(row.title),
              subtitle: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    [
                      row.resourceType,
                      ?row.number,
                      ?row.actorName,
                      row.createdAt.toLocal().toString().substring(0, 16),
                    ].join(' · '),
                    style: muted,
                  ),
                  if (row.summary != null) Text(row.summary!),
                ],
              ),
            ),
          if (_hasMore)
            Center(
              child: TextButton(
                onPressed: _loading ? null : () => _load(more: true),
                child: Text(_loading ? AppStrings.loading : AppStrings.loadMore),
              ),
            ),
        ],
      ),
    );
  }
}
