
import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, 
  Search, 
  Library, 
  Sparkles, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  ChevronDown, 
  Heart, 
  Repeat, 
  Shuffle, 
  Mic2,
  Music,
  Upload,
  Loader2,
  AlertCircle,
  ListMusic,
  Activity
} from 'lucide-react';
import { App as CapacitorApp } from '@capacitor/app';

import { Song, ViewState } from './types';
import { getFeaturedSongs, searchSongs, getStreamUrl, getLyrics } from './services/musicService';
import { getAIRecommendations } from './services/geminiService';
import SongList from './components/SongList';
import Equalizer from './components/Equalizer';

// Helper for formatting time
const formatTime = (time: number) => {
  if (isNaN(time)) return "0:00";
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

// --- NEON LOGO COMPONENT ---
const Logo = ({ size = 'normal' }: { size?: 'normal' | 'large' }) => (
  <div className={`relative flex flex-col items-center justify-center ${size === 'large' ? 'gap-6' : 'gap-2'}`}>
    <div className={`relative flex items-center justify-center ${size === 'large' ? 'w-40 h-40' : 'w-10 h-10'}`}>
        {/* Outer Glow Circle */}
        <div className={`absolute inset-0 rounded-full border-2 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.6)] ${size === 'large' ? 'animate-pulse' : ''}`}></div>
        <div className={`absolute inset-1 rounded-full border border-purple-500 opacity-70`}></div>
        
        {/* The R */}
        <span className={`font-black italic bg-clip-text text-transparent bg-gradient-to-br from-cyan-300 to-purple-500 drop-shadow-[0_0_5px_rgba(168,85,247,0.8)] ${size === 'large' ? 'text-8xl' : 'text-2xl'}`}>
        R
        </span>
        
        {/* Crown SVG */}
        <div className={`absolute -top-[30%] left-1/2 -translate-x-1/2 text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)] ${size === 'large' ? 'scale-[2.5] mb-4' : 'scale-75'}`}>
            <svg width="24" height="16" viewBox="0 0 24 16" fill="currentColor">
                <path d="M2 14h20v2H2zM2 11l6-9 4 6 4-6 6 9H2z"/>
            </svg>
        </div>
    </div>
    
    {size === 'large' && (
         <span className="text-4xl font-bold tracking-[0.2em] bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500 uppercase drop-shadow-md">
            RajMusic
         </span>
    )}
  </div>
);

type PlayerViewMode = 'art' | 'lyrics' | 'eq';

const App: React.FC = () => {
  // --- STATE ---
  const [showSplash, setShowSplash] = useState(true);
  const [view, setView] = useState<ViewState>('home');
  const [songs, setSongs] = useState<Song[]>([]);
  const [librarySongs, setLibrarySongs] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlayerFull, setIsPlayerFull] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isContentLoading, setIsContentLoading] = useState(true);
  const [showQueue, setShowQueue] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [playerMode, setPlayerMode] = useState<PlayerViewMode>('art');
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  
  // --- REFS ---
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastBackPress = useRef(0);

  // --- EFFECTS ---

  // Splash Screen & Initial Load
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 3000);

    const loadData = async () => {
      setIsContentLoading(true);
      const data = await getFeaturedSongs();
      setSongs(data);
      setIsContentLoading(false);
    };
    loadData();

    return () => clearTimeout(timer);
  }, []);

  // Back Button Logic
  useEffect(() => {
    const setupBackButton = async () => {
      try {
        await CapacitorApp.addListener('backButton', () => {
           if (isPlayerFull) {
               setIsPlayerFull(false);
           } else if (view !== 'home') {
               setView('home');
           } else {
               const now = Date.now();
               if (now - lastBackPress.current < 2000) {
                   CapacitorApp.exitApp();
               } else {
                   lastBackPress.current = now;
                   setShowToast(true);
                   setTimeout(() => setShowToast(false), 2000);
               }
           }
        });
      } catch (e) {
          // Web fallback
      }
    };
    setupBackButton();
  }, [isPlayerFull, view]);

  // Audio Events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => handleNext();
    const onError = (e: any) => {
        console.log("Audio Error, trying next", e);
        if (isPlaying) { 
            setTimeout(() => handleNext(), 1000); 
        }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [songs, currentSong]);

  // Auto-Resolve Audio URL
  useEffect(() => {
      if (currentSong && !currentSong.isLocal && !currentSong.audioUrl) {
          let cancelled = false;
          getStreamUrl(currentSong.id).then(url => {
              if (cancelled) return;
              setCurrentSong(prev => prev && prev.id === currentSong.id ? { ...prev, audioUrl: url } : prev);
          });
          return () => { cancelled = true; };
      }
  }, [currentSong]);

  // Sync Play State to Audio Element
  useEffect(() => {
    if (currentSong && audioRef.current && currentSong.audioUrl) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.warn("Autoplay blocked", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentSong?.audioUrl]);

  // --- MEDIA SESSION API (Notification & Lock Screen Controls) ---
  
  // 1. Update Metadata & Action Handlers
  useEffect(() => {
    if ('mediaSession' in navigator && currentSong) {
      // Update metadata (Title, Artist, Artwork)
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist,
        album: currentSong.album,
        artwork: [
          { src: currentSong.coverUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: currentSong.coverUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: currentSong.coverUrl, sizes: '192x192', type: 'image/jpeg' },
          { src: currentSong.coverUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: currentSong.coverUrl, sizes: '384x384', type: 'image/jpeg' },
          { src: currentSong.coverUrl, sizes: '512x512', type: 'image/jpeg' },
        ]
      });

      // Basic Controls
      navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
      navigator.mediaSession.setActionHandler('stop', () => {
          setIsPlaying(false);
          if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
          }
      });
      navigator.mediaSession.setActionHandler('previoustrack', handlePrev);
      navigator.mediaSession.setActionHandler('nexttrack', handleNext);
      
      // Seeking Controls
      navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined && audioRef.current) {
              audioRef.current.currentTime = details.seekTime;
              setCurrentTime(details.seekTime);
          }
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
          const skipTime = details.seekOffset || 10;
          if (audioRef.current) {
              audioRef.current.currentTime = Math.max(audioRef.current.currentTime - skipTime, 0);
              setCurrentTime(audioRef.current.currentTime);
          }
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
          const skipTime = details.seekOffset || 10;
          if (audioRef.current) {
              audioRef.current.currentTime = Math.min(audioRef.current.currentTime + skipTime, audioRef.current.duration || 0);
              setCurrentTime(audioRef.current.currentTime);
          }
      });
    }
  }, [currentSong]); // Re-attach when song changes

  // 2. Update Playback State
  useEffect(() => {
      if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      }
  }, [isPlaying]);

  // 3. Update Position State (Lock Screen Progress Bar)
  useEffect(() => {
      if ('mediaSession' in navigator && !isNaN(duration) && duration > 0 && !isNaN(currentTime)) {
          try {
              navigator.mediaSession.setPositionState({
                  duration: duration,
                  playbackRate: 1,
                  position: currentTime
              });
          } catch (e) {
              // Ignore invalid timestamp errors
          }
      }
  }, [currentTime, duration]);


  // Fetch Lyrics on Song Change
  useEffect(() => {
      const fetchLyrics = async () => {
          if (!currentSong) return;
          setLyricsText(null);
          
          if (currentSong.lyrics) {
              setLyricsText(currentSong.lyrics);
              return;
          }

          if (currentSong.isLocal) {
              setLyricsText("Local audio file. Lyrics not available.");
              return;
          }

          setLoadingLyrics(true);
          const fetched = await getLyrics(currentSong.artist, currentSong.title);
          setLyricsText(fetched || "Lyrics not found for this song.");
          setLoadingLyrics(false);
      };

      fetchLyrics();
  }, [currentSong]);

  // --- HANDLERS ---

  const handlePlaySong = async (song: Song | null | undefined, contextSongs?: Song[]) => {
    if (!song || !song.id) return;
    
    // Optimistic Update
    if (contextSongs && contextSongs !== songs) setSongs(contextSongs);
    if (currentSong?.id === song.id) {
        setIsPlaying(!isPlaying);
        return;
    }

    // Set song immediately (useEffect will resolve URL)
    setCurrentSong(song);
    setIsPlaying(true);
    setPlayerMode('art'); 
  };

  const handleAddToQueue = (song: Song) => {
    setSongs(prev => [...prev, song]);
  };

  const handleImportMusic = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const newLocalSongs: Song[] = Array.from(e.target.files).map((file: File, index) => ({
            id: `local-${Date.now()}-${index}`,
            title: file.name.replace(/\.[^/.]+$/, ""),
            artist: 'Local Device',
            album: 'My Imports',
            coverUrl: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=400&h=400&fit=crop',
            audioUrl: URL.createObjectURL(file),
            duration: 0,
            isLocal: true
        }));

        setLibrarySongs(prev => [...prev, ...newLocalSongs]);
        setSongs(prev => [...prev, ...newLocalSongs]);
        setView('library');
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  // Simplified Handlers for Next/Prev
  const handleNext = () => {
    setSongs(prevSongs => {
        setCurrentSong(curr => {
            if (!curr || prevSongs.length === 0) return curr;
            const currentIndex = prevSongs.findIndex(s => s.id === curr.id);
            const safeIndex = currentIndex === -1 ? 0 : currentIndex;
            const nextIndex = (safeIndex + 1) % prevSongs.length;
            return prevSongs[nextIndex];
        });
        return prevSongs;
    });
    setIsPlaying(true);
  };

  const handlePrev = () => {
     setSongs(prevSongs => {
        setCurrentSong(curr => {
            if (!curr || prevSongs.length === 0) return curr;
            const currentIndex = prevSongs.findIndex(s => s.id === curr.id);
            const safeIndex = currentIndex === -1 ? 0 : currentIndex;
            const prevIndex = (safeIndex - 1 + prevSongs.length) % prevSongs.length;
            return prevSongs[prevIndex];
        });
        return prevSongs;
    });
    setIsPlaying(true);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsContentLoading(true);
    setView('home'); 
    const results = await searchSongs(searchQuery);
    setSongs(results);
    setIsContentLoading(false);
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt) return;
    setIsAiLoading(true);
    const suggestedTitles = await getAIRecommendations(aiPrompt);
    const newPlaylist: Song[] = [];
    const promises = suggestedTitles.slice(0, 5).map(title => searchSongs(title));
    const results = await Promise.all(promises);
    results.forEach(resList => {
        if (resList.length > 0) newPlaylist.push(resList[0]);
    });
    
    if (newPlaylist.length > 0) {
        setSongs(newPlaylist);
        setAiPrompt('');
        setView('home');
        handlePlaySong(newPlaylist[0], newPlaylist);
    } else {
        alert("AI suggestion not found in library. Playing trending hits.");
        setSongs(await getFeaturedSongs());
        setView('home');
    }
    setIsAiLoading(false);
  };

  // --- RENDER ---

  if (showSplash) {
      return (
          <div className="fixed inset-0 z-[200] bg-[#050505] flex items-center justify-center animate-fadeOut">
              <Logo size="large" />
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden font-sans selection:bg-cyan-500/30">
      {/* Audio Element */}
      <audio 
        ref={audioRef} 
        src={currentSong?.audioUrl} 
        crossOrigin="anonymous" 
        preload="auto"
        autoPlay={isPlaying}
      />

      {/* Back Button Toast */}
      <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md border border-white/10 px-6 py-2 rounded-full z-[150] transition-opacity duration-300 ${showToast ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <span className="text-sm font-medium">Press back again to exit</span>
      </div>

      <main className="h-screen overflow-y-auto no-scrollbar pb-32">
        {view === 'home' && (
          <div className="p-4 pt-6">
             <div className="flex justify-between items-center mb-6">
                 {/* Clickable Logo redirects to Home/Refresh */}
                 <div className="flex items-center gap-2 cursor-pointer active:scale-95 transition-transform" onClick={() => setView('home')}>
                    <Logo size="normal" />
                    <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500">RajMusic</span>
                 </div>
                 <button className="p-2 bg-white/10 rounded-full hover:bg-white/20" onClick={() => setView('search')}>
                     <Search size={20} />
                 </button>
             </div>
             <h1 className="text-xl font-bold mb-4 text-white">
              {searchQuery ? `Results for "${searchQuery}"` : "Trending Now"}
            </h1>
            {isContentLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-4">
                    <Loader2 className="animate-spin text-cyan-500" size={40} />
                </div>
            ) : songs.length > 0 ? (
                <SongList 
                    songs={songs} 
                    onPlay={(s) => handlePlaySong(s, songs)} 
                    currentSongId={currentSong?.id} 
                    isPlaying={isPlaying}
                    onAddToQueue={handleAddToQueue}
                />
            ) : (
                <div className="text-center py-20 text-gray-500">
                    <AlertCircle size={40} className="mx-auto mb-2 opacity-50"/>
                    <p>No songs found.</p>
                </div>
            )}
          </div>
        )}

        {view === 'search' && (
          <div className="p-4 pt-8">
            <h1 className="text-3xl font-bold mb-6">Search</h1>
            <form onSubmit={handleSearch} className="mb-8 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search songs..."
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-full py-4 pl-12 pr-6 focus:border-cyan-500 outline-none"
                autoFocus
              />
            </form>
            <div className="flex flex-wrap gap-2">
                {['Lo-Fi', 'Remix', 'Bass Boosted', 'Synthwave', 'Hip Hop', 'Gaming'].map(tag => (
                    <button key={tag} onClick={() => { setSearchQuery(tag); handleSearch({ preventDefault: () => {} } as any); }} className="bg-gray-800 border border-white/10 px-4 py-2 rounded-full text-xs hover:border-cyan-500/50">
                        {tag}
                    </button>
                ))}
            </div>
          </div>
        )}

        {view === 'ai-dj' && (
            <div className="p-4 pt-8">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                    <Sparkles className="text-purple-400" /> RajAI DJ
                </h1>
                <p className="text-gray-400 mb-8">What's your mood?</p>
                <textarea 
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="E.g., 'Late night drive'..."
                    className="w-full h-40 bg-gray-800 border border-gray-700 rounded-3xl p-6 text-lg text-white outline-none focus:border-purple-500"
                />
                <button 
                    onClick={handleAIGenerate}
                    disabled={isAiLoading || !aiPrompt}
                    className="w-full mt-4 bg-gradient-to-r from-purple-600 to-cyan-600 py-4 rounded-2xl font-bold text-lg"
                >
                    {isAiLoading ? "Thinking..." : "Generate Playlist"}
                </button>
            </div>
        )}

        {view === 'library' && (
            <div className="p-4 pt-8">
                <div className="flex justify-between items-end mb-6">
                     <h1 className="text-3xl font-bold">Library</h1>
                     <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-cyan-600 px-4 py-2 rounded-full text-sm font-bold">
                        <Upload size={16} /> Import MP3
                     </button>
                     <input type="file" ref={fileInputRef} onChange={handleImportMusic} accept="audio/*" multiple className="hidden" />
                </div>
                {librarySongs.length > 0 ? (
                    <SongList songs={librarySongs} onPlay={(s) => handlePlaySong(s, librarySongs)} currentSongId={currentSong?.id} isPlaying={isPlaying} />
                ) : (
                    <div className="text-center py-10 text-gray-500">
                        <Music size={48} className="mx-auto mb-4 opacity-50"/>
                        <p>No offline songs. Import some!</p>
                    </div>
                )}
            </div>
        )}
      </main>

      {/* Mini Player */}
      {!isPlayerFull && (
        <div className="fixed bottom-0 left-0 right-0 bg-black/95 border-t border-white/10 pb-safe pt-2 px-2 z-40">
           <div className="flex justify-around items-center pb-3 pt-2 text-[10px] font-medium text-gray-500">
             <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1.5 p-2 ${view === 'home' ? 'text-cyan-400' : ''}`}>
               <Home size={22} /> <span>Home</span>
             </button>
             <button onClick={() => setView('search')} className={`flex flex-col items-center gap-1.5 p-2 ${view === 'search' ? 'text-cyan-400' : ''}`}>
               <Search size={22} /> <span>Search</span>
             </button>
              <button onClick={() => setView('ai-dj')} className={`flex flex-col items-center gap-1.5 p-2 ${view === 'ai-dj' ? 'text-purple-400' : ''}`}>
               <Sparkles size={22} /> <span>AI DJ</span>
             </button>
             <button onClick={() => setView('library')} className={`flex flex-col items-center gap-1.5 p-2 ${view === 'library' ? 'text-cyan-400' : ''}`}>
               <Library size={22} /> <span>Library</span>
             </button>
           </div>
        </div>
      )}

      {/* Floating Player */}
      {currentSong && !isPlayerFull && (
        <div onClick={() => setIsPlayerFull(true)} className="fixed bottom-[85px] left-3 right-3 bg-[#1A1A1A] rounded-xl p-2 flex items-center justify-between shadow-xl z-50 border border-white/5 cursor-pointer">
            <div className="flex items-center gap-3 overflow-hidden pl-1">
                <img src={currentSong.coverUrl} className={`w-10 h-10 rounded-lg bg-gray-800 object-cover ${isPlaying ? 'animate-[spin_8s_linear_infinite]' : ''}`} alt="" />
                <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-bold truncate text-white max-w-[150px]">{currentSong.title}</span>
                    <span className="text-xs text-gray-400 truncate">{currentSong.artist}</span>
                </div>
            </div>
            <div className="flex items-center gap-3 pr-2">
                <button onClick={(e) => { e.stopPropagation(); setIsPlaying(!isPlaying); }} className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center">
                    {isPlaying ? <Pause size={16} fill="black" /> : <Play size={16} fill="black" className="ml-1" />}
                </button>
            </div>
            <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-gray-700 overflow-hidden rounded-full">
                <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${(currentTime / (duration || 1)) * 100}%` }} />
            </div>
        </div>
      )}

      {/* Full Player */}
      {isPlayerFull && currentSong && (
        <div className="fixed inset-0 bg-[#0a0a0a] z-[100] flex flex-col overflow-y-auto">
            <div className="absolute inset-0 z-0 bg-gradient-to-b from-gray-900 to-black opacity-90"></div>
            <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
                <img src={currentSong.coverUrl} className="w-full h-full object-cover" alt="" />
                <div className="absolute inset-0 bg-black/60"></div>
            </div>

            <div className="relative z-10 flex justify-between items-center p-6 pt-12">
                <button onClick={() => setIsPlayerFull(false)} className="p-2 text-white"><ChevronDown size={28} /></button>
                <div className="flex items-center gap-1">
                    <button 
                        onClick={() => setPlayerMode(playerMode === 'art' ? 'lyrics' : 'art')}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase transition-colors ${playerMode === 'lyrics' ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:bg-white/10'}`}
                    >
                        Lyrics
                    </button>
                    <button 
                        onClick={() => setPlayerMode(playerMode === 'eq' ? 'art' : 'eq')}
                         className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase transition-colors ${playerMode === 'eq' ? 'bg-purple-500 text-black' : 'text-gray-400 hover:bg-white/10'}`}
                    >
                        EQ
                    </button>
                </div>
                <button onClick={() => setShowQueue(!showQueue)} className={`p-2 ${showQueue ? 'text-cyan-400' : 'text-white'}`}><ListMusic size={24} /></button>
            </div>

            <div className="relative z-10 flex-1 flex flex-col px-8 pb-8">
                {showQueue ? (
                  <div className="flex-1 overflow-y-auto bg-white/5 rounded-3xl p-4 mb-8">
                      <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase">Queue</h3>
                      {songs.map((s, idx) => (
                         <div key={`${s.id}-${idx}`} onClick={() => handlePlaySong(s)} className={`flex items-center gap-3 p-2 rounded-xl mb-2 ${s.id === currentSong.id ? 'bg-white/10' : ''}`}>
                            <img src={s.coverUrl} className="w-10 h-10 rounded-lg" alt="" />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-bold truncate ${s.id === currentSong.id ? 'text-cyan-400' : 'text-white'}`}>{s.title}</p>
                              <p className="text-xs text-gray-400 truncate">{s.artist}</p>
                            </div>
                         </div>
                      ))}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-center mb-8 relative">
                       {/* Main Content: Art / Lyrics / EQ */}
                       <div className="w-full aspect-square relative mx-auto max-w-sm">
                            {/* ART MODE */}
                            <img 
                                src={currentSong.coverUrl} 
                                alt="" 
                                className={`absolute inset-0 w-full h-full object-cover rounded-2xl shadow-[0_20px_50px_rgba(8,145,178,0.3)] ring-1 ring-white/10 transition-opacity duration-300 ${playerMode === 'art' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
                            />
                            
                            {/* LYRICS MODE */}
                            <div className={`absolute inset-0 bg-black/40 backdrop-blur-xl rounded-2xl p-6 overflow-y-auto no-scrollbar border border-white/10 transition-opacity duration-300 ${playerMode === 'lyrics' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                <h3 className="text-cyan-400 text-xs font-bold uppercase mb-4 sticky top-0 bg-transparent text-center">Lyrics</h3>
                                {loadingLyrics ? (
                                    <div className="h-full flex items-center justify-center">
                                        <Loader2 className="animate-spin text-gray-400" />
                                    </div>
                                ) : (
                                    <p className="text-center text-lg font-medium leading-relaxed text-gray-200 whitespace-pre-wrap">
                                        {lyricsText}
                                    </p>
                                )}
                            </div>

                            {/* EQ MODE */}
                            <div className={`absolute inset-0 bg-black/40 backdrop-blur-xl rounded-2xl p-4 border border-white/10 flex flex-col justify-center transition-opacity duration-300 ${playerMode === 'eq' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                <h3 className="text-purple-400 text-xs font-bold uppercase mb-4 text-center">Equalizer</h3>
                                {/* Always render Equalizer to keep AudioContext alive, just toggle active state */}
                                <Equalizer audioRef={audioRef} active={isPlayerFull} className={playerMode === 'eq' ? '' : 'invisible'} />
                            </div>
                       </div>
                  </div>
                )}

                <div className="flex justify-between items-end mb-6">
                    <div className="flex-1 pr-4">
                        <h2 className="text-2xl font-bold mb-1 leading-tight text-white line-clamp-2">{currentSong.title}</h2>
                        <p className="text-lg text-gray-400">{currentSong.artist}</p>
                    </div>
                    <button className="mb-2 text-cyan-500"><Heart size={28} /></button>
                </div>

                <div className="mb-8">
                    <input type="range" min={0} max={duration || 100} value={currentTime} onChange={handleSeek} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer mb-2 accent-cyan-500" />
                    <div className="flex justify-between text-xs text-gray-400 font-mono">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>

                <div className="flex justify-between items-center mb-10 px-2">
                    <button className="text-gray-400 hover:text-white"><Shuffle size={20} /></button>
                    <div className="flex items-center gap-6">
                        <button onClick={handlePrev} className="text-white active:scale-90 transition-transform"><SkipBack size={36} fill="currentColor" /></button>
                        <button onClick={() => setIsPlaying(!isPlaying)} className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all">
                            {isPlaying ? <Pause size={30} fill="black" /> : <Play size={30} fill="black" className="ml-1" />}
                        </button>
                        <button onClick={handleNext} className="text-white active:scale-90 transition-transform"><SkipForward size={36} fill="currentColor" /></button>
                    </div>
                    <button className="text-gray-400 hover:text-white"><Repeat size={20} /></button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
