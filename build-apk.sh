#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

export JAVA_HOME="/home/imon/.jdks/jdk-17"
export ANDROID_HOME="/home/imon/Android/Sdk"
export ANDROID_SDK_ROOT="/home/imon/Android/Sdk"
export ANDROID_NDK_HOME="/home/imon/Android/Sdk/ndk/27.1.12297006"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:/home/imon/.npm-global/bin:$PATH"
export EXPO_TOKEN="${EXPO_TOKEN:-gnmvrFx3pZxh-y9h0jvfOTBfd8XpT7Nrgfw_l_gz}"

OUTPUT="${1:-$DIR/cinema.apk}"

echo "🚀 Starting fast local APK build for Cinema App..."
echo "📦 Output target: $OUTPUT"
echo "⚙️ Java: $($JAVA_HOME/bin/java -version 2>&1 | head -n 1)"
echo "⚙️ Android SDK: $ANDROID_HOME"

eas build --platform android --profile production --local --output="$OUTPUT" --non-interactive

echo "✅ Local APK build finished successfully!"
echo "📁 Saved to: $OUTPUT"
