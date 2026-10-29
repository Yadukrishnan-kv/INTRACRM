enum AppEnv {
  dev,
  staging,
  prod;

  /// Falls back to [prod] so a typo in `--dart-define=APP_ENV=...` cannot
  /// silently hand a build the dev posture (cleartext allowed, no device
  /// integrity check, no pinning). Unknown means "assume the strictest".
  static AppEnv fromDefine(String value) {
    return AppEnv.values.firstWhere(
      (env) => env.name == value,
      orElse: () => AppEnv.prod,
    );
  }

  bool get isProduction => this == AppEnv.prod;
}

class AppFlavor {
  const AppFlavor({
    required this.env,
    required this.apiBaseUrl,
    required this.appName,
    this.sslPins = const [],
  });

  final AppEnv env;
  final String apiBaseUrl;
  final String appName;
  final List<String> sslPins;

  bool get allowCleartext => env == AppEnv.dev;
  bool get enforceDeviceIntegrity => env != AppEnv.dev;
  bool get enforceSslPinning => sslPins.isNotEmpty;

  factory AppFlavor.fromEnvironment() {
    // These two defaults must stay in step: the fallback base URL is the
    // production API, so the fallback env has to carry the production posture.
    // Point them at a dev backend via --dart-define-from-file (see
    // dart_defines/local.json), which sets APP_ENV=dev alongside the URL.
    const envName = String.fromEnvironment('APP_ENV', defaultValue: 'prod');
    const apiBaseUrl = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'https://intracrm.mobilegear.co.in/api/v1/',
    );
    const sslPinsRaw = String.fromEnvironment('SSL_PINS', defaultValue: '');
    final env = AppEnv.fromDefine(envName);
    return AppFlavor(
      env: env,
      apiBaseUrl: apiBaseUrl,
      appName: switch (env) {
        AppEnv.dev => 'INTRA LEADS Dev',
        AppEnv.staging => 'INTRA LEADS Staging',
        AppEnv.prod => 'INTRA LEADS',
      },
      sslPins: [
        for (final pin in sslPinsRaw.split(','))
          if (pin.trim().isNotEmpty) pin.trim(),
      ],
    );
  }
}
