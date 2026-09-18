import 'dart:io';

bool get isPushPlatform => Platform.isAndroid || Platform.isIOS;

String currentPushPlatform() => Platform.isIOS ? 'ios' : 'android';
