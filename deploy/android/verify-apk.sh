#!/usr/bin/env bash
set -euo pipefail
apk="${1:?Missing APK path}"
: "${ANDROID_HOME:?Missing ANDROID_HOME}" "${ANDROID_KEYSTORE_FILE:?Missing keystore}" "${ANDROID_KEYSTORE_PASSWORD:?Missing signing password}" "${ANDROID_KEY_ALIAS:?Missing alias}" "${ANDROID_VERSION_CODE:?Missing versionCode}"
tools="$ANDROID_HOME/build-tools/36.0.0"
"$tools/apksigner" verify --verbose "$apk"
expected=$(keytool -exportcert -keystore "$ANDROID_KEYSTORE_FILE" -alias "$ANDROID_KEY_ALIAS" -storepass:env ANDROID_KEYSTORE_PASSWORD | sha256sum); expected="${expected%% *}"
actual=$("$tools/apksigner" verify --print-certs "$apk" | awk '/Signer #1 certificate SHA-256 digest:/ {print $NF}')
[[ "$expected" = "$actual" ]] || { echo 'APK signature differs from the configured release key.' >&2; exit 1; }
badging=$("$tools/aapt" dump badging "$apk")
package_line="${badging%%$'\n'*}"
[[ "$package_line" == *"name='com.scrabblya.app'"* && "$package_line" == *"versionCode='$ANDROID_VERSION_CODE'"* ]] || { echo 'Unexpected package or versionCode.' >&2; exit 1; }
if grep -q '^application-debuggable' <<< "$badging"; then echo 'Refusing a debuggable APK.' >&2; exit 1; fi
echo 'APK verified: release signature, package, versionCode and non-debuggable build.'
