import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../data/comms_api.dart';

final commsApiProvider = Provider<CommsApi>((ref) {
  return CommsApi(ref.watch(apiClientProvider));
});

final commsLauncherProvider = Provider<CommsLauncher>((ref) {
  return const CommsLauncher();
});

Result<T> unwrapComms<T>(Result<dynamic> result) {
  return switch (result) {
    Success(:final value) => Success(value.data as T),
    Err(:final failure) => Err(failure),
  };
}

class CommsLauncher {
  const CommsLauncher();

  Future<bool> open(String uri) {
    return launchUrl(Uri.parse(uri), mode: LaunchMode.externalApplication);
  }
}
