# INTRA LEADS Mobile

Flutter 3.35+ client. Clean Architecture + MVVM, Riverpod DI, Go Router, Dio, secure storage, and SQLite offline outbox.

## Generate platform folders

Flutter SDK is required on the machine. From this directory:

```bash
flutter create . --org com.intraleads --project-name intra_leads --platforms=android,ios
flutter pub get
flutter test
flutter run --dart-define=APP_ENV=dev --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
```

`flutter create .` keeps the existing `lib/` architecture.

After generating Android/iOS folders, allow the dialer, SMS, and WhatsApp to be queried:

Android `AndroidManifest.xml` inside `<manifest>`:

```xml
<queries>
  <intent>
    <action android:name="android.intent.action.DIAL" />
    <data android:scheme="tel" />
  </intent>
  <intent>
    <action android:name="android.intent.action.SENDTO" />
    <data android:scheme="sms" />
  </intent>
  <intent>
    <action android:name="android.intent.action.VIEW" />
    <data android:scheme="https" />
  </intent>
</queries>
```

iOS `Info.plist`:

```xml
<key>LSApplicationQueriesSchemes</key>
<array>
  <string>tel</string>
  <string>sms</string>
  <string>whatsapp</string>
  <string>https</string>
</array>
```

## Architecture

```text
lib/
  main.dart / bootstrap.dart / app.dart
  core/           config, error, network, storage, sync, auth, tenancy, di
  design_system/  tokens, Material 3 theme, base widgets
  router/         Go Router + auth redirect
  features/       auth, leads, tasks, notifications, settings, …
```

Each feature:

```text
domain/        entities + repository ports
data/          DTO, API, local source, repository impl
application/   Riverpod ViewModels
presentation/  pages / widgets
```

- **View** = pages
- **ViewModel** = `Notifier` / `AsyncNotifier`
- **Model** = domain entities + repositories

Riverpod is the only DI mechanism (`lib/core/di/providers.dart`).

## Offline

SQLite (`intra_leads.db`, schema v2) plus a sync engine:

| Table | Role |
| --- | --- |
| `cache_entries` | Tenant-scoped JSON cache (AES-256-GCM) |
| `outbox_commands` | Pending writes with idempotency keys |
| `sync_cursors` | Delta-sync cursors for `GET /sync` |
| `offline_leads` | Offline leads |
| `offline_notes` | Offline notes / activities |
| `offline_follow_ups` | Offline follow-ups |
| `id_map` | Local UUID → server UUID |
| `sync_conflicts` | Merged stale-version conflicts |

Offline lead, note, and follow-up writes enqueue an outbox command and persist the optimistic row. `SyncEngine.syncNow()` pushes the outbox, then pulls `GET /sync`. Connectivity restore triggers the same path from bootstrap.

Conflict policy matches SAD §5.9: server-wins for ownership/stage and completed follow-ups; merge-by-field for lead contact fields and follow-up notes.

Tokens live in Flutter Secure Storage, never in SQLite.
