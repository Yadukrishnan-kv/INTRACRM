import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../design_system/components/app_button.dart';
import '../../../design_system/components/app_error_view.dart';
import '../../../design_system/components/app_loading.dart';
import '../../../design_system/components/app_scaffold.dart';
import '../../../design_system/components/app_text_field.dart';
import '../../../design_system/tokens/app_spacing.dart';
import '../../../features/auth/application/auth_controller.dart';
import '../../../l10n/app_strings.dart';
import '../../../router/app_routes.dart';
import '../application/device_location.dart';
import '../application/device_photo.dart';
import '../application/site_visit_providers.dart';
import '../domain/site_visit.dart';

class SiteVisitDetailPage extends ConsumerStatefulWidget {
  const SiteVisitDetailPage({super.key, required this.visitId});

  final String visitId;

  @override
  ConsumerState<SiteVisitDetailPage> createState() => _SiteVisitDetailPageState();
}

class _SiteVisitDetailPageState extends ConsumerState<SiteVisitDetailPage> {
  SiteVisit? _item;
  Failure? _failure;
  var _loading = true;
  var _busy = false;
  final _photoBytes = <String, Uint8List>{};

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    final result = await ref.read(siteVisitApiProvider).getById(widget.visitId);
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      if (result is Success) {
        _item = result.value.data;
      } else if (result is Err) {
        _failure = result.failure;
      }
    });
    final visit = _item;
    if (visit != null) {
      for (final photo in visit.photos) {
        if (_photoBytes.containsKey(photo.id)) {
          continue;
        }
        final content = await ref.read(siteVisitApiProvider).photoContent(
          visitId: visit.id,
          photoId: photo.id,
        );
        if (!mounted) {
          return;
        }
        if (content is Success) {
          setState(() {
            _photoBytes[photo.id] = base64Decode(content.value.data.contentBase64);
          });
        }
      }
    }
  }

  Future<GeoPoint?> _requireGps() async {
    final point = await DeviceLocation.current();
    if (point != null) {
      return point;
    }
    if (!mounted) {
      return null;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('GPS is required. Enable location and try again.')),
    );
    return null;
  }

  Future<void> _run(Future<Result<dynamic>> Function() action) async {
    setState(() => _busy = true);
    final result = await action();
    if (!mounted) {
      return;
    }
    setState(() => _busy = false);
    if (result is Success) {
      await _reload();
    } else if (result is Err) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.failure.message)),
      );
    }
  }

  Future<void> _checkIn() async {
    final item = _item;
    if (item == null) {
      return;
    }
    final location = await _requireGps();
    if (location == null) {
      return;
    }
    await _run(
      () => ref.read(siteVisitApiProvider).checkIn(
        id: item.id,
        location: location,
        version: item.version,
      ),
    );
  }

  Future<void> _checkOut() async {
    final item = _item;
    if (item == null) {
      return;
    }
    final location = await _requireGps();
    if (location == null) {
      return;
    }
    await _run(
      () => ref.read(siteVisitApiProvider).checkOut(
        id: item.id,
        location: location,
        version: item.version,
      ),
    );
  }

  Future<void> _saveNotes() async {
    final item = _item;
    if (item == null) {
      return;
    }
    final notes = TextEditingController(text: item.notes ?? '');
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text(AppStrings.activityNotes),
          content: AppTextField(controller: notes, label: AppStrings.activityNotes, maxLines: 5),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
          ],
        );
      },
    );
    final text = notes.text.trim();
    notes.dispose();
    if (saved != true) {
      return;
    }
    await _run(
      () => ref.read(siteVisitApiProvider).saveNotes(
        id: item.id,
        notes: text,
        version: item.version,
      ),
    );
  }

  Future<void> _saveFeedback() async {
    final item = _item;
    if (item == null) {
      return;
    }
    var rating = item.customerRating ?? 5;
    final feedback = TextEditingController(text: item.customerFeedback ?? '');
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text(AppStrings.customerFeedback),
          content: StatefulBuilder(
            builder: (context, setLocal) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      for (var star = 1; star <= 5; star++)
                        IconButton(
                          onPressed: () => setLocal(() => rating = star),
                          icon: Icon(star <= rating ? Icons.star : Icons.star_border),
                        ),
                    ],
                  ),
                  AppTextField(
                    controller: feedback,
                    label: AppStrings.customerFeedback,
                    maxLines: 4,
                  ),
                ],
              );
            },
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
          ],
        );
      },
    );
    final text = feedback.text.trim();
    feedback.dispose();
    if (saved != true) {
      return;
    }
    await _run(
      () => ref.read(siteVisitApiProvider).saveFeedback(
        id: item.id,
        version: item.version,
        customerFeedback: text,
        customerRating: rating,
      ),
    );
  }

  Future<void> _addPhoto(ImageSource source) async {
    final item = _item;
    if (item == null) {
      return;
    }
    final picked = await DevicePhoto.pick(source);
    if (picked == null) {
      return;
    }
    final location = await DeviceLocation.current();
    await _run(
      () => ref.read(siteVisitApiProvider).addPhoto(
        id: item.id,
        contentType: picked.contentType,
        contentBase64: picked.contentBase64,
        fileName: picked.fileName,
        location: location,
      ),
    );
  }

  Future<void> _complete() async {
    final item = _item;
    if (item == null) {
      return;
    }
    GeoPoint? location;
    if (item.isScheduled) {
      location = await _requireGps();
      if (location == null) {
        return;
      }
    }
    final outcome = TextEditingController(text: item.outcome ?? '');
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text(AppStrings.completeVisit),
          content: AppTextField(controller: outcome, label: 'Outcome', maxLines: 3),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
          ],
        );
      },
    );
    final text = outcome.text.trim();
    outcome.dispose();
    if (saved != true) {
      return;
    }
    await _run(
      () => ref.read(siteVisitApiProvider).complete(
        id: item.id,
        version: item.version,
        outcome: text,
        location: location,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    final user = ref.watch(authControllerProvider).user;
    if (_loading) {
      return const AppScaffold(title: AppStrings.siteVisit, body: AppLoading());
    }
    if (_failure != null || item == null) {
      return AppScaffold(
        title: AppStrings.siteVisit,
        body: AppErrorView(failure: _failure ?? const UnexpectedFailure('Visit not found')),
      );
    }
    return AppScaffold(
      title: item.title,
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          Text(SiteVisitStatuses.title(item.status), style: Theme.of(context).textTheme.titleMedium),
          Text(
            [
              item.leadNumber,
              item.customerName,
              item.scheduledAt.toLocal().toString().substring(0, 16),
              if (item.assigneeName != null) item.assigneeName!,
            ].whereType<String>().where((value) => value.isNotEmpty).join(' · '),
          ),
          if (item.city != null || item.addressLine1 != null)
            Text([item.addressLine1, item.city].whereType<String>().join(', ')),
          const SizedBox(height: AppSpacing.md),
          Text(AppStrings.gpsLocation, style: Theme.of(context).textTheme.titleSmall),
          Text('Check-in: ${item.checkInLocation?.label ?? '—'}'),
          Text('Check-out: ${item.checkOutLocation?.label ?? '—'}'),
          const SizedBox(height: AppSpacing.md),
          Text(AppStrings.activityNotes, style: Theme.of(context).textTheme.titleSmall),
          Text(item.notes?.trim().isNotEmpty == true ? item.notes! : 'No notes yet'),
          const SizedBox(height: AppSpacing.md),
          Text(AppStrings.customerFeedback, style: Theme.of(context).textTheme.titleSmall),
          Text(
            [
              if (item.customerRating != null) '${item.customerRating}/5',
              item.customerFeedback,
            ].whereType<String>().join(' · ').isEmpty
                ? 'No feedback yet'
                : [
                    if (item.customerRating != null) '${item.customerRating}/5',
                    if (item.customerFeedback != null) item.customerFeedback!,
                  ].join(' · '),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(AppStrings.photos, style: Theme.of(context).textTheme.titleSmall),
          if (item.photos.isEmpty) const Text('No photos yet'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final photo in item.photos)
                SizedBox(
                  width: 96,
                  height: 96,
                  child: _photoBytes[photo.id] == null
                      ? const ColoredBox(color: Color(0x11000000), child: Icon(Icons.image))
                      : Image.memory(_photoBytes[photo.id]!, fit: BoxFit.cover),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          if (!item.isOpen)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: Text(
                'This visit is ${SiteVisitStatuses.title(item.status).toLowerCase()}. Check in, complete, and cancel are only available while a visit is scheduled or in progress.',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          if (item.leadId.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => context.push(AppRoutes.leadDetailPath(item.leadId)),
                  child: const Text('Open lead'),
                ),
              ),
            ),
          if (_busy) const AppLoading(),
          if (!_busy && item.isOpen && user?.canCompleteSiteVisit == true) ...[
            if (item.isScheduled)
              AppButton(label: AppStrings.checkIn, onPressed: _checkIn),
            if (item.isInProgress)
              AppButton(label: AppStrings.checkOut, onPressed: _checkOut),
            const SizedBox(height: AppSpacing.sm),
            AppButton(label: AppStrings.activityNotes, onPressed: _saveNotes),
            const SizedBox(height: AppSpacing.sm),
            AppButton(label: AppStrings.customerFeedback, onPressed: _saveFeedback),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              label: AppStrings.addPhoto,
              onPressed: () => _addPhoto(ImageSource.camera),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              label: 'Choose photo',
              onPressed: () => _addPhoto(ImageSource.gallery),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(label: AppStrings.completeVisit, onPressed: _complete),
            const SizedBox(height: AppSpacing.sm),
            TextButton(
              onPressed: () => _run(
                () => ref.read(siteVisitApiProvider).cancel(
                  id: item.id,
                  version: item.version,
                ),
              ),
              child: const Text('Cancel visit'),
            ),
          ],
        ],
      ),
    );
  }
}
