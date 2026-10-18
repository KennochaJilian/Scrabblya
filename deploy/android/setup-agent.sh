#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
[[ $(uname -m) = x86_64 ]] || { echo 'This SDK setup targets a Linux x86_64 agent.' >&2; exit 1; }
agent="${1:-azagent}"
id "$agent" >/dev/null
sdk=/opt/android-sdk
apt-get update
apt-get install -y ca-certificates curl unzip
work_dir=$(mktemp -d /tmp/scrabblya-android.XXXXXX)
[[ "$work_dir" = /tmp/scrabblya-android.* ]] || exit 1
trap 'rm -rf -- "$work_dir"' EXIT
java_home=/opt/scrabblya/java-21
install -d /opt/scrabblya
if [[ ! -e "$java_home" && ! -L "$java_home" ]]; then
  if [[ -x /usr/lib/jvm/java-21-openjdk-amd64/bin/javac ]]; then
    ln -s /usr/lib/jvm/java-21-openjdk-amd64 "$java_home"
  elif apt-cache show openjdk-21-jdk-headless >/dev/null 2>&1; then
    apt-get install -y openjdk-21-jdk-headless
    ln -s /usr/lib/jvm/java-21-openjdk-amd64 "$java_home"
  else
    echo 'Java 21 is unavailable in apt; installing Eclipse Temurin 21.'
    asset_url=$(curl --fail --silent --show-error --output /dev/null --write-out '%{redirect_url}' https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse)
    [[ "$asset_url" = https://github.com/adoptium/temurin21-binaries/releases/download/* ]] || { echo 'Unexpected Temurin download URL.' >&2; exit 1; }
    curl --fail --location --retry 3 "$asset_url" -o "$work_dir/java.tar.gz"
    curl --fail --location --retry 3 "$asset_url.sha256.txt" -o "$work_dir/java.sha256"
    checksum=$(awk 'NR==1 {print $1}' "$work_dir/java.sha256")
    [[ "$checksum" =~ ^[a-fA-F0-9]{64}$ ]] || exit 1
    echo "$checksum  $work_dir/java.tar.gz" | sha256sum --check -
    mkdir "$work_dir/jdk"
    tar -xzf "$work_dir/java.tar.gz" --strip-components=1 -C "$work_dir/jdk"
    [[ -x "$work_dir/jdk/bin/javac" ]] || { echo 'Downloaded archive does not contain a JDK.' >&2; exit 1; }
    [[ ! -e /opt/scrabblya/temurin-21 ]] || { echo 'Inspect the existing Temurin directory before retrying.' >&2; exit 1; }
    mv "$work_dir/jdk" /opt/scrabblya/temurin-21
    ln -s /opt/scrabblya/temurin-21 "$java_home"
  fi
fi
[[ -x "$java_home/bin/javac" ]] || { echo 'Configured Java directory does not contain a JDK.' >&2; exit 1; }
"$java_home/bin/java" -version 2>&1 | grep -E 'version "21([."]|$)' >/dev/null || { echo 'Configured JDK is not Java 21.' >&2; exit 1; }
install -d -o "$agent" -g "$(id -gn "$agent")" "$sdk" "$sdk/cmdline-tools"
if [[ ! -x "$sdk/cmdline-tools/latest/bin/sdkmanager" ]]; then
  curl --fail --location --retry 3 https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip -o "$work_dir/tools.zip"
  echo '4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583  '"$work_dir/tools.zip" | sha256sum --check -
  unzip -q "$work_dir/tools.zip" -d "$work_dir"
  [[ ! -e "$sdk/cmdline-tools/latest" ]] || { echo 'Existing SDK directory requires manual inspection.' >&2; exit 1; }
  mv "$work_dir/cmdline-tools" "$sdk/cmdline-tools/latest"
  chown -R "$agent:$(id -gn "$agent")" "$sdk/cmdline-tools/latest"
fi
printf '\nSDK installed. Review and accept its licenses as the agent user:\n'
printf 'sudo -u %s env JAVA_HOME=%s %s/cmdline-tools/latest/bin/sdkmanager --sdk_root=%s --licenses\n' "$agent" "$java_home" "$sdk" "$sdk"
printf '\nThe pipeline sets JAVA_HOME and ANDROID_HOME explicitly.\n'
