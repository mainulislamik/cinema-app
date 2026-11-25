#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

export JAVA_HOME="/home/imon/.jdks/jdk-17"
export ANDROID_HOME="/home/imon/Android/Sdk"
export ANDROID_SDK_ROOT="/home/imon/Android/Sdk"
export ANDROID_NDK_HOME="/home/imon/Android/Sdk/ndk/27.1.12297006"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:/home/imon/.npm-global/bin:$PATH"

OUTPUT="${1:-$DIR/cinema.apk}"

echo "🚀 Running direct Gradle Release APK build..."
cd "$DIR/android"
./gradlew assembleRelease --no-daemon

APK_BUILT="$DIR/android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK_BUILT" ]; then
    APK_BUILT=$(find "$DIR/android/app/build/outputs/apk/release" -name "*.apk" | head -n 1)
fi

if [ -f "$APK_BUILT" ]; then
    cp -f "$APK_BUILT" "$OUTPUT"
    echo "✅ APK created successfully: $OUTPUT"
    
    WEB_DL_DIR="/home/imon/moviebox-web/frontend/public/downloads"
    if [ -d "$WEB_DL_DIR" ]; then
        cp -f "$OUTPUT" "$WEB_DL_DIR/cinema.apk"
        cp -f "$OUTPUT" "$WEB_DL_DIR/moviebox.apk"
        echo "✅ Synced to $WEB_DL_DIR"
    fi
else
    echo "❌ APK build output not found!"
    exit 1
fi
