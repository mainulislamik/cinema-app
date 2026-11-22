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
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';

const STORAGE_KEY = '@cinema_server_url';
const DEFAULT_SERVER_URL = 'http://169.40.116.114:8099';
const CURRENT_APP_VERSION = '1.0.2';

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

  // Auto-update checker states
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);

  const webViewRef = useRef(null);
  const canGoBackRef = useRef(false);
  const updateModalVisibleRef = useRef(false);

  useEffect(() => {
    canGoBackRef.current = canGoBack;
  }, [canGoBack]);

  useEffect(() => {
    updateModalVisibleRef.current = updateModalVisible;
  }, [updateModalVisible]);

  const checkForUpdates = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${DEFAULT_SERVER_URL}/api/app/version`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }

      const data = await response.json();
      if (data && isNewerVersion(data.version, CURRENT_APP_VERSION)) {
        setUpdateInfo(data);
        setUpdateModalVisible(true);
      }
    } catch (err) {
      clearTimeout(timeoutId);
    }
  }, []);

  // Ensure app always points to DEFAULT_SERVER_URL and overwrite any stale cached URLs
  useEffect(() => {
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
      if (updateModalVisibleRef.current) {
        setUpdateModalVisible(false);
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

  const handleDownloadUpdate = async () => {
    if (!updateInfo) return;
    const downloadPath = updateInfo.download_url || '/downloads/cinema.apk';
    let apkUrl = downloadPath;
    if (!/^https?:\/\//i.test(downloadPath)) {
      const base = DEFAULT_SERVER_URL.replace(/\/+$/, '');
      apkUrl = `${base}${downloadPath.startsWith('/') ? '' : '/'}${downloadPath}`;
    }
    try {
      await Linking.openURL(apkUrl);
    } catch (err) {
      console.warn('Failed to open update URL:', err);
      Alert.alert('Download Failed', 'Could not open APK download link.');
    }
  };

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
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo={true}
          cacheEnabled={true}
          mixedContentMode="always"
          allowsBackForwardNavigationGestures={true}
          pullToRefreshEnabled={true}
          originWhitelist={['*']}
          setSupportMultipleWindows={false}
          scalesPageToFit={true}
          onNavigationStateChange={(navState) => {
            setCanGoBack(navState.canGoBack);
          }}
          onLoadStart={() => {
            if (!hasError) {
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

      {/* In-App Update Modal */}
      <Modal
        visible={updateModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setUpdateModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.updateModalSheet}>
            <View style={styles.updateModalHeader}>
              <View style={styles.updateIconCircle}>
                <Feather name="arrow-down-circle" size={24} color="#38bdf8" />
              </View>
              <TouchableOpacity
                onPress={() => setUpdateModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name="x" size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.updateTitle}>New Update Available</Text>

            <View style={styles.updateVersionRow}>
              <View style={styles.updateVersionBadge}>
                <Text style={styles.updateVersionBadgeText}>
                  v{updateInfo?.version || CURRENT_APP_VERSION}
                </Text>
              </View>
              {updateInfo?.architecture ? (
                <Text style={styles.updateArchText}>{updateInfo.architecture}</Text>
              ) : null}
            </View>

            {updateInfo?.release_notes ? (
              <View style={styles.notesContainer}>
                <Text style={styles.notesHeading}>RELEASE NOTES</Text>
                <Text style={styles.notesContent}>{updateInfo.release_notes}</Text>
              </View>
            ) : null}

            <View style={styles.updateButtonStack}>
              <TouchableOpacity
                style={styles.updateLaterButton}
                activeOpacity={0.8}
                onPress={() => setUpdateModalVisible(false)}
              >
                <Text style={styles.updateLaterButtonText}>Later</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.updateNowButton}
                activeOpacity={0.85}
                onPress={handleDownloadUpdate}
              >
                <Feather name="download" size={15} color="#090d16" style={{ marginRight: 6 }} />
                <Text style={styles.updateNowButtonText}>Update Now</Text>
              </TouchableOpacity>
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

  /* Modal Backdrop & In-App Update Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  updateModalSheet: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 20,
  },
  updateModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  updateIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  updateVersionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  updateVersionBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  updateVersionBadgeText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  updateArchText: {
    color: '#64748b',
    fontSize: 11,
  },
  notesContainer: {
    backgroundColor: '#090d16',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 12,
    marginBottom: 20,
  },
  notesHeading: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  notesContent: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
  updateButtonStack: {
    flexDirection: 'row',
    gap: 12,
  },
  updateLaterButton: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateLaterButtonText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  updateNowButton: {
    flex: 1.6,
    backgroundColor: '#38bdf8',
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateNowButtonText: {
    color: '#090d16',
    fontSize: 14,
    fontWeight: '700',
  },
});


