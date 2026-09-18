import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../data/rbac_api.dart';
import '../data/rbac_repository_impl.dart';
import '../domain/rbac_models.dart';
import '../domain/rbac_repository.dart';

final rbacRepositoryProvider = Provider<RbacRepository>((ref) {
  return RbacRepositoryImpl(RbacApi(ref.watch(apiClientProvider)));
});
