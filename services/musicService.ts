
import { Song } from '../types';

// --- AUDIUS API CONFIGURATION ---
// Audius is decentralized. We first need to find a working host.
const AUDIUS_ROOT = 'https://api.audius.co';
const APP_NAME = 'RajMusic_Client';

let cachedHost: string | null = null;

// --- HELPERS ---

// 1. Find a working Audius Host (Gateway)
const getHost = async (): Promise<string> => {
  if (cachedHost) return cachedHost;
  try {
    const response = await fetch(AUDIUS_ROOT);
    const json = await response.json();
    if (json.data && json.data.length > 0) {
      // Pick a random host for better load balancing
      const randomHost = json.data[Math.floor(Math.random() * json.data.length)];
      cachedHost = randomHost;
      return randomHost;
    }
  } catch (e) {
    console.warn("Failed to fetch Audius host, using fallback", e);
  }
  return 'https://discoveryprovider.audius.co'; // Fallback
};

// 2. Generic Fetcher
const fetchJson = async (endpoint: string) => {
  try {
    const host = await getHost();
    const url = `${host}${endpoint}${endpoint.includes('?') ? '&' : '?'}app_name=${APP_NAME}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.warn("Fetch failed:", endpoint, error);
    return null;
  }
};

const mapAudiusSong = (item: any): Song | null => {
  if (!item || !item.id || !item.title) return null;

  try {
      return {
        id: item.id,
        title: item.title,
        artist: item.user?.name || 'Unknown Artist',
        album: item.genre || 'Single',
        // Audius artwork is nested. We try to get the 480x480 version, else 150x150
        coverUrl: item.artwork ? (item.artwork['480x480'] || item.artwork['150x150']) : 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=400&h=400&fit=crop',
        audioUrl: '', // Will be constructed dynamically to avoid expiring links
        duration: item.duration,
        isLocal: false,
        hasLyrics: false
      };
  } catch (e) {
      return null;
  }
};

// --- CORE FUNCTIONS ---

export const searchSongs = async (query: string): Promise<Song[]> => {
  if (!query) return getFeaturedSongs();

  const data = await fetchJson(`/v1/tracks/search?query=${encodeURIComponent(query)}`);
  
  if (data && data.data) {
    return data.data.map(mapAudiusSong).filter((s: Song | null) => s) as Song[];
  }
  
  return [];
};

export const getFeaturedSongs = async (): Promise<Song[]> => {
  try {
    // Get Trending Tracks
    const data = await fetchJson(`/v1/tracks/trending`);
    
    if (data && data.data) {
       return data.data.map(mapAudiusSong).filter((s: Song | null) => s) as Song[];
    }
  } catch (e) {
    console.error("Featured fetch failed", e);
  }
  return FALLBACK_SONGS;
};

// Audius requires a specific stream endpoint construction
export const getStreamUrl = async (songId: string): Promise<string> => {
    const host = await getHost();
    return `${host}/v1/tracks/${songId}/stream?app_name=${APP_NAME}`;
};

export const getLyrics = async (artist: string, title: string): Promise<string | null> => {
    try {
        // Clean up title for better search results (remove parens, feat., etc)
        const cleanTitle = title.replace(/\(.*\)|feat\.|ft\./gi, "").trim();
        const cleanArtist = artist.replace(/\(.*\)|feat\.|ft\./gi, "").trim();
        
        const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`);
        if (!response.ok) return null;
        
        const data = await response.json();
        if (data.lyrics) return data.lyrics;
        return null;
    } catch (e) {
        console.warn("Lyrics fetch failed", e);
        return null;
    }
};

// --- FALLBACK DATA (If offline or API blocks) ---
const FALLBACK_SONGS: Song[] = [
  {
    id: 'local-1',
    title: 'Lost in the City',
    artist: 'Neon Dreams',
    album: 'Cyber Vibes',
    coverUrl: 'https://images.unsplash.com/photo-1496293455970-f8581aae0e3c?w=600&h=600&fit=crop',
    audioUrl: 'https://cdn.pixabay.com/audio/2022/03/10/audio_5a21350a4b.mp3',
    duration: 180,
    isLocal: false
  },
  {
    id: 'local-2',
    title: 'Midnight Drive',
    artist: 'Retro Wave',
    album: 'Synth Collection',
    coverUrl: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=600&h=600&fit=crop',
    audioUrl: 'https://cdn.pixabay.com/audio/2022/03/15/audio_734005273a.mp3',
    duration: 195,
    isLocal: false
  },
  {
    id: 'local-3',
    title: 'Deep Focus',
    artist: 'Mindset',
    album: 'Work Flow',
    coverUrl: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600&h=600&fit=crop',
    audioUrl: 'https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf87a.mp3',
    duration: 210,
    isLocal: false
  }
];
