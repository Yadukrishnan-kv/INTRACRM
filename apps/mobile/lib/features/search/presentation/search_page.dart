import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../design_system/components/app_async_body.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../data/search_api.dart';
import '../domain/search_hit.dart';

final searchApiProvider = Provider<SearchApi>((ref) {
  return SearchApi(ref.watch(apiClientProvider));
});

final searchFieldProvider = StateProvider<String?>((ref) => null);

class SearchController extends AsyncNotifier<Result<SearchPageData>> {
  Timer? _debounce;
  String _q = '';

  @override
  Future<Result<SearchPageData>> build() async {
    ref.onDispose(() => _debounce?.cancel());
    return const Success(SearchPageData(hits: []));
  }

  void setText(String q) {
    _q = q;
    _schedule();
  }

  void _schedule() {
    _debounce?.cancel();
    final q = _q.trim();
    if (q.length < 2) {
      state = const AsyncData(Success(SearchPageData(hits: [])));
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 280), () async {
      state = const AsyncLoading();
      final result = await ref.read(searchApiProvider).search(
        q: q,
        by: ref.read(searchFieldProvider),
      );
      state = AsyncData(switch (result) {
        Success(:final value) => Success(value.data),
        Err(:final failure) => Err(failure),
      });
    });
  }
}

final searchControllerProvider =
    AsyncNotifierProvider<SearchController, Result<SearchPageData>>(SearchController.new);

class SearchPage extends ConsumerStatefulWidget {
  const SearchPage({super.key});

  @override
  ConsumerState<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends ConsumerState<SearchPage> {
  late final TextEditingController _text;

  @override
  void initState() {
    super.initState();
    _text = TextEditingController();
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final results = ref.watch(searchControllerProvider);
    final selected = ref.watch(searchFieldProvider);
    final typed = _text.text.trim();
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _text,
          autofocus: true,
          textInputAction: TextInputAction.search,
          decoration: const InputDecoration(
            hintText: AppStrings.searchHint,
            border: InputBorder.none,
          ),
          onChanged: (value) {
            setState(() {});
            ref.read(searchControllerProvider.notifier).setText(value);
          },
        ),
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, 0),
              child: Wrap(
                spacing: AppSpacing.xs,
                children: [
                  for (final field in searchFields)
                    ChoiceChip(
                      label: Text(field.label),
                      selected: selected == field.code,
                      onSelected: (_) {
                        ref.read(searchFieldProvider.notifier).state = field.code;
                        ref.read(searchControllerProvider.notifier).setText(_text.text);
                      },
                    ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Expanded(
              child: typed.length < 2
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.all(AppSpacing.lg),
                        child: Text(
                          'Search by customer, mobile, lead ID, or quotation number.',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    )
                  : AppAsyncBody(
                      asyncValue: results,
                      isEmpty: (page) => page.hits.isEmpty,
                      emptyTitle: AppStrings.search,
                      emptyMessage: 'No matching leads or quotations.',
                      builder: (page) {
                        return ListView.separated(
                          itemCount: page.hits.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final hit = page.hits[index];
                            return ListTile(
                              leading: Icon(
                                hit.isQuotation
                                    ? Icons.request_quote_outlined
                                    : Icons.person_outline,
                              ),
                              title: Text(hit.title),
                              subtitle: Text(hit.subtitle),
                              trailing: Text(hit.matchedBy.replaceAll('_', ' ')),
                              onTap: () {
                                if (hit.isQuotation) {
                                  context.push(AppRoutes.quotationDetailPath(hit.id));
                                } else {
                                  context.push(AppRoutes.leadDetailPath(hit.leadId));
                                }
                              },
                            );
                          },
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
