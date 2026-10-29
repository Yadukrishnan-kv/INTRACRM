# INTRA LEADS Mobile

Flutter client for the INTRA LEADS tenant-scoped CRM. Clean Architecture + MVVM,
Riverpod DI, Go Router, Dio, encrypted secure storage, and a SQLite offline outbox.

Backend: `apps/api` (NestJS 11). Architecture of the whole system:
`docs/architecture/SOFTWARE_ARCHITECTURE_DOCUMENT.md`.

---

## Requirements

| Tool | Version |
| --- | --- |
| Flutter SDK | 3.35.0+ (Dart 3.9+) |
| JDK | 17 recommended for Android builds (the project targets Java 17 bytecode; Gradle 9.1 / AGP 9.0 accept newer JDKs, but 17 is the tested combination) |
| Android SDK | compileSdk 36, minSdk 24 |
| Xcode | 16+ for iOS/macOS |

Verify with `flutter doctor`.

## Quick start

```bash
cd apps/mobile
flutter pub get
flutter test
flutter analyze          # must report "No issues found!"
```

Run against a local API:

```bash
# iOS simulator / macOS / web reach it at localhost
flutter run \
  --dart-define=APP_ENV=dev \
  --dart-define=API_BASE_URL=http://localhost:3000/api/v1

# Android emulator reaches the host at 10.0.2.2
flutter run \
  --dart-define=APP_ENV=dev \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
```

### Physical phone

`localhost` on a real device means *the device*, so the default base URL cannot
work there - the request is refused before it leaves the handset. Point the app
at the machine running the API instead:

```bash
cp dart_defines/local.example.json dart_defines/local.json
# put your host's LAN address in it:
ipconfig getifaddr en0        # macOS
flutter run --dart-define-from-file=dart_defines/local.json
```

`dart_defines/local.json` is gitignored because the address is specific to your
machine, and it is read by the VS Code launch configurations too, so `F5` and
the command line stay in agreement. Re-run `ipconfig` and update the file if
your DHCP lease changes.

Two things the phone needs, both already configured:

- iOS: `NSAllowsLocalNetworking` plus `NSLocalNetworkUsageDescription` in
  `ios/Runner/Info.plist`. iOS prompts once for local-network access - if you
  decline, every request fails silently.
- Android: a cleartext `network_security_config`, in the **debug** manifest
  only. An Android *release* build blocks plain HTTP, so a release build needs
  an HTTPS endpoint.

`APP_ENV` must stay `dev` for a plain-HTTP host: any other value makes
`AppFlavor.allowCleartext` false and the Dio interceptor rejects every `http://`
request with "HTTPS is required".

Start the backend first (from the repo root):

```bash
docker compose up postgres redis
cd apps/api && npm ci && npx prisma generate && npm run start:dev
```

### Build targets

```bash
flutter build apk --debug         # Android, debug-signed
flutter build appbundle --release # Android, needs android/key.properties
flutter build ios --release       # needs an Apple Developer team
flutter build web --release
```

`flutter build web --release` is the fastest full-tree compile check and needs no
native toolchain — useful in a pinch when you only want to know the Dart compiles.

---

## Configuration

All configuration is compile-time, via `--dart-define`. There is no `.env` file.
Resolved in `lib/core/config/app_env.dart`.

| Define | Default | Notes |
| --- | --- | --- |
| `APP_ENV` | `prod` | `dev` \| `staging` \| `prod`. An unrecognised value also resolves to `prod` |
| `API_BASE_URL` | `https://intracrm.mobilegear.co.in/api/v1/` | Must include the `/api/v1` prefix |
| `SSL_PINS` | *(empty)* | Comma-separated SHA-256 pins **of the whole server certificate DER**, hex or `sha256/<base64>`. Pinning is enforced only when non-empty |

`APP_ENV` defaults to `prod` because `API_BASE_URL` defaults to the production
API: a build made with no defines must not reach production with the dev
posture. Use `--dart-define-from-file=dart_defines/local.json` for a dev
backend; it sets `APP_ENV=dev` alongside the URL.

> **Pin format.** These are *certificate* pins, not SPKI pins, despite the
> `sha256/` prefix borrowed from the HPKP convention. `applySslPinning` hashes
> `X509Certificate.der` — the entire certificate — so a pin computed the usual
> SPKI way (`openssl pkey -pubin -outform der | openssl dgst -sha256`) matches
> nothing and every request fails. Generate a pin from the certificate itself:
>
> ```bash
> openssl s_client -connect host:443 </dev/null 2>/dev/null \
>   | openssl x509 -outform der | openssl dgst -sha256
> ```
>
> Because the pin covers the leaf, it stops matching at every certificate
> renewal; ship the new pin before the old certificate is replaced.

