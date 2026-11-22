# Cinema Mobile (Standalone Expo App)

This is the standalone React Native & Expo mobile app for **Cinema**.

## Core Standalone Architecture (Zero Server Dependency)
- **Local Native Execution:** The app's JavaScript bundle runs 100% locally on each user's Android device inside the native Hermes engine.
- **Offline Fallback:** If the central website or server is completely offline/down, the app never crashes or shows a blank web page. It automatically runs in **Offline/Local Mode** with its embedded catalog and local cache (`@react-native-async-storage/async-storage`).
- **Direct BDIX Streaming:** Video streams link directly to high-speed BDIX mirrors and CDNs without routing traffic through your host server.

## Commands
- Start dev server: `npx expo start`
- Test in Android device/emulator: `npx expo run:android`
- Build Standalone APK: `npx eas build -p android --profile preview`
