import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/error/result.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../application/catalog_providers.dart';
import '../domain/catalog_models.dart';

class CatalogListPage extends ConsumerStatefulWidget {
  const CatalogListPage({super.key, required this.kind});

  final String kind;

  @override
  ConsumerState<CatalogListPage> createState() => _CatalogListPageState();
}

class _CatalogListPageState extends ConsumerState<CatalogListPage> {
  var _loading = true;
  String? _error;
  List<CatalogItem> _items = const [];

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
    final result = unwrapCatalog<List<CatalogItem>>(
      await ref.read(catalogApiProvider).list(widget.kind),
    );
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      switch (result) {
        case Success(:final value):
          _items = value;
        case Err(:final failure):
          _error = failure.message;
      }
    });
  }

  Future<void> _delete(CatalogItem item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text('Delete ${item.name}?'),
          content: const Text('Items in use cannot be deleted. Deactivate them instead.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Delete'),
            ),
          ],
        );
      },
    );
    if (confirmed != true || !mounted) {
      return;
    }
    final result = unwrapCatalog<bool>(
      await ref.read(catalogApiProvider).delete(widget.kind, item.id),
    );
    if (!mounted) {
      return;
    }
    if (result is Err<bool>) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.failure.message)));
      return;
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: CatalogKinds.label(widget.kind),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          await context.push(AppRoutes.catalogCreatePath(widget.kind));
          await _load();
        },
        child: const Icon(Icons.add),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(child: Text(_error!))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView.builder(
                itemCount: _items.length,
                itemBuilder: (context, index) {
                  final item = _items[index];
                  return ListTile(
                    title: Text(item.name),
                    subtitle: Text(item.subtitle(widget.kind)),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        TextButton(
                          onPressed: () async {
                            await context.push(AppRoutes.catalogEditPath(widget.kind, item.id));
                            await _load();
                          },
                          child: const Text(AppStrings.editLine),
                        ),
                        TextButton(
                          onPressed: () => _delete(item),
                          child: const Text(AppStrings.deleteLine),
                        ),
                      ],
                    ),
                    onTap: () async {
                      await context.push(AppRoutes.catalogEditPath(widget.kind, item.id));
                      await _load();
                    },
                  );
                },
              ),
            ),
    );
  }
}
