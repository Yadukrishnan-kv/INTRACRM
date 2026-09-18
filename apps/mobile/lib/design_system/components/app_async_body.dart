import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/error/failure.dart';
import '../../core/error/result.dart';
import 'app_empty_state.dart';
import 'app_error_view.dart';
import 'app_loading.dart';

class AppAsyncBody<T> extends StatelessWidget {
  const AppAsyncBody({
    super.key,
    required this.asyncValue,
    required this.builder,
    this.emptyTitle = 'Nothing here yet',
    this.emptyMessage = 'Pull to refresh or create a new record.',
    this.isEmpty,
  });

  final AsyncValue<Result<T>> asyncValue;
  final Widget Function(T data) builder;
  final String emptyTitle;
  final String emptyMessage;
  final bool Function(T data)? isEmpty;

  @override
  Widget build(BuildContext context) {
    return asyncValue.when(
      loading: () => const AppLoading(),
      error: (error, _) => AppErrorView(
        failure: UnexpectedFailure(error.toString(), cause: error),
      ),
      data: (result) {
        return result.when(
          success: (data) {
            if (isEmpty?.call(data) ?? false) {
              return AppEmptyState(title: emptyTitle, message: emptyMessage);
            }
            return builder(data);
          },
          failure: (failure) => AppErrorView(failure: failure),
        );
      },
    );
  }
}
