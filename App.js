import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  SafeAreaView,
  StatusBar,
  ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Built-in offline fallback catalog embedded directly in the APK bundle.
// Even if the central website / host is completely down, these titles and UI run 100% locally on the phone.
const EMBEDDED_CATALOG = [
  {
    id: 'local_1',
    title: 'Extraction 2',
    year: '2023',
    quality: '4K BDIX',
    genre: 'Action',
    poster: 'https://image.tmdb.org/t/p/w500/7gKI9hpEMcZUwYeCuQmACgit0a2.jpg',
    source: 'BDIX Fast Mirror'
  },
  {
    id: 'local_2',
    title: 'Spider-Man: Across the Spider-Verse',
    year: '2023',
    quality: '1080p HD',
    genre: 'Animation',
    poster: 'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg',
    source: 'CircleFTP BDIX'
  },
  {
    id: 'local_3',
    title: 'Oppenheimer',
    year: '2023',
    quality: '4K UltraHD',
    genre: 'Drama / History',
    poster: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    source: 'SamOnline BDIX'
  },
  {
    id: 'local_4',
    title: 'John Wick: Chapter 4',
    year: '2023',
    quality: '1080p BDIX',
    genre: 'Action / Thriller',
    poster: 'https://image.tmdb.org/t/p/w500/vZloFAK7NKnMGKEslUsZ2b9IpQg.jpg',
    source: 'AmberIT Mirror'
  },
  {
    id: 'local_5',
    title: 'Dune: Part Two',
    year: '2024',
    quality: '4K BDIX',
    genre: 'Sci-Fi / Adventure',
    poster: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
    source: 'ICC FTP Mirror'
  }
];

export default function App() {
  const [movies, setMovies] = useState(EMBEDDED_CATALOG);
  const [searchQuery, setSearchQuery] = useState('');
  const [isServerOnline, setIsServerOnline] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [activeTab, setActiveTab] = useState('home');

  useEffect(() => {
    loadCachedCatalog();
    syncWithServer();
  }, []);

  // 1. Load cached movies from device local storage
  const loadCachedCatalog = async () => {
    try {
      const cached = await AsyncStorage.getItem('@cinema_cached_catalog');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.length > 0) {
          setMovies(parsed);
        }
      }
    } catch (e) {
      console.log('Using embedded catalog');
    }
  };

  // 2. Try to sync with server. If server is down, keep running offline without errors!
  const syncWithServer = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch('http://192.168.100.13:8099/api/featured', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setMovies(data);
          setIsServerOnline(true);
          await AsyncStorage.setItem('@cinema_cached_catalog', JSON.stringify(data));
          return;
        }
      }
    } catch (err) {
      // Server down or offline: seamlessly fallback to local cache
      setIsServerOnline(false);
    }
  };

  const filteredMovies = movies.filter((m) =>
    (m.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#020617" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.appName}>Cinema</Text>
          <View style={styles.bdixBadge}>
            <Text style={styles.bdixBadgeText}>BDIX</Text>
          </View>
        </View>

        {/* Server Status Indicator */}
        <View style={[styles.statusBadge, isServerOnline ? styles.onlineBadge : styles.offlineBadge]}>
          <Text style={styles.statusBadgeText}>
            {isServerOnline ? '● Live Server Connected' : '⚡ Local Offline Mode (Standalone)'}
          </Text>
        </View>
      </View>

      {/* Offline Info Banner if server down */}
      {!isServerOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            হোস্ট সার্ভার বন্ধ থাকলেও অ্যাপটি আপনার ফোনের লোকাল ইঞ্জিন ও ক্যাশে সম্পূর্ণ চালু আছে।
          </Text>
        </View>
      )}

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="মুভি বা সিরিজ খুঁজুন..."
          placeholderTextColor="#64748b"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Movie List */}
      <FlatList
        data={filteredMovies}
        keyExtractor={(item) => String(item.id || item.title)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => setSelectedMovie(item)}
          >
            <Image
              source={{ uri: item.poster || 'https://via.placeholder.com/300x450/0f172a/94a3b8?text=Cinema' }}
              style={styles.poster}
            />
            <View style={styles.cardInfo}>
              <Text style={styles.movieTitle} numberOfLines={1}>{item.title}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.qualityTag}>{item.quality || 'HD'}</Text>
                <Text style={styles.metaText}>{item.year || '2024'}</Text>
                <Text style={styles.metaText}>• {item.genre || 'Action'}</Text>
              </View>
              <Text style={styles.sourceText}>{item.source || 'BDIX Direct'}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Detail Modal / Player Overlay */}
      {selectedMovie && (
        <View style={styles.detailOverlay}>
          <View style={styles.detailBox}>
            <Text style={styles.detailTitle}>{selectedMovie.title}</Text>
            <Text style={styles.detailDesc}>
              সরাসরি আপনার ডিভাইসে প্লে হচ্ছে। সেন্ট্রাল ওয়েবসাইট বা সার্ভার ডাউন থাকলেও BDIX লিংক ও লোকাল ক্যাশ থেকে ভিডিও নিরবচ্ছিন্ন চলবে।
            </Text>
            <TouchableOpacity
              style={styles.playButton}
              onPress={() => alert(`Playing: ${selectedMovie.title}`)}
            >
              <Text style={styles.playButtonText}>▶ Play Now (BDIX Stream)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelectedMovie(null)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b'
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5
  },
  bdixBadge: {
    backgroundColor: '#e11d48',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  bdixBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700'
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999
  },
  onlineBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  offlineBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#34d399'
  },
  offlineBanner: {
    backgroundColor: '#1e1b4b',
    borderBottomWidth: 1,
    borderBottomColor: '#312e81',
    paddingHorizontal: 16,
    paddingVertical: 6
  },
  offlineBannerText: {
    color: '#cbd5e1',
    fontSize: 11,
    textAlign: 'center'
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  searchInput: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 14
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden'
  },
  poster: {
    width: 80,
    height: 115,
    backgroundColor: '#1e293b'
  },
  cardInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center'
  },
  movieTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6
  },
  qualityTag: {
    backgroundColor: 'rgba(225, 29, 72, 0.2)',
    color: '#fb7185',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4
  },
  metaText: {
    color: '#94a3b8',
    fontSize: 11
  },
  sourceText: {
    color: '#64748b',
    fontSize: 11
  },
  detailOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  detailBox: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 20,
    width: '100%'
  },
  detailTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8
  },
  detailDesc: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16
  },
  playButton: {
    backgroundColor: '#e11d48',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10
  },
  playButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14
  },
  closeButton: {
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center'
  },
  closeButtonText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500'
  }
});