Behaviour keyed off `APP_ENV`:

- `allowCleartext` — plain HTTP is permitted only in `dev`.
- `enforceDeviceIntegrity` — `staging` and `prod` block rooted/jailbroken devices
  and show `CompromisedDeviceApp` instead of the CRM.

Example staging build:

```bash
flutter build appbundle --release \
  --dart-define=APP_ENV=staging \
  --dart-define=API_BASE_URL=https://staging.example.com/api/v1 \
  --dart-define=SSL_PINS=sha256/AAAA...,sha256/BBBB...
```

---

## Architecture

```text
lib/
  main.dart           device-integrity gate, then bootstrap()
  bootstrap.dart      DB init, session restore, sync engine start
  app.dart            MaterialApp.router
  core/               config, error, network, storage, sync, auth, tenancy, di, push
  design_system/      tokens, Material 3 theme, shared widgets
  router/             Go Router + auth redirect (app_routes.dart, app_router.dart)
  features/<name>/
    domain/           entities + repository ports
    data/             DTOs, API clients, repository impls
    application/      Riverpod notifiers (the ViewModels)
    presentation/     pages and widgets
```

- **View** = pages under `presentation/`
- **ViewModel** = `Notifier` / `AsyncNotifier` under `application/`
- **Model** = domain entities + repository ports under `domain/`

Riverpod is the only DI mechanism; the root container is `lib/core/di/providers.dart`.

### Networking

`lib/core/network/api_client.dart` wraps Dio with three interceptors:

| Interceptor | Responsibility |
| --- | --- |
| `HeaderInterceptor` | Attaches `Authorization`, `X-Tenant-Id`, `X-Request-Id`, `X-Device-Id`, and generates an `Idempotency-Key` for every unsafe method |
| `AuthRefreshInterceptor` | A `QueuedInterceptor`: on 401 it refreshes once, retries the original request, and force-logs-out on `DEVICE_MISMATCH` or a failed refresh |
| `ErrorInterceptor` | Maps RFC 7807 problem bodies to typed `Failure` subclasses |

Every response is the standard envelope `{ data, meta }`. Unwrap it with the
shared helper rather than reaching into `.data` by hand:

```dart
// lib/core/network/api_envelope.dart
Result<T> unwrapEnvelope<T>(Result<ApiSuccess<T>> result);
```

Feature-level aliases (`unwrapCatalog`, `unwrapApi`, `unwrapPipeline`, …) all
delegate to it. They are typed against `ApiSuccess<T>`, so payload types are
checked by the compiler instead of cast at runtime.

### Offline

SQLite (`intra_leads.db`) plus a sync engine.

| Table | Role |
| --- | --- |
| `cache_entries` | Tenant-scoped JSON cache, AES-256-GCM encrypted |
| `outbox_commands` | Pending writes with idempotency keys |
| `sync_cursors` | Delta cursors for `GET /sync` |
| `offline_leads` | Offline leads |
| `offline_notes` | Offline notes / activities |
| `offline_follow_ups` | Offline follow-ups |
| `id_map` | Local UUID → server UUID |
| `sync_conflicts` | Merged stale-version conflicts |

Offline writes to leads, notes and follow-ups enqueue an outbox command and
persist an optimistic row. `SyncEngine.syncNow()` flushes the outbox, then pulls
`GET /sync`. Connectivity restore triggers the same path.

Conflict policy follows SAD §5.9: server-wins for ownership, stage and completed
follow-ups; merge-by-field for lead contact fields and follow-up notes.

Auth tokens live in Flutter Secure Storage, never in SQLite.

> **Offline covers leads, notes and follow-ups only.** Site visits, quotations,
> attendance, targets and warranties are online-only — `GET /sync` does not
> return them. The API emits tombstones for the resources it does sync, so a
> server-side deletion removes the matching local record on the next sync.

---

## Platform setup

Both platform folders are committed and configured. You do **not** need to run
`flutter create`.

### Permissions already declared

| Capability | Android | iOS |
| --- | --- | --- |
| API + connectivity | `INTERNET`, `ACCESS_NETWORK_STATE` | — |
| Site-visit GPS stamp | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | `NSLocationWhenInUseUsageDescription` |
| Visit photos, QR scan | `CAMERA` (feature flagged `required="false"`) | `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` |
| Push | `POST_NOTIFICATIONS` (API 33+) | `UIBackgroundModes: remote-notification`, `aps-environment` entitlement |
| Click-to-call / WhatsApp / SMS | `<queries>` for `tel`, `smsto`, `https`, `mailto` | `LSApplicationQueriesSchemes` |

