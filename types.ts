
export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  audioUrl: string; // Direct full stream link
  duration: number; // in seconds
  isLocal?: boolean;
  lyrics?: string;
  hasLyrics?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  coverUrl: string;
  songs: Song[];
}

export type ViewState = 'home' | 'search' | 'library' | 'ai-dj';

export interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
}
