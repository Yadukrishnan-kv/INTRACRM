import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_envelope.dart';
import '../data/pipeline_api.dart';

final pipelineApiProvider = Provider<PipelineApi>((ref) {
  return PipelineApi(ref.watch(apiClientProvider));
});

Result<T> unwrapPipeline<T>(Result<ApiSuccess<T>> result) =>
    unwrapEnvelope(result);