The `<queries>` and `LSApplicationQueriesSchemes` entries are load-bearing. On
Android 11+ and iOS, `url_launcher.canLaunchUrl` returns `false` for any scheme
not declared, which makes the entire Comms feature fail silently — no error, no
dialer, nothing happens.

### Reaching a local API from a physical device

Three separate things block this, and fixing only one leaves you with the same
"unable to reach the server" error:

1. **Use your machine's LAN IP, not `localhost`.** A phone's `localhost` is the
   phone. Find it with `ipconfig getifaddr en0`, then
   `--dart-define=API_BASE_URL=http://192.168.1.65:3000/api/v1`.
2. **iOS blocks cleartext HTTP (ATS).** `ios/Runner/Info.plist` sets
   `NSAppTransportSecurity > NSAllowsLocalNetworking`, which permits HTTP to
   private ranges (10/8, 172.16/12, 192.168/16) and `.local` hosts *only* -
   public HTTPS stays enforced. iOS 14+ also shows a local-network permission
   prompt, backed by `NSLocalNetworkUsageDescription`; **accept it**, or the
   connection is refused with no further prompt. If you declined it once:
   Settings → Privacy & Security → Local Network → enable INTRA LEADS.
3. **Android 9+ blocks cleartext too.** `android/app/src/debug/` carries a
   `network_security_config.xml` with `cleartextTrafficPermitted="true"`.
   Because it lives in `src/debug`, release builds never merge it and stay
   HTTPS-only.

Keep `APP_ENV=dev`: `allowCleartext` is false in every other flavor, and the Dart
`_HttpsPolicyInterceptor` rejects `http://` before the request leaves the app.

Check the API is actually up and listening on all interfaces, not just loopback:

```bash
curl http://$(ipconfig getifaddr en0):3000/api/v1/health/live   # {"status":"ok"}
```

Phone and Mac must be on the same Wi-Fi, and macOS firewall must not be blocking
`node` (System Settings → Network → Firewall).

### iOS pods and deployment target

`ios/Podfile` pins `IPHONEOS_DEPLOYMENT_TARGET` to **15.5** for every pod target
and build configuration in `post_install`. This is required, not cosmetic:
several transitive pods still declare 9.0-13.0 in their podspecs, and Xcode 16+
refuses to build anything below 15.0 with

```text
Target Integrity (Xcode): The iOS deployment target 'IPHONEOS_DEPLOYMENT_TARGET'
is set to 10.0, but the range of supported deployment target versions is 15.0 to 27.0.x.
```

`flutter_additional_ios_build_settings` alone does **not** fix this - it only
raises targets to Flutter's own minimum. Keep the value in `post_install`, the
`platform :ios` line, and Runner's `IPHONEOS_DEPLOYMENT_TARGET` in sync.

After changing the Podfile:

```bash
cd ios && pod install && cd ..
flutter build ios --debug --no-codesign   # compiles without a device or signing
```

> **`mobile_scanner` has no arm64 simulator slice.** GoogleMLKit and its
> dependencies are device-only on Apple Silicon, so the app cannot run on an
> iOS 26+ simulator. Use a physical device, or drop the warranty QR scanner from
> a simulator-only build.

### Android release signing

```bash
keytool -genkey -v -keystore ~/intra-leads-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
cp android/key.properties.example android/key.properties
# fill in storePassword / keyPassword / keyAlias / storeFile
```

`android/key.properties` is gitignored. Without it, release builds fall back to
debug keys so `flutter build apk --release` still works for local smoke tests —
but such an artifact cannot be uploaded to Play.

R8 / resource shrinking is deliberately left **off** (the Flutter default). Turn
it on only together with a verified `flutter build appbundle --release` run,
since Firebase and `mobile_scanner` need keep rules.

### Push notifications (Firebase)

Push is wired end-to-end in Dart (`lib/features/notifications/application/push_notification_service.dart`)
and on the backend (`FcmGateway`, `POST /notifications/devices`), but needs a
Firebase project before it does anything:

1. Create a Firebase project and register both apps using the **exact**
   application/bundle IDs below.
2. Download `google-services.json` → `android/app/google-services.json`.
3. Download `GoogleService-Info.plist` → add to `ios/Runner/` **via Xcode** so it
   joins the Runner target (a plain file copy is not enough).
