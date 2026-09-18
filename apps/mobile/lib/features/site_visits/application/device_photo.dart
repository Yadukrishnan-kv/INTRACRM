import 'dart:convert';

import 'package:image_picker/image_picker.dart';

class PickedVisitPhoto {
  const PickedVisitPhoto({
    required this.contentType,
    required this.contentBase64,
    required this.fileName,
  });

  final String contentType;
  final String contentBase64;
  final String fileName;
}

class DevicePhoto {
  static Future<PickedVisitPhoto?> pick(ImageSource source) async {
    final file = await ImagePicker().pickImage(
      source: source,
      imageQuality: 70,
      maxWidth: 1600,
    );
    if (file == null) {
      return null;
    }
    final bytes = await file.readAsBytes();
    final name = file.name.toLowerCase();
    final contentType = name.endsWith('.png')
        ? 'image/png'
        : name.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    return PickedVisitPhoto(
      contentType: contentType,
      contentBase64: base64Encode(bytes),
      fileName: file.name,
    );
  }
}
