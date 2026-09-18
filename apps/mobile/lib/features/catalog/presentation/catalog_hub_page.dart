import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../application/catalog_providers.dart';
import '../domain/catalog_models.dart';

class CatalogHubPage extends ConsumerStatefulWidget {
  const CatalogHubPage({super.key});

  @override
  ConsumerState<CatalogHubPage> createState() => _CatalogHubPageState();
}

class _CatalogHubPageState extends ConsumerState<CatalogHubPage> {
  var _loading = true;
  String? _error;
  List<CatalogKindInfo> _kinds = [
    for (final kind in CatalogKinds.all)
      CatalogKindInfo(code: kind, name: CatalogKinds.label(kind), count: 0),
  ];

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
    final result = unwrapCatalog<List<CatalogKindInfo>>(
      await ref.read(catalogApiProvider).overview(),
    );
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final value):
          _kinds = [
            for (final kind in CatalogKinds.all)
              CatalogKindInfo(
                code: kind,
                name: CatalogKinds.label(kind),
                count: [
                  for (final item in value)
                    if (item.code == kind) item.count,
                ].firstWhere((_) => true, orElse: () => 0),
              ),
          ];
        case Err(:final failure):
          _error = failure.message;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: AppStrings.catalog,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.md),
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: Text(_error!),
                    ),
                  for (final kind in _kinds)
                    ListTile(
                      title: Text(kind.name),
                      subtitle: Text('${kind.count} items'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.push(
                        kind.code == CatalogKinds.taxes
                            ? AppRoutes.taxesSettings
                            : AppRoutes.catalogKindPath(kind.code),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}
