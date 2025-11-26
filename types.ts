
export interface Song {
  id: string;
  videoId?: string; // Specific for YouTube/Piped
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  audioUrl: string;
  previewUrl?: string; // Fallback from iTunes
  duration: number; // in seconds
  isLocal?: boolean;
  lyrics?: string;
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
