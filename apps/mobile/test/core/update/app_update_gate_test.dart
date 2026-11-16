import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/core/update/app_update_gate.dart';
import 'package:intra_leads/l10n/app_strings.dart';

class _FakeClient extends PlayUpdateClient {
  _FakeClient(this.state, {this.accept = true});

  PlayUpdateState state;
  final bool accept;
  int prompts = 0;
  int installs = 0;

  @override
  bool get isSupported => true;

  @override
  Future<PlayUpdateState> check() async => state;

  @override
  Future<bool> startUpdate() async {
    prompts++;
    return accept;
  }

  @override
  Future<void> install() async => installs++;
}

Future<void> _pump(WidgetTester tester, PlayUpdateClient client) async {
  await tester.pumpWidget(
    MaterialApp(
      builder: (context, child) => AppUpdateGate(client: client, child: child!),
      home: const Scaffold(body: Text('home')),
    ),
  );
  await tester.pumpAndSettle();
}

void _resume(WidgetTester tester) {
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
}

void main() {
  testWidgets('does nothing when no update is available', (tester) async {
    final client = _FakeClient(PlayUpdateState.none);
    await _pump(tester, client);
    expect(client.prompts, 0);
    expect(find.text(AppStrings.updateDownloaded), findsNothing);
  });

  testWidgets('prompts, then offers a restart once downloaded', (tester) async {
    final client = _FakeClient(PlayUpdateState.available);
    await _pump(tester, client);
    expect(client.prompts, 1);
    expect(find.text(AppStrings.updateDownloaded), findsOneWidget);

    await tester.tap(find.text(AppStrings.restartToUpdate));
    await tester.pumpAndSettle();
    expect(client.installs, 1);
  });

  testWidgets('does not re-prompt on resume after the user declines', (tester) async {
    final client = _FakeClient(PlayUpdateState.available, accept: false);
    await _pump(tester, client);
    _resume(tester);
    await tester.pumpAndSettle();
    expect(client.prompts, 1);
    expect(find.text(AppStrings.updateDownloaded), findsNothing);
  });

  testWidgets('offers the restart on resume when a download finished earlier', (tester) async {
    final client = _FakeClient(PlayUpdateState.none);
    await _pump(tester, client);
    client.state = PlayUpdateState.downloaded;
    _resume(tester);
    await tester.pumpAndSettle();
    expect(find.text(AppStrings.updateDownloaded), findsOneWidget);
  });
}
