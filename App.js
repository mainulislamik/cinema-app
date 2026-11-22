import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  BackHandler,
  Modal,
  Platform,
  KeyboardAvoidingView,
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
const CURRENT_APP_VERSION = '1.0.1';

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
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [tempUrl, setTempUrl] = useState(DEFAULT_SERVER_URL);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorDetails, setErrorDetails] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  // Auto-update checker states
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const webViewRef = useRef(null);
  const canGoBackRef = useRef(false);
  const isSettingsOpenRef = useRef(false);
  const updateModalVisibleRef = useRef(false);

  useEffect(() => {
    canGoBackRef.current = canGoBack;
  }, [canGoBack]);

  useEffect(() => {
    isSettingsOpenRef.current = isSettingsOpen;
  }, [isSettingsOpen]);

  useEffect(() => {
    updateModalVisibleRef.current = updateModalVisible;
  }, [updateModalVisible]);

  const normalizeUrl = (raw) => {
    let url = (raw || '').trim();
    if (!url) return DEFAULT_SERVER_URL;
    if (!/^https?:\/\//i.test(url)) {
      url = 'http://' + url;
    }
    return url.replace(/\/+$/, '');
  };

  const checkForUpdates = useCallback(
    async (targetUrl, manualTrigger = false) => {
      const base = normalizeUrl(targetUrl || serverUrl);
      setIsCheckingUpdate(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${base}/api/app/version`, {
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
        } else if (manualTrigger) {
          Alert.alert('Up to Date', `You are using the latest version (v${CURRENT_APP_VERSION}).`);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        if (manualTrigger) {
          Alert.alert('Check Failed', 'Could not reach update server.');
        }
      } finally {
        setIsCheckingUpdate(false);
      }
    },
    [serverUrl]
  );

  // Load configured server URL from storage on startup and check for updates
  useEffect(() => {
    const loadSavedUrl = async () => {
      let initialUrl = DEFAULT_SERVER_URL;
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && stored.trim().length > 0) {
          let trimmed = stored.trim();
          // Auto-migrate from old local network IP or localhost to VPS IP
          if (trimmed.includes('192.168.100.13') || trimmed.includes('localhost') || trimmed.includes('127.0.0.1')) {
            trimmed = DEFAULT_SERVER_URL;
            await AsyncStorage.setItem(STORAGE_KEY, DEFAULT_SERVER_URL);
          }
          initialUrl = trimmed;
          setServerUrl(initialUrl);
          setTempUrl(initialUrl);
        }
      } catch (err) {
        console.warn('Unable to access AsyncStorage:', err);
      } finally {
        setIsStorageLoaded(true);
        checkForUpdates(initialUrl, false);
      }
    };
    loadSavedUrl();
  }, [checkForUpdates]);

  // Hardware back button support
  useEffect(() => {
    const onBackPress = () => {
      if (updateModalVisibleRef.current) {
        setUpdateModalVisible(false);
        return true;
      }
      if (isSettingsOpenRef.current) {
        setIsSettingsOpen(false);
        return true;
      }
      if (canGoBackRef.current && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false; // Exit app or pass to system cleanly
    };

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );

    return () => backSubscription.remove();
  }, []);

  const handleSaveUrl = async () => {
    const formatted = normalizeUrl(tempUrl);
    setServerUrl(formatted);
    setTempUrl(formatted);
    setIsSettingsOpen(false);
    setHasError(false);
    setIsLoading(true);
    setSessionKey((prev) => prev + 1);

    try {
      await AsyncStorage.setItem(STORAGE_KEY, formatted);
    } catch (err) {
      console.warn('Failed to persist server URL:', err);
    }
  };

  const handleResetDefaultUrl = () => {
    setTempUrl(DEFAULT_SERVER_URL);
  };

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    setErrorDetails('');
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
      const base = serverUrl.replace(/\/+$/, '');
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
    const { nativeEvent } = syntheticEvent;
    console.warn('WebView error occurred:', nativeEvent);
    setHasError(true);
    setIsLoading(false);
    setErrorDetails(nativeEvent.description || 'Connection refused or timed out');
  };

  const handleHttpError = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    if (nativeEvent.statusCode >= 400) {
      console.warn('WebView HTTP error:', nativeEvent.statusCode);
      setHasError(true);
      setIsLoading(false);
      setErrorDetails(`Server responded with HTTP ${nativeEvent.statusCode}`);
    }
  };

  // Wait until stored URL is retrieved before mounting WebView
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
          key={`cinema-wv-${sessionKey}-${serverUrl}`}
          source={{ uri: serverUrl }}
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
          renderError={() => null}
        />

        {/* Sleek Dark Slate Initial/Reload Loading Screen */}
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
            <Text style={styles.loadingCaption}>Connecting to Cinema server...</Text>

            <View style={styles.urlIndicator}>
              <Feather name="server" size={12} color="#64748b" style={{ marginRight: 6 }} />
              <Text style={styles.urlIndicatorText} numberOfLines={1}>
                {serverUrl}
              </Text>
            </View>
          </View>
        )}

        {/* Premium Offline / Connection Failed Screen */}
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

              <Text style={styles.errorHeading}>Connection Failed</Text>
              <Text style={styles.errorSubHeading}>
                Cannot connect to Cinema Server at
              </Text>

              <View style={styles.serverPill}>
                <Feather name="server" size={13} color="#38bdf8" style={{ marginRight: 6 }} />
                <Text style={styles.serverPillText} numberOfLines={1}>
                  {serverUrl}
                </Text>
              </View>

              <Text style={styles.errorBody}>
                {errorDetails
                  ? `Diagnostics: ${errorDetails}.`
                  : 'The host server is unreachable.'}{' '}
                Please check that the streaming server is running and your device is connected to the same local network or BDIX.
              </Text>

              <View style={styles.errorButtonStack}>
                <TouchableOpacity
                  style={styles.retryButton}
                  activeOpacity={0.85}
                  onPress={handleRetry}
                >
                  <Feather name="refresh-cw" size={16} color="#090d16" style={{ marginRight: 8 }} />
                  <Text style={styles.retryButtonText}>Retry Connection</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.changeServerButton}
                  activeOpacity={0.85}
                  onPress={() => {
                    setTempUrl(serverUrl);
                    setIsSettingsOpen(true);
                  }}
                >
                  <Feather name="sliders" size={16} color="#f8fafc" style={{ marginRight: 8 }} />
                  <Text style={styles.changeServerButtonText}>Change Server Address</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.pullHint}>Pull down anywhere to retry</Text>
            </ScrollView>
          </View>
        )}

        {/* Discreet Quick Config button when stream is loaded */}
        {!hasError && !isLoading && (
          <TouchableOpacity
            style={styles.floatingSettingsToggle}
            activeOpacity={0.7}
            onPress={() => {
              setTempUrl(serverUrl);
              setIsSettingsOpen(true);
            }}
          >
            <Feather name="sliders" size={14} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Configure Server Address & Settings Modal */}
      <Modal
        visible={isSettingsOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsSettingsOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Feather name="sliders" size={18} color="#f8fafc" />
                <Text style={styles.modalHeading}>Server Settings</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsSettingsOpen(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name="x" size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Version Badge & Check Updates */}
            <View style={styles.versionContainer}>
              <View style={styles.versionBadge}>
                <Feather name="smartphone" size={13} color="#94a3b8" style={{ marginRight: 6 }} />
                <Text style={styles.versionBadgeText}>Cinema v{CURRENT_APP_VERSION}</Text>
              </View>
              <TouchableOpacity
                style={styles.checkUpdateButton}
                activeOpacity={0.8}
                disabled={isCheckingUpdate}
                onPress={() => checkForUpdates(serverUrl, true)}
              >
                {isCheckingUpdate ? (
                  <ActivityIndicator size="small" color="#38bdf8" />
                ) : (
                  <>
                    <Feather name="refresh-cw" size={12} color="#38bdf8" style={{ marginRight: 6 }} />
                    <Text style={styles.checkUpdateButtonText}>Check for Updates</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>SERVER URL / IP ADDRESS</Text>
            <TextInput
              style={styles.urlInput}
              value={tempUrl}
              onChangeText={setTempUrl}
              placeholder="http://192.168.100.13:8099"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={handleSaveUrl}
            />

            <TouchableOpacity
              style={styles.resetRow}
              activeOpacity={0.7}
              onPress={handleResetDefaultUrl}
            >
              <Feather name="corner-down-left" size={12} color="#64748b" style={{ marginRight: 6 }} />
              <Text style={styles.resetRowText}>Reset to default ({DEFAULT_SERVER_URL})</Text>
            </TouchableOpacity>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelAction}
                activeOpacity={0.8}
                onPress={() => setIsSettingsOpen(false)}
              >
                <Text style={styles.cancelActionText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveAction}
                activeOpacity={0.85}
                onPress={handleSaveUrl}
              >
                <Feather name="check" size={15} color="#090d16" style={{ marginRight: 6 }} />
                <Text style={styles.saveActionText}>Save & Connect</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
                  v{updateInfo?.version || '1.0.1'}
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

  /* Sleek Loading Overlay */
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
    marginBottom: 12,
  },
  urlIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
    maxWidth: '90%',
  },
  urlIndicatorText: {
    color: '#64748b',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSubHeading: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'center',
  },
  serverPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 16,
    maxWidth: '92%',
  },
  serverPillText: {
    color: '#38bdf8',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorBody: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  errorButtonStack: {
    width: '100%',
    gap: 12,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#090d16',
    fontSize: 14,
    fontWeight: '700',
  },
  changeServerButton: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 8,
  },
  changeServerButtonText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  pullHint: {
    color: '#475569',
    fontSize: 11,
    marginTop: 8,
  },

  /* Subtle Quick Settings Button */
  floatingSettingsToggle: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },

  /* Modal Sheet */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalSheet: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalHeading: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '700',
  },

  /* Version Badge & Check Updates */
  versionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#090d16',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 16,
  },
  versionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  versionBadgeText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  checkUpdateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  checkUpdateButtonText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },

  fieldLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  urlInput: {
    backgroundColor: '#090d16',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#f8fafc',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 8,
  },
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 4,
  },
  resetRowText: {
    color: '#64748b',
    fontSize: 11,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelAction: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelActionText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  saveAction: {
    flex: 1.5,
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveActionText: {
    color: '#090d16',
    fontSize: 13,
    fontWeight: '700',
  },

  /* In-App Update Modal */
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

