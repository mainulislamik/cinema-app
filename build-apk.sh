#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

export JAVA_HOME="/home/imon/.jdks/jdk-17"
export ANDROID_HOME="/home/imon/Android/Sdk"
export ANDROID_SDK_ROOT="/home/imon/Android/Sdk"
export ANDROID_NDK_HOME="/home/imon/Android/Sdk/ndk/27.1.12297006"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:/home/imon/.npm-global/bin:$PATH"
if [ -f "/home/imon/.bashrc" ]; then
    EXPO_LINE=$(grep "^export EXPO_TOKEN=" /home/imon/.bashrc | tail -n 1)
    if [ -n "$EXPO_LINE" ]; then
        eval "$EXPO_LINE"
    fi
fi
export EXPO_TOKEN="${EXPO_TOKEN:-}"

OUTPUT="${1:-$DIR/cinema.apk}"

echo "🚀 Starting fast local APK build for Cinema App..."
echo "📦 Output target: $OUTPUT"
echo "⚙️ Java: $($JAVA_HOME/bin/java -version 2>&1 | head -n 1)"
echo "⚙️ Android SDK: $ANDROID_HOME"

eas build --platform android --profile production --local --output="$OUTPUT" --non-interactive

echo "✅ Local APK build finished successfully!"
echo "📁 Saved to: $OUTPUT"

# Auto-sync to moviebox-web downloads for in-app auto updates
WEB_DL_DIR="/home/imon/moviebox-web/frontend/public/downloads"
if [ -d "$WEB_DL_DIR" ]; then
    echo "🔄 Syncing new APK to $WEB_DL_DIR..."
    cp -f "$OUTPUT" "$WEB_DL_DIR/cinema.apk"
    cp -f "$OUTPUT" "$WEB_DL_DIR/moviebox.apk"
    echo "✅ Auto-update distribution ready at $WEB_DL_DIR"
fi
