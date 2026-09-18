import 'package:flutter/foundation.dart';

class AppLogger {
  const AppLogger();

  void debug(String message, [Object? data]) {
    if (kDebugMode) {
      debugPrint('[DEBUG] $message${data == null ? '' : ' $data'}');
    }
  }

  void info(String message) {
    if (kDebugMode) {
      debugPrint('[INFO] $message');
    }
  }

  void warn(String message) {
    debugPrint('[WARN] $message');
  }

  void error(String message, [Object? error, StackTrace? stackTrace]) {
    debugPrint('[ERROR] $message');
    if (error != null) {
      debugPrint(error.toString());
    }
    if (stackTrace != null && kDebugMode) {
      debugPrint(stackTrace.toString());
    }
  }
}
