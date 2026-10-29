import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Firebase Cloud Messaging is optional at build time. Applying google-services
// unconditionally fails the build on any checkout without google-services.json
// (CI included), so it is applied only when the file has actually been dropped in.
// Without it the app still builds and runs; PushNotificationService catches the
// Firebase.initializeApp failure and logs "FCM skipped".
val googleServicesFile = file("google-services.json")
if (googleServicesFile.exists()) {
    apply(plugin = "com.google.gms.google-services")
}

// Release signing is read from android/key.properties, which is gitignored.
// See android/key.properties.example. Falls back to debug keys when absent so
// `flutter build apk --release` still works for local smoke tests.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
}

android {
    namespace = "com.codecarrots.intracrm"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // Kotlin otherwise targets whatever JDK runs Gradle (25 on this machine),
    // which fails compileDebugKotlin against the Java 17 target above.
    kotlin {
        compilerOptions {
            jvmTarget = JvmTarget.JVM_17
        }
    }

    defaultConfig {
        // TODO: replace com.example before the first Play Store upload. Must be
        // changed together with the iOS PRODUCT_BUNDLE_IDENTIFIER and re-registered
        // in the Firebase console, or push tokens will not resolve.
        applicationId = "com.codecarrots.intracrm"
        // minSdk 24 (Flutter default) satisfies firebase_messaging, mobile_scanner
        // and geolocator; do not lower it.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = keystoreProperties["storeFile"]?.let { file(it) }
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            // R8 / resource shrinking is intentionally left at the Flutter default
            // (off). Turn it on only alongside a verified `flutter build appbundle
            // --release` run, since Firebase and mobile_scanner need keep rules.
        }
    }
}

flutter {
    source = "../.."
}
