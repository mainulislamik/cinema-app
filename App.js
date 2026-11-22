import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  BackHandler,
  Modal,
  Platform,
  ScrollView,
  RefreshControl,
  Linking,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';

const { width } = Dimensions.get('window');

const STORAGE_KEY = '@cinema_server_url';
const DEFAULT_SERVER_URL = 'http://169.40.116.114:8099';
const CURRENT_APP_VERSION = '1.0.4';

const isNewerVersion = (remoteVer, currentVer) => {
  if (!remoteVer || typeof remoteVer !== 'string') return false;
  const parse = (v) =>
    v
      .replace(/^v/i, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const r = parse(remoteVer);
  const c = parse(currentVer);
  const len = Math.max(r.length, c.length);
  for (let i = 0; i < len; i++) {
    const rv = r[i] || 0;
    const cv = c[i] || 0;
    if (rv > cv) return true;
    if (rv < cv) return false;
  }
  return false;
};

export default function App() {
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  // Modern In-App Auto Update states (StockWhisk style)
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateState, setUpdateState] = useState('idle'); // 'downloading' | 'installing' | 'completed' | 'error'
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateStatusText, setUpdateStatusText] = useState('');
  const [downloadedSizeText, setDownloadedSizeText] = useState('');
  const [downloadedApkUri, setDownloadedApkUri] = useState(null);
  const [downloadError, setDownloadError] = useState(null);

  const webViewRef = useRef(null);
  const canGoBackRef = useRef(false);
  const isUpdatingRef = useRef(false);
  const downloadResumableRef = useRef(null);

  // Animation values for StockWhisk-style updating overlay
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    canGoBackRef.current = canGoBack;
  }, [canGoBack]);

  useEffect(() => {
    isUpdatingRef.current = isUpdating;
  }, [isUpdating]);

  // Pulse animation loop
  useEffect(() => {
    if (!isUpdating) return;
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [isUpdating, pulseAnim]);

  // Spin animation loop
  useEffect(() => {
    if (!isUpdating) return;
    const spinLoop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spinLoop.start();
    return () => spinLoop.stop();
  }, [isUpdating, spinAnim]);

  // Smooth progress bar animation
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: updateProgress / 100,
      duration: 300,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [updateProgress, progressAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Package installation trigger via Android Intent Launcher
  const triggerInstallApk = async (apkFileUri) => {
    try {
      setUpdateStatusText('ইনস্টলেশন শুরু হচ্ছে...');
      setUpdateState('installing');

      if (Platform.OS === 'android') {
        const contentUri = await FileSystem.getContentUriAsync(apkFileUri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          type: 'application/vnd.android.package-archive',
        });
        setUpdateStatusText('ইনস্টলেশন ডায়ালগ ওপেন হয়েছে। কনফার্ম করুন।');
        setUpdateState('completed');
      } else {
        await Linking.openURL(apkFileUri);
      }
    } catch (err) {
      console.warn('Install launcher error:', err);
      setUpdateStatusText('ইনস্টলার চালু করা যায়নি। সরাসরি ব্রাউজারে খুলুন।');
      setUpdateState('error');
      setDownloadError(err.message || 'ইনস্টলেশন উইন্ডো খোলা যায়নি');
    }
  };

  // Automated In-App APK Downloader with Progress Tracking
  const startDownload = async (targetInfo) => {
    const info = targetInfo || updateInfo;
    if (!info) return;

    const downloadPath = info.download_url || '/downloads/cinema.apk';
    let apkUrl = downloadPath;
    if (!/^https?:\/\//i.test(downloadPath)) {
      const base = DEFAULT_SERVER_URL.replace(/\/+$/, '');
      apkUrl = `${base}${downloadPath.startsWith('/') ? '' : '/'}${downloadPath}`;
    }

    try {
      setIsUpdating(true);
      setUpdateState('downloading');
      setUpdateProgress(0);
      setDownloadError(null);
      setDownloadedSizeText('0 MB / 0 MB');
      setUpdateStatusText('নতুন সিস্টেম আপডেট পাওয়া গেছে, ডাউনলোড হচ্ছে...');

      const localApkPath = `${FileSystem.cacheDirectory}cinema_update.apk`;

      // Remove any stale cache file before initiating download
      try {
        const fileCheck = await FileSystem.getInfoAsync(localApkPath);
        if (fileCheck.exists) {
          await FileSystem.deleteAsync(localApkPath, { idempotent: true });
        }
      } catch (_) {}

      const downloadResumable = FileSystem.createDownloadResumable(
        apkUrl,
        localApkPath,
        {},
        (downloadProgress) => {
          const total = downloadProgress.totalBytesExpectedToWrite;
          const written = downloadProgress.totalBytesWritten;
          if (total > 0) {
            const percent = Math.min(100, Math.max(0, Math.round((written / total) * 100)));
            setUpdateProgress(percent);
            const writtenMB = (written / (1024 * 1024)).toFixed(1);
            const totalMB = (total / (1024 * 1024)).toFixed(1);
            setDownloadedSizeText(`${writtenMB} MB / ${totalMB} MB`);
          }
        }
      );

      downloadResumableRef.current = downloadResumable;
      const result = await downloadResumable.downloadAsync();

      if (result && result.uri) {
        setDownloadedApkUri(result.uri);
        setUpdateProgress(100);
        setUpdateStatusText('ডাউনলোড সম্পন্ন! ইনস্টলেশন শুরু হচ্ছে...');
        // Automatically launch package installer dialog
        await triggerInstallApk(result.uri);
      } else {
        throw new Error('ডাউনলোড ফাইল পাওয়া যায়নি');
      }
    } catch (err) {
      console.warn('Update download error:', err);
      setUpdateState('error');
      setDownloadError(err.message || 'ডাউনলোড ব্যর্থ হয়েছে');
      setUpdateStatusText('ডাউনলোড সম্পন্ন করা যায়নি');
    }
  };

  const checkForUpdates = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(`${DEFAULT_SERVER_URL}/api/app/version`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (!response.ok) return;

      const data = await response.json();
      if (data && isNewerVersion(data.version, CURRENT_APP_VERSION)) {
        setUpdateInfo(data);
        // Automatically start in-app update download & show overlay
        startDownload(data);
      }
    } catch (err) {
      clearTimeout(timeoutId);
    }
  }, []);

  // Ensure app always points to DEFAULT_SERVER_URL and lock portrait orientation on root
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    const initServerUrl = async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, DEFAULT_SERVER_URL);
      } catch (err) {
        console.warn('Unable to access AsyncStorage:', err);
      } finally {
        setIsStorageLoaded(true);
        checkForUpdates();
      }
    };
    initServerUrl();
  }, [checkForUpdates]);

  // Hardware back button support
  useEffect(() => {
    const onBackPress = () => {
      if (isUpdatingRef.current) {
        // Dismiss updating overlay on back press if completed or error
        setIsUpdating(false);
        return true;
      }
      if (canGoBackRef.current && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );

    return () => backSubscription.remove();
  }, []);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    setSessionKey((prev) => prev + 1);
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    handleRetry();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1200);
  }, [handleRetry]);

  const handleWebViewError = (syntheticEvent) => {
    console.warn('WebView error occurred:', syntheticEvent.nativeEvent);
    setHasError(true);
    setIsLoading(false);
  };

  const handleHttpError = (syntheticEvent) => {
    if (syntheticEvent.nativeEvent.statusCode >= 400) {
      console.warn('WebView HTTP error:', syntheticEvent.nativeEvent.statusCode);
      setHasError(true);
      setIsLoading(false);
    }
  };

  // Bidirectional communication with web player for auto horizontal orientation
  const handleWebViewMessage = useCallback((event) => {
    try {
      const data = event.nativeEvent.data;
      if (!data) return;
      const msg = typeof data === 'string' ? JSON.parse(data) : data;
      if (msg && msg.type === 'SET_ORIENTATION') {
        if (msg.orientation === 'landscape') {
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } else if (msg.orientation === 'portrait') {
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        } else if (msg.orientation === 'unlock') {
          ScreenOrientation.unlockAsync();
        }
      }
    } catch (err) {
      console.warn('WebView message error:', err);
    }
  }, []);

  const handleContentProcessDidTerminate = useCallback(() => {
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  }, []);

  // Wait until storage initialization completes before mounting WebView
  if (!isStorageLoaded) {
    return (
      <View style={styles.splashScreen}>
        <StatusBar barStyle="light-content" translucent backgroundColor="#090d16" />
        <View style={styles.brandingBox}>
          <Feather name="film" size={32} color="#f8fafc" />
          <Text style={styles.splashBrand}>CINEMA</Text>
        </View>
        <ActivityIndicator size="small" color="#38bdf8" style={styles.splashSpinner} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.rootContainer}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#090d16"
        translucent={true}
      />

      {/* Main WebView streaming container */}
      <View style={styles.webContainer}>
        <WebView
          ref={webViewRef}
          key={`cinema-wv-${sessionKey}`}
          source={{ uri: DEFAULT_SERVER_URL }}
          style={styles.webView}
          allowsBackForwardNavigationGestures={true}
          pullToRefreshEnabled={true}
          allowsFullscreenVideo={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          mixedContentMode="always"
          originWhitelist={['*']}
          onMessage={handleWebViewMessage}
          onContentProcessDidTerminate={handleContentProcessDidTerminate}
          onNavigationStateChange={(navState) => {
            setCanGoBack(navState.canGoBack);
          }}
          onLoadStart={() => {
            if (!isRefreshing) {
              setIsLoading(true);
            }
          }}
          onLoadEnd={() => {
            setIsLoading(false);
          }}
          onError={handleWebViewError}
          onReceivedError={handleWebViewError}
          onHttpError={handleHttpError}
          renderError={() => (
            <View style={{ flex: 1, backgroundColor: '#090d16' }} />
          )}
        />

        {/* Initial / Reload Loading Screen */}
        {isLoading && !hasError && (
          <View style={styles.loadingOverlay}>
            <View style={styles.brandingCard}>
              <View style={styles.brandRow}>
                <Feather name="film" size={28} color="#f8fafc" />
                <Text style={styles.brandTitle}>CINEMA</Text>
              </View>
              <View style={styles.badgeContainer}>
                <Text style={styles.badgeText}>STREAMING CLIENT</Text>
              </View>
            </View>

            <ActivityIndicator size="large" color="#38bdf8" style={styles.loader} />
            <Text style={styles.loadingCaption}>Loading Cinema...</Text>
          </View>
        )}

        {/* Server Offline Screen */}
        {hasError && (
          <View style={styles.errorOverlay}>
            <ScrollView
              contentContainerStyle={styles.errorScrollContent}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor="#38bdf8"
                  colors={['#38bdf8']}
                />
              }
            >
              <View style={styles.errorIconCircle}>
                <Feather name="wifi-off" size={32} color="#94a3b8" />
              </View>

              <Text style={styles.errorHeading}>Server Offline</Text>

              <TouchableOpacity
                style={styles.retryButton}
                activeOpacity={0.85}
                onPress={handleRetry}
              >
                <Feather name="refresh-cw" size={16} color="#090d16" style={{ marginRight: 8 }} />
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </View>

      {/* StockWhisk-style Animated Updating Overlay */}
      <Modal
        visible={isUpdating}
        animationType="fade"
        transparent={false}
        onRequestClose={() => {
          if (updateState === 'completed' || updateState === 'error') {
            setIsUpdating(false);
          }
        }}
      >
        <View style={styles.updatingOverlayRoot}>
          <StatusBar barStyle="light-content" translucent backgroundColor="#070a13" />

          {/* Background Ambient Glows */}
          <View style={styles.ambientGlowTop} />
          <View style={styles.ambientGlowBottom} />

          <View style={styles.updatingContentContainer}>
            {/* Pulsing Cinema Logo */}
            <View style={styles.updatingLogoWrapper}>
              <Animated.View
                style={[
                  styles.glowHalo,
                  {
                    transform: [{ scale: pulseAnim }],
                  },
                ]}
              />
              <View style={styles.logoCircle}>
                <Feather name="film" size={38} color="#f8fafc" />
              </View>
              <Animated.View style={[styles.updateBadge, { transform: [{ rotate: spin }] }]}>
                <Feather name="refresh-cw" size={16} color="#ffffff" />
              </Animated.View>
            </View>

            {/* Brand Typography */}
            <Text style={styles.updatingBrandTitle}>CINEMA</Text>
            <Text style={styles.updatingBrandSubtitle}>STREAMING CLIENT • SYSTEM UPDATE</Text>

            {/* Updating Status Card */}
            <View style={styles.statusCard}>
              <View style={styles.statusHeaderRow}>
                <View style={styles.pulseDot} />
                <Text style={styles.statusHeading}>
                  {updateStatusText || 'নতুন সিস্টেম আপডেট হচ্ছে...'}
                </Text>
              </View>

              <Text style={styles.statusSubtext}>
                {updateInfo?.release_notes
                  ? `v${updateInfo.version}: ${updateInfo.release_notes}`
                  : `লেটেস্ট ভার্সন v${updateInfo?.version || CURRENT_APP_VERSION} ডাউনলোড ও ইনস্টল হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন`}
              </Text>

              {/* Animated Progress Bar */}
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressBar,
                    {
                      width: progressWidth,
                      backgroundColor: updateState === 'error' ? '#ef4444' : '#38bdf8',
                    },
                  ]}
                />
              </View>

              <View style={styles.progressInfoRow}>
                <Text style={styles.progressPercentText}>{updateProgress}% সম্পন্ন</Text>
                <Text style={styles.progressStateText}>
                  {downloadedSizeText || (updateState === 'installing' ? 'ইনস্টল হচ্ছে' : 'প্রস্তুত হচ্ছে')}
                </Text>
              </View>

              {/* Action Buttons depending on state */}
              {updateState === 'completed' && downloadedApkUri && (
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity
                    style={styles.installNowButton}
                    activeOpacity={0.85}
                    onPress={() => triggerInstallApk(downloadedApkUri)}
                  >
                    <Feather name="check-circle" size={16} color="#090d16" style={{ marginRight: 6 }} />
                    <Text style={styles.installNowButtonText}>এখনই ইনস্টল করুন</Text>
                  </TouchableOpacity>
                </View>
              )}

              {updateState === 'error' && (
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity
                    style={styles.retryActionButton}
                    activeOpacity={0.85}
                    onPress={() => startDownload(updateInfo)}
                  >
                    <Feather name="refresh-cw" size={15} color="#090d16" style={{ marginRight: 6 }} />
                    <Text style={styles.retryActionButtonText}>আবার চেষ্টা করুন</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.browserActionButton}
                    activeOpacity={0.85}
                    onPress={() => {
                      const downloadPath = updateInfo?.download_url || '/downloads/cinema.apk';
                      const url = /^https?:\/\//i.test(downloadPath)
                        ? downloadPath
                        : `${DEFAULT_SERVER_URL.replace(/\/+$/, '')}/${downloadPath.replace(/^\//, '')}`;
                      Linking.openURL(url);
                    }}
                  >
                    <Feather name="external-link" size={15} color="#f8fafc" style={{ marginRight: 6 }} />
                    <Text style={styles.browserActionButtonText}>ব্রাউজারে খুলুন</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Dismiss / Later button */}
              <TouchableOpacity
                style={styles.laterLinkButton}
                activeOpacity={0.7}
                onPress={() => setIsUpdating(false)}
              >
                <Text style={styles.laterLinkText}>পরে আপডেট করুন</Text>
              </TouchableOpacity>
            </View>

            {/* Bottom Security / Trust Badge */}
            <View style={styles.footerContainer}>
              <View style={styles.securityBadge}>
                <Feather name="shield" size={14} color="#10b981" />
                <Text style={styles.securityText}>অফিসিয়াল নিরাপদ আপডেট • StockWhisk ক্লাউড ইঞ্জিন</Text>
              </View>
              <Text style={styles.versionFooterText}>
                Current: v{CURRENT_APP_VERSION} → Target: v{updateInfo?.version || CURRENT_APP_VERSION}
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#090d16',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0,
  },
  webContainer: {
    flex: 1,
    backgroundColor: '#090d16',
    position: 'relative',
  },
  webView: {
    flex: 1,
    backgroundColor: '#090d16',
  },

  /* Startup Splash */
  splashScreen: {
    flex: 1,
    backgroundColor: '#090d16',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandingBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashBrand: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 4,
    marginTop: 12,
  },
  splashSpinner: {
    marginTop: 24,
  },

  /* Loading Overlay */
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#090d16',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 10,
  },
  brandingCard: {
    alignItems: 'center',
    marginBottom: 28,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  brandTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 3,
  },
  badgeContainer: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  badgeText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  loader: {
    marginBottom: 16,
  },
  loadingCaption: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },

  /* Offline / Error Overlay */
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#090d16',
    zIndex: 20,
  },
  errorScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  errorHeading: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 24,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#090d16',
    fontSize: 14,
    fontWeight: '700',
  },

  /* Modern StockWhisk-style Updating Overlay */
  updatingOverlayRoot: {
    flex: 1,
    backgroundColor: '#070a13',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  ambientGlowTop: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
  },
  ambientGlowBottom: {
    position: 'absolute',
    bottom: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  updatingContentContainer: {
    width: '100%',
    maxWidth: 420,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updatingLogoWrapper: {
    width: 90,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  glowHalo: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(56, 189, 248, 0.25)',
  },
  logoCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#0f172a',
    borderWidth: 2,
    borderColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  updateBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0284c7',
    borderWidth: 2,
    borderColor: '#070a13',
    justifyContent: 'center',
    alignItems: 'center',
  },
  updatingBrandTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 4,
    marginBottom: 4,
  },
  updatingBrandSubtitle: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 24,
  },
  statusCard: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#38bdf8',
  },
  statusHeading: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  statusSubtext: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#1e293b',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressPercentText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  progressStateText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 6,
  },
  installNowButton: {
    flex: 1,
    backgroundColor: '#38bdf8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  installNowButtonText: {
    color: '#090d16',
    fontSize: 14,
    fontWeight: '700',
  },
  retryActionButton: {
    flex: 1,
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryActionButtonText: {
    color: '#090d16',
    fontSize: 13,
    fontWeight: '700',
  },
  browserActionButton: {
    flex: 1,
    backgroundColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  browserActionButtonText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
  },
  laterLinkButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  laterLinkText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  footerContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  securityText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  versionFooterText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '500',
  },
});
