import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';

class GeneralSettingsPage extends StatelessWidget {
  const GeneralSettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: AppStrings.generalSettings,
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          ListTile(
            leading: const Icon(Icons.percent_outlined),
            title: const Text(AppStrings.taxes),
            subtitle: const Text('Manage GST, CGST, SGST and other rates'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(AppRoutes.taxesSettings),
          ),
          ListTile(
            leading: const Icon(Icons.inventory_2_outlined),
            title: const Text(AppStrings.catalog),
            subtitle: const Text('Products, statuses, and warranty periods'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(AppRoutes.catalog),
          ),
        ],
      ),
    );
  }
}
