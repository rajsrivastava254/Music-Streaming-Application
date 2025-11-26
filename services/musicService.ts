
import { Song } from '../types';

// --- API CONFIGURATION ---

// iTunes API (Rock solid reliability for Search & Metadata)
const ITUNES_API = 'https://itunes.apple.com/search';

// Piped Instances (Aggregated list for reliability)
// These proxy YouTube streams. We rotate them to find a working one.
const STREAM_APIS = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.ot.ax',
  'https://pipedapi.drgns.space',
  'https://pa.il.ax',
  'https://pipedapi.system41.com',
  'https://api.piped.privacy.com.de',
  'https://piped-api.lunar.icu',
  'https://ytapi.dc09.ru',
  'https://api.piped.r4fo.com',
  'https://pipedapi.smnz.de',
  'https://api-piped.mha.fi',
  'https://pipedapi.tokhmi.xyz',
  'https://piped-api.garudalinux.org'
];

// Lyrics API
const LYRICS_API = 'https://api.lyrics.ovh/v1';

// --- TYPES ---

interface ItunesResult {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  previewUrl: string; 
  trackTimeMillis: number;
}

// --- HELPERS ---

// Robust fetch with timeout
const fetchWithTimeout = async (url: string, timeout = 5000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

// --- CORE FUNCTIONS ---

/**
 * Search for songs using iTunes API.
 */
export const searchSongs = async (query: string): Promise<Song[]> => {
  if (!query) return getFeaturedSongs();

  try {
    const url = `${ITUNES_API}?term=${encodeURIComponent(query)}&media=music&entity=song&limit=25`;
    const response = await fetchWithTimeout(url);
    
    if (!response.ok) throw new Error("iTunes API Error");
    
    const data = await response.json();
    
    return data.results.map((item: ItunesResult) => ({
      id: String(item.trackId),
      title: item.trackName,
      artist: item.artistName,
      album: item.collectionName,
      coverUrl: item.artworkUrl100.replace('100x100', '600x600'),
      audioUrl: '', // Will be resolved on play
      previewUrl: item.previewUrl, // Reliable backup
      duration: item.trackTimeMillis / 1000,
      isLocal: false
    }));

  } catch (error) {
    console.warn("iTunes Search failed, using fallbacks", error);
    return FALLBACK_SONGS;
  }
};

/**
 * Get Featured/Trending songs.
 */
export const getFeaturedSongs = async (): Promise<Song[]> => {
  const trendingSearches = ['Top Hits 2024', 'Global Top 50', 'Billboard Hot 100', 'Viral Hits', 'Punjabi Hits', 'Lofi Beats', 'Taylor Swift', 'Arijit Singh', 'The Weeknd'];
  const randomQuery = trendingSearches[Math.floor(Math.random() * trendingSearches.length)];
  return searchSongs(randomQuery);
};

/**
 * Resolve the Full Audio Stream URL.
 * Returns null if no full stream is found.
 */
export const getStreamUrl = async (title: string, artist: string): Promise<string | null> => {
  // Clean up title for better search matching (remove "feat.", "Remix", brackets)
  const cleanTitle = title.replace(/\(.*\)/, '').replace(/feat\..*/, '').trim();
  const cleanArtist = artist.split(',')[0].trim(); // Take first artist only
  
  const query = `${cleanTitle} ${cleanArtist} official audio`;
  
  // Randomize instances to distribute load, take top 5 to avoid long wait times
  const instances = [...STREAM_APIS].sort(() => Math.random() - 0.5);

  for (const instance of instances) {
    try {
      // 1. Search for video ID
      const searchUrl = `${instance}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
      const searchRes = await fetchWithTimeout(searchUrl, 4000); 
      if (!searchRes.ok) continue;
      
      const searchData = await searchRes.json();
      const items = searchData.items;
      
      if (!items || items.length === 0) continue;

      // Find first streamable item
      const videoId = items.find((i: any) => i.type === 'stream')?.url.split('/watch?v=')[1];
      if (!videoId) continue;

      // 2. Get Stream URL for that ID
      const streamRes = await fetchWithTimeout(`${instance}/streams/${videoId}`, 4000);
      if (!streamRes.ok) continue;
      
      const streamData = await streamRes.json();
      const audioStreams = streamData.audioStreams;

      if (audioStreams && audioStreams.length > 0) {
        // Broader compatibility: Accept m4a, mp4, AND webm
        // Browsers like Chrome/Android WebView play WebM natively and efficiently
        const bestStream = audioStreams.find((s: any) => s.mimeType.includes('mp4') || s.mimeType.includes('m4a')) 
                         || audioStreams.find((s: any) => s.mimeType.includes('webm'))
                         || audioStreams[0];
                         
        if (bestStream) return bestStream.url;
      }
    } catch (e) {
      // Silent fail, try next instance
      continue;
    }
  }

  return null;
};

/**
 * Fetch Lyrics
 */
export const getLyrics = async (title: string, artist: string): Promise<string | null> => {
  try {
    const cleanTitle = title.replace(/\(.*\)/, '').trim(); 
    const url = `${LYRICS_API}/${encodeURIComponent(artist)}/${encodeURIComponent(cleanTitle)}`;
    
    const res = await fetchWithTimeout(url, 3000);
    const data = await res.json();
    
    return data.lyrics || null;
  } catch (e) {
    return null;
  }
};

// --- FALLBACK DATA ---
const FALLBACK_SONGS: Song[] = [
  {
    id: 'fb1',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    coverUrl: 'https://upload.wikimedia.org/wikipedia/en/e/e6/The_Weeknd_-_Blinding_Lights.png',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 
    duration: 200
  },
  {
    id: 'fb2',
    title: 'Shape of You',
    artist: 'Ed Sheeran',
    album: 'Divide',
    coverUrl: 'https://upload.wikimedia.org/wikipedia/en/4/45/Divide_cover.png',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    duration: 233
  }
];
