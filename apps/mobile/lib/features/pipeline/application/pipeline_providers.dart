import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/error/result.dart';
import '../data/pipeline_api.dart';
import '../domain/pipeline_models.dart';

final pipelineApiProvider = Provider<PipelineApi>((ref) {
  return PipelineApi(ref.watch(apiClientProvider));
});

Result<T> unwrapPipeline<T>(Result<dynamic> result) {
  return switch (result) {
    Success(:final value) => Success(value.data as T),
    Err(:final failure) => Err(failure),
  };
}
