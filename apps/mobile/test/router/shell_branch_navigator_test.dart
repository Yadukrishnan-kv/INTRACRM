import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intra_leads/router/app_router.dart';

/// Sub-routes of a [StatefulShellBranch] must render on the root navigator.
///
/// When a branch sub-route renders on the branch navigator instead, pushing it
/// while a top-level page already sits above the shell makes go_router append a
/// second [StatefulShellRoute] page to the root navigator. Both shell pages get
/// the same page key (derived from the route instance), which trips
/// `Navigator._debugCheckDuplicatedPageKeys` and blanks the app.
void main() {
  test('every shell branch sub-route is pinned to the root navigator', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final router = container.read(routerProvider);

    final offenders = <String>[];

    void visit(RouteBase route, String parentPath) {
      final path = route is GoRoute ? '$parentPath/${route.path}' : parentPath;
      if (route.parentNavigatorKey != rootNavigatorKey) {
        offenders.add(path);
      }
      for (final child in route.routes) {
        visit(child, path);
      }
    }

    void scan(List<RouteBase> routes) {
      for (final route in routes) {
        if (route is StatefulShellRoute) {
          for (final branch in route.branches) {
            for (final branchRoot in branch.routes) {
              final root = branchRoot is GoRoute ? branchRoot.path : '';
              for (final child in branchRoot.routes) {
                visit(child, root);
              }
            }
          }
        }
        scan(route.routes);
      }
    }

    scan(router.configuration.routes);

    expect(
      offenders,
      isEmpty,
      reason:
          'These shell branch sub-routes need parentNavigatorKey: rootNavigatorKey',
    );
  });

  test('the router uses the shared root navigator key', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    expect(
      container.read(routerProvider).configuration.navigatorKey,
      same(rootNavigatorKey),
    );
  });
}
