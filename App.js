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
  AppState,
  Alert,
  FlatList,
  Image,
  PermissionsAndroid,
} from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Updates from 'expo-updates';

const { width } = Dimensions.get('window');

const STORAGE_KEY = '@cinema_server_url';
const DEFAULT_SERVER_URL = 'https://cinama.xyz';
const CURRENT_APP_VERSION = '1.0.8';
const OFFLINE_DOWNLOADS_KEY = '@cinema_offline_downloads_v1';
const DOWNLOADS_DIR = `${FileSystem.documentDirectory}downloads/`;
const NOTIF_ASKED_KEY = '@cinema_notif_asked';

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

  // MovieBox-style Offline Downloader & Playback
  const [downloads, setDownloads] = useState([]);
  const [isDownloadsModalVisible, setIsDownloadsModalVisible] = useState(false);
  const [downloadsTab, setDownloadsTab] = useState('completed'); // 'completed' | 'downloading'
  const [storageInfo, setStorageInfo] = useState({ usedMB: '0.0', freeGB: '0.0' });
  const [toastInfo, setToastInfo] = useState(null);

  const webViewRef = useRef(null);
  const canGoBackRef = useRef(false);
  const isUpdatingRef = useRef(false);
  const isDownloadsModalVisibleRef = useRef(false);
  const isWebModalOpenRef = useRef(false);
  const downloadResumableRef = useRef(null);
  const activeTasksRef = useRef({});
  const hasInitialLoadedRef = useRef(false);
  const lastBackPressRef = useRef(0);

  // Animation values for StockWhisk-style updating overlay & Downloader Toast
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const toastAnim = useRef(new Animated.Value(-100)).current;

  // Request POST_NOTIFICATIONS permission on Android 13+ (API 33+) once per install
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const requestNotifPermission = async () => {
      try {
        const alreadyAsked = await AsyncStorage.getItem(NOTIF_ASKED_KEY);
        if (alreadyAsked) return;
        await AsyncStorage.setItem(NOTIF_ASKED_KEY, 'true');
        if (Platform.Version >= 33) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            {
              title: 'Allow Notifications',
              message: 'Cinama would like to send you download and update alerts.',
              buttonPositive: 'Allow',
              buttonNegative: 'Not Now',
            }
          );
        }
      } catch (e) {
        // Non-critical — ignore silently
      }
    };
    const timer = setTimeout(requestNotifPermission, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    canGoBackRef.current = canGoBack;
  }, [canGoBack]);

  useEffect(() => {
    isUpdatingRef.current = isUpdating;
  }, [isUpdating]);

  useEffect(() => {
    isDownloadsModalVisibleRef.current = isDownloadsModalVisible;
  }, [isDownloadsModalVisible]);

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
      setUpdateStatusText('Preparing installer...');
      setUpdateState('installing');

      if (Platform.OS === 'android') {
        const contentUri = await FileSystem.getContentUriAsync(apkFileUri);
        // flags: FLAG_GRANT_READ_URI_PERMISSION (1) | FLAG_ACTIVITY_NEW_TASK (268435456 / 0x10000000)
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 268435457,
          type: 'application/vnd.android.package-archive',
        });
        setUpdateStatusText('System package installer launched. Please confirm.');
        setUpdateState('completed');
      } else {
        await Linking.openURL(apkFileUri);
      }
    } catch (err) {
      console.warn('Install launcher error:', err);
      // Fallback: If IntentLauncher fails or is blocked on this device, open the direct APK URL in browser
      try {
        const downloadPath = (updateInfo && updateInfo.download_url) || '/downloads/cinema.apk';
        const browserUrl = downloadPath.startsWith('http')
          ? downloadPath
          : `${DEFAULT_SERVER_URL.replace(/\/+$/, '')}/${downloadPath.replace(/^\/+/, '')}`;
        await Linking.openURL(browserUrl);
        setUpdateStatusText('Opening direct download link in browser...');
      } catch (linkErr) {
        setUpdateStatusText('Could not launch package installer.');
        setUpdateState('error');
        setDownloadError(err.message || 'Could not open installation dialog');
      }
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
      setUpdateStatusText('New update found, downloading in background...');

      if (isUpdatingRef.current) return;
      isUpdatingRef.current = true;
      const localApkPath = `${FileSystem.cacheDirectory}cinema_update.apk`;

      // Remove any stale cache file before initiating download
      try {
        const fileCheck = await FileSystem.getInfoAsync(localApkPath);
        if (fileCheck.exists) {
          await FileSystem.deleteAsync(localApkPath, { idempotent: true });
        }
      } catch (_) {}

      let result;
      try {
        if (typeof FileSystem.createDownloadResumable === 'function') {
          const downloadResumable = FileSystem.createDownloadResumable(
            apkUrl,
            localApkPath,
            {},
            (downloadProgress) => {
              const written = downloadProgress.totalBytesWritten || 0;
              let total = downloadProgress.totalBytesExpectedToWrite;
              if (!total || total <= 0) {
                total = 70.6 * 1024 * 1024;
              }
              const percent = Math.min(100, Math.max(0, Math.round((written / total) * 100)));
              setUpdateProgress(percent);
              const writtenMB = (written / (1024 * 1024)).toFixed(1);
              const totalMB = (total / (1024 * 1024)).toFixed(1);
              setDownloadedSizeText(`${writtenMB} MB / ${totalMB} MB`);
            }
          );
          downloadResumableRef.current = downloadResumable;
          result = await downloadResumable.downloadAsync();
        } else {
          result = await FileSystem.downloadAsync(apkUrl, localApkPath);
        }
      } catch (dlErr) {
        console.warn('createDownloadResumable failed, trying direct downloadAsync:', dlErr);
        result = await FileSystem.downloadAsync(apkUrl, localApkPath);
      }

      if (result && result.uri) {
        setDownloadedApkUri(result.uri);
        setUpdateProgress(100);
        setUpdateStatusText('Download complete! Ready to install.');
        setUpdateState('completed');
        // Automatically launch package installer dialog
        await triggerInstallApk(result.uri);
      } else {
        throw new Error('Downloaded APK file not found');
      }
    } catch (err) {
      console.warn('Update download error:', err);
      setUpdateState('error');
      setDownloadError(err.message || 'Update download failed');
      setUpdateStatusText('Could not complete update download');
    } finally {
      isUpdatingRef.current = false;
    }
  };

  // Toast feedback helper
  const showToast = useCallback((text, type = 'info') => {
    setToastInfo({ text, type });
    Animated.spring(toastAnim, {
      toValue: 24,
      useNativeDriver: true,
      speed: 14,
      bounciness: 4,
    }).start();

    setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setToastInfo(null));
    }, 3800);
  }, [toastAnim]);

  const sendNotificationStatusToWeb = useCallback((granted) => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(
        `if (typeof window.onNativeNotificationStatus === 'function') window.onNativeNotificationStatus(${granted}); window.dispatchEvent(new CustomEvent('cinema:nativeNotificationStatus', { detail: { granted: ${granted} } })); true;`
      );
    }
  }, []);

  const handleSetNotificationPreference = useCallback(async (enabled) => {
    if (Platform.OS !== 'android') return;
    try {
      if (Platform.Version >= 33) {
        const isGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        if (enabled) {
          if (!isGranted) {
            const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, {
              title: 'Allow Notifications',
              message: 'Cinama would like to send you movie alerts, downloads and updates.',
              buttonPositive: 'Allow',
              buttonNegative: 'Cancel',
            });
            if (res === PermissionsAndroid.RESULTS.GRANTED) {
              showToast('Notifications enabled', 'success');
              sendNotificationStatusToWeb(true);
            } else {
              Alert.alert('Permission Required', 'Notifications are currently disabled for Cinama. Please enable them in device settings.', [
                { text: 'Cancel', style: 'cancel', onPress: () => sendNotificationStatusToWeb(false) },
                { text: 'Open Settings', onPress: () => Linking.openSettings() }
              ]);
              sendNotificationStatusToWeb(false);
            }
          } else {
            showToast('Notifications are active', 'info');
            sendNotificationStatusToWeb(true);
          }
        } else {
          Alert.alert('Disable Notifications', 'To turn off notifications, please disable them in your device App Settings.', [
            { text: 'Cancel', style: 'cancel', onPress: () => sendNotificationStatusToWeb(true) },
            { text: 'Open Settings', onPress: () => { Linking.openSettings(); sendNotificationStatusToWeb(false); } }
          ]);
        }
      } else {
        if (!enabled) {
          Alert.alert('Disable Notifications', 'To turn off notifications, please disable them in your device App Settings.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]);
        } else {
          showToast('Notifications enabled', 'success');
          sendNotificationStatusToWeb(true);
        }
      }
    } catch (e) {
      console.warn('Notification pref error:', e);
    }
  }, [showToast, sendNotificationStatusToWeb]);

  const checkForUpdates = useCallback(async (isManual = false) => {
    // 1. Try Expo Over-The-Air (OTA) Updates first (seamless without prompt)
    if (!__DEV__ && Updates.isEnabled) {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          showToast('Updating Cinama...', 'info');
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
          return;
        }
      } catch (otaErr) {
        console.warn('Expo OTA update check error:', otaErr);
      }
    }

    // 2. Only check for manual APK updates when user explicitly taps "Check for Updates"
    if (!isManual) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(`${DEFAULT_SERVER_URL}/api/app/version`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        showToast('Unable to check for updates', 'error');
        return;
      }

      const data = await response.json();
      const latestVer = data.latest_version || data.version;
      if (latestVer && isNewerVersion(latestVer, CURRENT_APP_VERSION)) {
        Alert.alert(
          'Cinama Update Available',
          `Version v${latestVer} is available with new improvements. Would you like to download it?`,
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Download',
              onPress: () => {
                const downloadPath = data.download_url || '/downloads/cinema.apk';
                const apkUrl = downloadPath.startsWith('http')
                  ? downloadPath
                  : `${DEFAULT_SERVER_URL.replace(/\/+$/, '')}/${downloadPath.replace(/^\/+/, '')}`;
                Linking.openURL(apkUrl).catch(() => {});
              },
            },
          ]
        );
      } else {
        showToast(`You are on the latest version (v${CURRENT_APP_VERSION})`, 'success');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      showToast('Network error while checking updates', 'error');
    }
  }, [showToast]);

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
        // Automatic update check on app launch
        checkForUpdates(false);
      }
    };
    initServerUrl();
  }, [checkForUpdates]);

  // Check for updates and notification permission whenever the app returns to the foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        if (!isUpdatingRef.current) {
          checkForUpdates(false);
        }
        if (Platform.OS === 'android') {
          if (Platform.Version >= 33) {
            PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
              .then((isGranted) => sendNotificationStatusToWeb(isGranted))
              .catch(() => {});
          } else {
            sendNotificationStatusToWeb(true);
          }
        }
      }
    });
    return () => subscription.remove();
  }, [checkForUpdates, sendNotificationStatusToWeb]);

  // Hardware back button support with double-tap exit
  useEffect(() => {
    const onBackPress = () => {
      if (isUpdatingRef.current) {
        // Dismiss updating overlay on back press if completed or error
        setIsUpdating(false);
        return true;
      }
      if (isDownloadsModalVisibleRef.current) {
        setIsDownloadsModalVisible(false);
        return true;
      }
      if (isWebModalOpenRef.current && webViewRef.current) {
        webViewRef.current.injectJavaScript(
          "if (window.history.length > 1) { window.history.back(); } else { window.dispatchEvent(new CustomEvent('cinema:hardwareBack')); } true;"
        );
        return true;
      }
      if (canGoBackRef.current && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }

      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        BackHandler.exitApp();
        return true;
      }
      lastBackPressRef.current = now;
      showToast('Press back again to exit', 'info');
      return true;
    };

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );

    return () => backSubscription.remove();
  }, [showToast]);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    hasInitialLoadedRef.current = false;
    setSessionKey((prev) => prev + 1);
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    handleRetry();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1200);
  }, [handleRetry]);

  // Ensure downloads directory exists
  const ensureDownloadsDirectory = async () => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(DOWNLOADS_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true });
      }
    } catch (e) {
      console.warn('Error creating downloads directory:', e);
    }
  };

  // Calculate downloaded media storage vs free disk space
  const refreshStorageInfo = useCallback(async (currentDownloads) => {
    try {
      let usedBytes = 0;
      const list = currentDownloads || downloads;
      for (const item of list) {
        if (item.status === 'completed' && item.fileSize) {
          usedBytes += item.fileSize;
        }
      }
      let freeBytes = 0;
      try {
        freeBytes = await FileSystem.getFreeDiskStorageAsync();
      } catch (e) {
        freeBytes = 15 * 1024 * 1024 * 1024;
      }
      setStorageInfo({
        usedMB: (usedBytes / (1024 * 1024)).toFixed(1),
        usedGB: (usedBytes / (1024 * 1024 * 1024)).toFixed(2),
        freeGB: (freeBytes / (1024 * 1024 * 1024)).toFixed(1),
      });
    } catch (err) {
      console.warn('Storage calculation error:', err);
    }
  }, [downloads]);

  // Save downloads array to AsyncStorage
  const saveDownloads = useCallback(async (newDownloads) => {
    try {
      setDownloads(newDownloads);
      await AsyncStorage.setItem(OFFLINE_DOWNLOADS_KEY, JSON.stringify(newDownloads));
      refreshStorageInfo(newDownloads);
    } catch (e) {
      console.warn('Error saving downloads to AsyncStorage:', e);
    }
  }, [refreshStorageInfo]);

  // Load offline downloads on mount
  useEffect(() => {
    const initDownloads = async () => {
      try {
        await ensureDownloadsDirectory();
        const stored = await AsyncStorage.getItem(OFFLINE_DOWNLOADS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setDownloads(parsed);
          refreshStorageInfo(parsed);
        }
      } catch (err) {
        console.warn('Failed to load offline downloads:', err);
      }
    };
    initDownloads();
  }, [refreshStorageInfo]);

  // Start offline download with resumable progress tracking
  const startOfflineDownload = useCallback(async (payload) => {
    if (!payload || !payload.url) {
      showToast('Download link is not available', 'error');
      return;
    }

    await ensureDownloadsDirectory();

    const id = payload.id || `dl_${Date.now()}`;
    const safeTitle = (payload.title || 'media').replace(/[^a-zA-Z0-9_\-\.]/g, '_').substring(0, 40);
    const fileUri = payload.fileUri || `${DOWNLOADS_DIR}${safeTitle}_${payload.resolution || 'HD'}_${Date.now()}.mp4`;

    const newItem = {
      id,
      title: payload.title || 'Untitled',
      subtitle: payload.subtitle || null,
      poster: payload.poster || null,
      url: payload.url,
      resolution: payload.resolution || 'HD',
      sizeText: payload.size || 'HD',
      fileUri,
      progress: payload.progress || 0,
      downloadedBytes: payload.downloadedBytes || 0,
      totalBytes: payload.totalBytes || 0,
      speedText: 'Starting...',
      status: 'downloading',
      createdAt: payload.createdAt || Date.now(),
    };

    setDownloads((prev) => {
      const updated = [newItem, ...prev.filter((d) => d.id !== id)];
      AsyncStorage.setItem(OFFLINE_DOWNLOADS_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });

    showToast(`Downloading: ${payload.title} (${payload.resolution || 'HD'})`, 'success');

    let lastBytes = 0;
    let lastTime = Date.now();

    const callback = (downloadProgress) => {
      const totalBytes = downloadProgress.totalBytesExpectedToWrite;
      const writtenBytes = downloadProgress.totalBytesWritten;
      const progress = totalBytes > 0 ? writtenBytes / totalBytes : 0;

      const now = Date.now();
      const timeDiff = (now - lastTime) / 1000;
      if (timeDiff >= 0.5 || writtenBytes === totalBytes) {
        const bytesDiff = writtenBytes - lastBytes;
        const speedBps = timeDiff > 0 ? bytesDiff / timeDiff : 0;
        let speedStr = '';
        if (speedBps > 1024 * 1024) {
          speedStr = `${(speedBps / (1024 * 1024)).toFixed(1)} MB/s`;
        } else if (speedBps > 1024) {
          speedStr = `${(speedBps / 1024).toFixed(0)} KB/s`;
        } else {
          speedStr = `${Math.round(speedBps)} B/s`;
        }

        lastBytes = writtenBytes;
        lastTime = now;

        setDownloads((prevList) =>
          prevList.map((item) => {
            if (item.id === id) {
              return {
                ...item,
                progress,
                downloadedBytes: writtenBytes,
                totalBytes,
                speedText: speedStr,
              };
            }
            return item;
          })
        );
      }
    };

    try {
      const downloadResumable = FileSystem.createDownloadResumable(
        payload.url,
        fileUri,
        {},
        callback
      );
      activeTasksRef.current[id] = downloadResumable;

      const result = await downloadResumable.downloadAsync();
      delete activeTasksRef.current[id];

      if (result && result.uri) {
        const info = await FileSystem.getInfoAsync(result.uri);
        setDownloads((prevList) => {
          const finalDownloads = prevList.map((item) => {
            if (item.id === id) {
              return {
                ...item,
                status: 'completed',
                progress: 1,
                fileSize: info.size || 0,
                speedText: '',
              };
            }
            return item;
          });
          AsyncStorage.setItem(OFFLINE_DOWNLOADS_KEY, JSON.stringify(finalDownloads)).catch(() => {});
          refreshStorageInfo(finalDownloads);
          return finalDownloads;
        });
        showToast(`Finished: ${payload.title} saved offline!`, 'success');
      }
    } catch (err) {
      delete activeTasksRef.current[id];
      console.warn(`Download error for ${id}:`, err);
      setDownloads((prevList) => {
        const errList = prevList.map((item) =>
          item.id === id ? { ...item, status: 'error', speedText: 'Error' } : item
        );
        AsyncStorage.setItem(OFFLINE_DOWNLOADS_KEY, JSON.stringify(errList)).catch(() => {});
        return errList;
      });
      showToast(`Download failed: ${payload.title}`, 'error');
    }
  }, [showToast, refreshStorageInfo]);

  const pauseDownload = useCallback(async (id) => {
    const task = activeTasksRef.current[id];
    if (task) {
      try {
        await task.pauseAsync();
      } catch (e) {
        console.warn('Pause error:', e);
      }
      delete activeTasksRef.current[id];
    }
    setDownloads((prev) => {
      const updated = prev.map((d) => (d.id === id ? { ...d, status: 'paused', speedText: 'Paused' } : d));
      AsyncStorage.setItem(OFFLINE_DOWNLOADS_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const resumeDownload = useCallback(async (id) => {
    const item = downloads.find((d) => d.id === id);
    if (!item) return;

    const existingTask = activeTasksRef.current[id];
    if (existingTask) {
      try {
        await existingTask.resumeAsync();
        setDownloads((prev) =>
          prev.map((d) => (d.id === id ? { ...d, status: 'downloading', speedText: 'Resuming...' } : d))
        );
        return;
      } catch (e) {
        console.warn('Direct resume failed, restarting with same file:', e);
      }
    }

    startOfflineDownload(item);
  }, [downloads, startOfflineDownload]);

  const cancelDownload = useCallback(async (id) => {
    const task = activeTasksRef.current[id];
    if (task) {
      try {
        await task.pauseAsync();
      } catch (e) {}
      delete activeTasksRef.current[id];
    }
    const item = downloads.find((d) => d.id === id);
    if (item && item.fileUri) {
      try {
        await FileSystem.deleteAsync(item.fileUri, { idempotent: true });
      } catch (e) {}
    }
    setDownloads((prev) => {
      const updated = prev.filter((d) => d.id !== id);
      AsyncStorage.setItem(OFFLINE_DOWNLOADS_KEY, JSON.stringify(updated)).catch(() => {});
      refreshStorageInfo(updated);
      return updated;
    });
    showToast('Download cancelled', 'info');
  }, [downloads, showToast, refreshStorageInfo]);

  const deleteDownload = useCallback((id) => {
    const item = downloads.find((d) => d.id === id);
    if (!item) return;

    Alert.alert(
      'Delete Download',
      `Delete "${item.title}" from offline storage?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (item.fileUri) {
              try {
                await FileSystem.deleteAsync(item.fileUri, { idempotent: true });
              } catch (err) {
                console.warn('File delete error:', err);
              }
            }
            setDownloads((prev) => {
              const updated = prev.filter((d) => d.id !== id);
              AsyncStorage.setItem(OFFLINE_DOWNLOADS_KEY, JSON.stringify(updated)).catch(() => {});
              refreshStorageInfo(updated);
              return updated;
            });
            showToast(`Deleted "${item.title}"`, 'info');
          },
        },
      ]
    );
  }, [downloads, showToast, refreshStorageInfo]);

  const playOfflineVideo = useCallback(async (item) => {
    if (!item || !item.fileUri) {
      Alert.alert('Error', 'Video file path is invalid.');
      return;
    }
    try {
      const fileInfo = await FileSystem.getInfoAsync(item.fileUri);
      if (!fileInfo.exists) {
        Alert.alert('File Not Found', 'This video file was removed or moved.');
        return;
      }
      const contentUri = await FileSystem.getContentUriAsync(item.fileUri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: 'video/*',
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
    } catch (err) {
      console.warn('Playback launch error:', err);
      Alert.alert(
        'Player Needed',
        'Please ensure you have a media player installed (such as VLC, MX Player, or Google Photos) to play downloaded videos.'
      );
    }
  }, []);

  const handleWebViewError = (syntheticEvent) => {
    console.warn('WebView error occurred:', syntheticEvent.nativeEvent);
    setHasError(true);
    setIsLoading(false);
  };

  const handleHttpError = (syntheticEvent) => {
    const { statusCode, url } = syntheticEvent.nativeEvent;
    // Sub-resources like 404 images, posters, favicon, subtitle files should NOT crash the app
    const isMainDoc = !url || url === serverUrl || url === `${serverUrl}/` || url.startsWith(`${serverUrl}/?`) || url.startsWith(`${serverUrl}/#`);
    if (statusCode >= 400 && isMainDoc) {
      console.warn('WebView Main Document HTTP error:', statusCode, url);
      setHasError(true);
      setIsLoading(false);
    } else {
      console.warn('WebView Subresource HTTP error (ignored):', statusCode, url);
    }
  };

  // Bidirectional communication with web player for auto horizontal orientation & offline downloads
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
      } else if (msg && msg.type === 'MODAL_STATE') {
        isWebModalOpenRef.current = !!msg.isOpen;
      } else if (msg && msg.type === 'START_OFFLINE_DOWNLOAD') {
        startOfflineDownload(msg.payload);
      } else if (msg && msg.type === 'OPEN_DOWNLOADS') {
        setIsDownloadsModalVisible(true);
        setDownloadsTab('completed');
      } else if (msg && msg.type === 'START_APP_UPDATE') {
        const info = msg.payload || updateInfo;
        const downloadPath = (info && info.download_url) || '/downloads/cinema.apk';
        const browserUrl = downloadPath.startsWith('http')
          ? downloadPath
          : `${DEFAULT_SERVER_URL.replace(/\/+$/, '')}/${downloadPath.replace(/^\/+/, '')}`;
        Linking.openURL(browserUrl).catch(() => {});
      } else if (msg && msg.type === 'CHECK_FOR_UPDATES') {
        checkForUpdates(true);
      } else if (msg && msg.type === 'SET_NOTIFICATION_PREFERENCE') {
        handleSetNotificationPreference(Boolean(msg.enabled));
      } else if (msg && msg.type === 'CHECK_NOTIFICATION_PERMISSION') {
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
            .then((granted) => sendNotificationStatusToWeb(granted))
            .catch(() => sendNotificationStatusToWeb(false));
        } else {
          sendNotificationStatusToWeb(true);
        }
      } else if (msg && msg.type === 'OPEN_APP_SETTINGS') {
        Linking.openSettings().catch(() => {});
      }
    } catch (err) {
      console.warn('WebView message error:', err);
    }
  }, [startOfflineDownload, startDownload, updateInfo, checkForUpdates, handleSetNotificationPreference, sendNotificationStatusToWeb]);

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
          <Text style={styles.splashBrand}>CINAMA</Text>
        </View>
        <ActivityIndicator size="small" color="#38bdf8" style={styles.splashSpinner} />
      </View>
    );
  }

  const completedList = downloads.filter((d) => d.status === 'completed');
  const downloadingList = downloads.filter((d) => d.status === 'downloading' || d.status === 'paused');
  const completedDownloadsCount = completedList.length;

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
          applicationNameForUserAgent="CinamaApp/1.0.5"
          setSupportMultipleWindows={false}
          injectedJavaScriptBeforeContentLoaded={`
            window.isCinamaNativeApp = true;
            window.isCinemaNativeApp = true;
            window.isCinamaApp = true;
            window.isCinemaApp = true;
            window.CINAMA_APP_VERSION = '${CURRENT_APP_VERSION}';
            window.CINEMA_APP_VERSION = '${CURRENT_APP_VERSION}';
            true;
          `}
          injectedJavaScript={`
            (function() {
              try {
                window.isCinemaNativeApp = true;
                window.isCinemaApp = true;
                window.CINEMA_APP_VERSION = '${CURRENT_APP_VERSION}';
                const hideCss = '[data-app-hide="true"], button[aria-label*="APK"], button[title*="APK"] { display: none !important; }';
                const style = document.createElement('style');
                style.type = 'text/css';
                style.appendChild(document.createTextNode(hideCss));
                (document.head || document.documentElement).appendChild(style);

                // Global capture-phase download interceptor: NEVER let clicks redirect to browser
                document.addEventListener('click', function(e) {
                  var target = e.target && e.target.closest ? e.target.closest('a') : null;
                  if (!target) return;
                  var href = target.getAttribute('href') || '';
                  var isDownload = target.hasAttribute('download') || href.includes('/downloads/') || /\\.(mp4|mkv|avi|mov|webm)(\\?.*)?$/i.test(href);
                  if (isDownload) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'START_OFFLINE_DOWNLOAD',
                        payload: {
                          url: target.href || href,
                          title: target.getAttribute('download') || target.innerText || 'Movie Media',
                          resolution: 'HD'
                        }
                      }));
                    }
                  }
                }, true);
              } catch(e) {}
            })();
            true;
          `}
          allowsBackForwardNavigationGestures={true}
          pullToRefreshEnabled={true}
          allowsFullscreenVideo={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          cacheEnabled={true}
          cacheMode="LOAD_DEFAULT"
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          mixedContentMode="always"
          originWhitelist={['*']}
          onShouldStartLoadWithRequest={(request) => {
            const url = request.url;
            if (!url) return false;

            // Handle custom schemes or intents safely
            if (url.startsWith('tel:') || url.startsWith('mailto:') || url.startsWith('intent:')) {
              Linking.openURL(url).catch(() => {});
              return false;
            }

            // Direct file download links triggered via browser navigation
            if (url.includes('/downloads/') && url.endsWith('.apk')) {
              return true;
            }

            // Allow all http and https requests (covers app server, CDNs, BDIX mirrors, embeds, streams)
            if (url.startsWith('http://') || url.startsWith('https://')) {
              return true;
            }

            return false;
          }}
          onMessage={handleWebViewMessage}
          onContentProcessDidTerminate={handleContentProcessDidTerminate}
          onNavigationStateChange={(navState) => {
            setCanGoBack(navState.canGoBack);
          }}
          onLoadStart={() => {
            if (!hasInitialLoadedRef.current && !isRefreshing) {
              setIsLoading(true);
            }
          }}
          onLoadEnd={() => {
            hasInitialLoadedRef.current = true;
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
                <Text style={styles.brandTitle}>CINAMA</Text>
              </View>
              <View style={styles.badgeContainer}>
                <Text style={styles.badgeText}>STREAMING CLIENT</Text>
              </View>
            </View>

            <ActivityIndicator size="large" color="#38bdf8" style={styles.loader} />
            <Text style={styles.loadingCaption}>Loading Cinama...</Text>
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
              <Text style={styles.errorSubtext}>
                No internet connection or server unreachable.
              </Text>

              <View style={styles.offlineActionsWrapper}>
                <TouchableOpacity
                  style={styles.retryButton}
                  activeOpacity={0.85}
                  onPress={handleRetry}
                >
                  <Feather name="refresh-cw" size={16} color="#090d16" style={{ marginRight: 8 }} />
                  <Text style={styles.retryButtonText}>Retry Connection</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.offlineLibraryButton}
                  activeOpacity={0.85}
                  onPress={() => {
                    setIsDownloadsModalVisible(true);
                    setDownloadsTab('completed');
                  }}
                >
                  <Feather name="film" size={16} color="#38bdf8" style={{ marginRight: 8 }} />
                  <Text style={styles.offlineLibraryButtonText}>
                    Watch Offline Downloads ({completedDownloadsCount})
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        )}
      </View>

      {/* Offline Downloader Top Toast Banner */}
      {toastInfo && (
        <Animated.View
          style={[
            styles.toastContainer,
            { transform: [{ translateY: toastAnim }] },
            toastInfo.type === 'error' && styles.toastError,
            toastInfo.type === 'success' && styles.toastSuccess,
          ]}
        >
          <Feather
            name={toastInfo.type === 'error' ? 'alert-circle' : toastInfo.type === 'success' ? 'check-circle' : 'info'}
            size={18}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.toastText} numberOfLines={2}>
            {toastInfo.text}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setIsDownloadsModalVisible(true);
              setToastInfo(null);
            }}
            style={styles.toastActionBtn}
          >
            <Text style={styles.toastActionText}>VIEW</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

            {/* MovieBox-style Offline Downloads Modal */}
      <Modal
        visible={isDownloadsModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsDownloadsModalVisible(false)}
      >
        <SafeAreaView style={styles.dlModalContainer}>
          <StatusBar barStyle="light-content" translucent={false} backgroundColor="#070a13" />

          {/* Modal Header */}
          <View style={styles.dlHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="download" size={20} color="#38bdf8" />
                <Text style={styles.dlHeaderTitle}>Offline Downloads</Text>
              </View>
              <Text style={styles.dlHeaderSubtitle}>Watch your movies & series without internet</Text>
            </View>
            <TouchableOpacity
              style={styles.dlCloseBtn}
              onPress={() => setIsDownloadsModalVisible(false)}
              activeOpacity={0.7}
            >
              <Feather name="x" size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Storage Meter Bar */}
          <View style={styles.storageCard}>
            <View style={styles.storageInfoRow}>
              <View style={styles.storageLabelGroup}>
                <Feather name="hard-drive" size={13} color="#38bdf8" />
                <Text style={styles.storageLabel}>Device Storage</Text>
              </View>
              <Text style={styles.storageValues}>
                Cinama: <Text style={{ color: '#38bdf8', fontWeight: 'bold' }}>{storageInfo.usedMB} MB</Text> • Free: {storageInfo.freeGB} GB
              </Text>
            </View>
            <View style={styles.storageTrack}>
              <View
                style={[
                  styles.storageBar,
                  { width: `${Math.min(100, Math.max(3, (parseFloat(storageInfo.usedMB || '0') / (parseFloat(storageInfo.freeGB || '10') * 1024 + 1)) * 100))}%` },
                ]}
              />
            </View>
          </View>

          {/* Segmented Tabs */}
          <View style={styles.dlTabsRow}>
            <TouchableOpacity
              style={[styles.dlTab, downloadsTab === 'completed' && styles.dlTabActive]}
              onPress={() => setDownloadsTab('completed')}
              activeOpacity={0.8}
            >
              <Feather
                name="check-circle"
                size={15}
                color={downloadsTab === 'completed' ? '#38bdf8' : '#64748b'}
              />
              <Text style={[styles.dlTabText, downloadsTab === 'completed' && styles.dlTabTextActive]}>
                Downloaded ({completedList.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dlTab, downloadsTab === 'downloading' && styles.dlTabActive]}
              onPress={() => setDownloadsTab('downloading')}
              activeOpacity={0.8}
            >
              <Feather
                name="arrow-down-circle"
                size={15}
                color={downloadsTab === 'downloading' ? '#38bdf8' : '#64748b'}
              />
              <Text style={[styles.dlTabText, downloadsTab === 'downloading' && styles.dlTabTextActive]}>
                Downloading ({downloadingList.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content */}
          {downloadsTab === 'completed' ? (
            completedList.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="film" size={36} color="#475569" />
                </View>
                <Text style={styles.emptyTitle}>No Downloaded Media</Text>
                <Text style={styles.emptySubtitle}>
                  Download movies and series to watch offline on flights, journeys, or when internet is slow.
                </Text>
              </View>
            ) : (
              <FlatList
                data={completedList}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <View style={styles.dlCard}>
                    {item.poster ? (
                      <Image source={{ uri: item.poster }} style={styles.dlPoster} />
                    ) : (
                      <View style={[styles.dlPoster, styles.dlPosterPlaceholder]}>
                        <Feather name="film" size={24} color="#64748b" />
                      </View>
                    )}
                    <View style={styles.dlCardInfo}>
                      <Text style={styles.dlCardTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {item.subtitle ? (
                        <Text style={styles.dlCardSubtitle} numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                      ) : null}
                      <View style={styles.dlBadgesRow}>
                        <View style={styles.dlQualityBadge}>
                          <Text style={styles.dlQualityText}>{item.resolution}</Text>
                        </View>
                        {item.fileSize ? (
                          <Text style={styles.dlSizeText}>
                            {(item.fileSize / (1024 * 1024)).toFixed(1)} MB
                          </Text>
                        ) : null}
                      </View>

                      <View style={styles.dlActionsRow}>
                        <TouchableOpacity
                          style={styles.playOfflineBtn}
                          onPress={() => playOfflineVideo(item)}
                          activeOpacity={0.8}
                        >
                          <Feather name="play" size={13} color="#090d16" style={{ marginRight: 4 }} />
                          <Text style={styles.playOfflineBtnText}>PLAY</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.deleteDlBtn}
                          onPress={() => deleteDownload(item.id)}
                          activeOpacity={0.7}
                        >
                          <Feather name="trash-2" size={15} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              />
            )
          ) : (
            downloadingList.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="download-cloud" size={36} color="#475569" />
                </View>
                <Text style={styles.emptyTitle}>No Active Downloads</Text>
                <Text style={styles.emptySubtitle}>
                  Choose any movie or series and tap Download to save for offline viewing.
                </Text>
              </View>
            ) : (
              <FlatList
                data={downloadingList}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const percent = Math.round((item.progress || 0) * 100);
                  const isPaused = item.status === 'paused';
                  return (
                    <View style={styles.dlCard}>
                      <View style={styles.dlCardInfo}>
                        <View style={styles.dlDownloadingHeader}>
                          <Text style={styles.dlCardTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <View style={styles.dlQualityBadge}>
                            <Text style={styles.dlQualityText}>{item.resolution}</Text>
                          </View>
                        </View>

                        {/* Progress Bar */}
                        <View style={styles.progressBarTrack}>
                          <View
                            style={[
                              styles.progressBarFill,
                              { width: `${Math.max(2, Math.min(100, percent))}%` },
                              isPaused && { backgroundColor: '#eab308' },
                            ]}
                          />
                        </View>

                        {/* Progress Meta */}
                        <View style={styles.progressMetaRow}>
                          <Text style={styles.progressPercentText}>{percent}%</Text>
                          <Text style={styles.progressSpeedText}>
                            {isPaused ? 'Paused' : item.speedText || 'Downloading...'}
                          </Text>
                        </View>

                        {/* Controls */}
                        <View style={styles.dlControlsRow}>
                          <TouchableOpacity
                            style={styles.controlPillBtn}
                            onPress={() => (isPaused ? resumeDownload(item.id) : pauseDownload(item.id))}
                            activeOpacity={0.8}
                          >
                            <Feather name={isPaused ? 'play' : 'pause'} size={13} color="#38bdf8" />
                            <Text style={styles.controlPillText}>{isPaused ? 'Resume' : 'Pause'}</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.controlPillBtn, { borderColor: '#ef444440' }]}
                            onPress={() => cancelDownload(item.id)}
                            activeOpacity={0.8}
                          >
                            <Feather name="x" size={13} color="#ef4444" />
                            <Text style={[styles.controlPillText, { color: '#ef4444' }]}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                }}
              />
            )
          )}
        </SafeAreaView>
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

  /* Floating Background Update Toast / Banner */
  floatingUpdateBanner: {
    position: 'absolute',
    bottom: 60,
    left: 14,
    right: 14,
    zIndex: 999999,
  },
  floatingUpdateCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  floatingUpdateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  floatingUpdateIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingUpdateTextBox: {
    flex: 1,
  },
  floatingUpdateTitle: {
    color: '#f8fafc',
    fontSize: 12.5,
    fontWeight: '700',
  },
  floatingUpdateSubtext: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 1,
  },
  floatingActionBtn: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  floatingActionBtnText: {
    color: '#090d16',
    fontSize: 12,
    fontWeight: '700',
  },
  floatingCloseBtn: {
    padding: 5,
    marginLeft: 2,
  },
  floatingProgressTrack: {
    width: '100%',
    height: 3,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  floatingProgressBar: {
    height: '100%',
    borderRadius: 2,
  },

  /* Offline Downloads & Player Styles */
  offlineActionsWrapper: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  offlineLibraryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#0284c7',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#0284c7',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  offlineLibraryButtonText: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '700',
  },
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 36 : 50,
    left: 16,
    right: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 999,
  },
  toastError: {
    borderColor: '#ef444460',
    backgroundColor: '#1c1917',
  },
  toastSuccess: {
    borderColor: '#10b98160',
    backgroundColor: '#06281e',
  },
  toastText: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '500',
  },
  toastActionBtn: {
    marginLeft: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#38bdf820',
    borderRadius: 6,
  },
  toastActionText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  dlModalContainer: {
    flex: 1,
    backgroundColor: '#070a13',
  },
  dlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  dlHeaderTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  dlHeaderSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  dlCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  storageCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  storageInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  storageLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  storageLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  storageValues: {
    color: '#64748b',
    fontSize: 11,
  },
  storageTrack: {
    height: 4,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
  },
  storageBar: {
    height: 4,
    backgroundColor: '#38bdf8',
    borderRadius: 2,
  },
  dlTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  dlTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  dlTabActive: {
    borderColor: '#0284c7',
    backgroundColor: '#0284c715',
  },
  dlTabText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  dlTabTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  dlCard: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 12,
  },
  dlPoster: {
    width: 64,
    height: 90,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  dlPosterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dlCardInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  dlCardTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  dlCardSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    marginBottom: 6,
  },
  dlBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  dlQualityBadge: {
    backgroundColor: '#10b98120',
    borderColor: '#10b98140',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dlQualityText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: 'bold',
  },
  dlSizeText: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  dlActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playOfflineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#38bdf8',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  playOfflineBtnText: {
    color: '#090d16',
    fontSize: 12,
    fontWeight: '800',
  },
  deleteDlBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#ef444415',
  },
  dlDownloadingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#1e293b',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: 6,
    backgroundColor: '#38bdf8',
    borderRadius: 3,
  },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressPercentText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  progressSpeedText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  dlControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#38bdf840',
    backgroundColor: '#0284c715',
  },
  controlPillText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 60,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
});