4. Upload the APNs auth key to Firebase → Project settings → Cloud Messaging.
5. Set `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` on the API.

The Gradle `google-services` plugin is applied **only if**
`android/app/google-services.json` exists, so the project still builds without
it. When Firebase is absent, `PushNotificationService` catches the init failure
and logs `FCM skipped` — the app runs normally, just without push.

> **Before the first store upload**, change the application ID from the
> `com.example` placeholder. Android: `applicationId` in
> `android/app/build.gradle.kts` *and* the `namespace` + the
> `android/app/src/main/kotlin/...` package path. iOS:
> `PRODUCT_BUNDLE_IDENTIFIER` in `ios/Runner.xcodeproj/project.pbxproj`
> (currently `com.example.intraLeads`). Both must match what is registered in
> Firebase, or push tokens will not resolve.

---

## Testing

```bash
flutter test                                   # unit + widget
flutter test test/core/network/                # one directory
flutter test --coverage                        # writes coverage/lcov.info
```

Current suite: 27 tests covering `Result`, the API envelope and `unwrapEnvelope`,
SSL pinning, AES cipher, device integrity, the sync conflict resolver, report
models, warranty token parsing and notification routing.

> Coverage is thin: there are no widget tests for any of the ~70 pages, and
> `integration_test/` is an empty placeholder. Treat green tests as a signal
> about core plumbing only, not about the screens.

---

## CI

`.github/workflows/ci.yml`, job `mobile`:

```text
flutter pub get → flutter analyze → flutter test → flutter build apk --debug
```

`flutter analyze` exits non-zero on **any** issue, including infos — the repo is
at zero issues, so keep it there. `dart fix --apply` resolves most lint classes
automatically (`use_null_aware_elements`, `directives_ordering`, `unused_import`,
`deprecated_member_use`).

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Tapping call/WhatsApp/SMS does nothing | Missing `<queries>` / `LSApplicationQueriesSchemes` entry for that scheme |
| App dies the instant the camera opens (iOS) | Missing `NSCameraUsageDescription` |
| `FCM skipped` in logs | No `google-services.json` / `GoogleService-Info.plist`, or Firebase not provisioned |
| Push token registers but no notification arrives | APNs key not uploaded, or `FCM_*` env vars not set on the API |
| Immediate logout on launch | `DEVICE_MISMATCH` — the session is bound to another `X-Device-Id`; sign in again |
| Blocked by "compromised device" screen | `APP_ENV != dev` on a rooted/jailbroken device or emulator; use `APP_ENV=dev` locally |
| Gradle rejects the JDK, or Kotlin/AGP version errors | Pin the tested JDK: `export JAVA_HOME=$(/usr/libexec/java_home -v17)` |
| "Unable to reach the server" on a physical device | See *Reaching a local API from a physical device* - usually `localhost` instead of the LAN IP, a declined iOS local-network prompt, or the API not running |
| Cleartext HTTP blocked | `APP_ENV != dev`; only `dev` allows plain HTTP |
| iOS build fails with "range of supported deployment target versions is 15.0 to ..." | A pod reverted below 15.0; re-run `pod install` so the Podfile `post_install` hook re-applies, and check the hook is intact |
| App will not run on the iOS simulator | `mobile_scanner` / GoogleMLKit ship no arm64 simulator slice; use a physical device |
| CocoaPods warns about the `Runner` base configuration | Pre-existing: Runner's Profile config points at `Flutter/Release.xcconfig` and there is no `Flutter/Profile.xcconfig`. Affects `--profile` builds only |

---

## Known gaps

These are backend or product gaps that shape the app; none are fixable in
`apps/mobile` alone.

| Gap | Impact |
| --- | --- |
| `Idempotency-Key` is a no-op on the API | The outbox sends and retries the key, but the server discards it — a retry after a timeout can duplicate leads, follow-up completions and site visits |
| No `RealtimeModule` on the API | No websocket transport exists; `lib/core/realtime/` is an empty placeholder and the app is poll/refresh only |
| Contacts, Accounts modules not built | `lib/features/contacts`, `accounts`, `activities` and `profile` are `.gitkeep` placeholders — there is no API to build them against |
| Sync covers only leads, notes and follow-ups | Site visits, quotations, attendance, targets and warranties remain online-only |
| No API client for `/tracks`, `/leads/:id/assignments`, `/site-visits/:id/no-show`, comms template CRUD, billing sync actions | Backend endpoints with no mobile surface |

Empty `.gitkeep` directories are intentional markers for planned work, not
mistakes — leave them until the matching backend module lands.
