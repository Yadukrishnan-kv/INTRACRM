enum AppEnv {
  dev,
  staging,
  prod;

  static AppEnv fromDefine(String value) {
    return AppEnv.values.firstWhere(
      (env) => env.name == value,
      orElse: () => AppEnv.dev,
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
    const envName = String.fromEnvironment('APP_ENV', defaultValue: 'dev');
    const apiBaseUrl = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'http://localhost:3000/api/v1',
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
