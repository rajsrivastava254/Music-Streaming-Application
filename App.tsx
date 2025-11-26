
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
  Share2,
  Mic2,
  MoreVertical,
  Music,
  Plus,
  ListMusic,
  Upload,
  Loader2,
  AlertCircle,
  Clock
} from 'lucide-react';
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

const Logo = () => (
  <div className="flex items-center gap-2">
    <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-green-500/20 transform -rotate-6">
      <span className="text-black font-black text-lg">R</span>
    </div>
    <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
      RajMusic
    </span>
  </div>
);

const App: React.FC = () => {
  // --- STATE ---
  const [view, setView] = useState<ViewState>('home');
  const [songs, setSongs] = useState<Song[]>([]);
  const [librarySongs, setLibrarySongs] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isResolvingAudio, setIsResolvingAudio] = useState(false); 
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlayerFull, setIsPlayerFull] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isContentLoading, setIsContentLoading] = useState(true);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [usingPreview, setUsingPreview] = useState(false);

  // --- REFS ---
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- EFFECTS ---

  useEffect(() => {
    const loadData = async () => {
      setIsContentLoading(true);
      const data = await getFeaturedSongs();
      setSongs(data);
      setIsContentLoading(false);
    };
    loadData();
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => handleNext();
    const onError = (e: any) => {
        console.log("Audio Error, trying next", e);
        if (isPlaying && !usingPreview && currentSong?.previewUrl) {
           // If full stream fails mid-way, fallback to preview
           console.log("Full stream failed, falling back to preview");
           setUsingPreview(true);
           if (audioRef.current) {
               audioRef.current.src = currentSong.previewUrl;
               audioRef.current.play();
           }
        } else if (isPlaying) {
           handleNext();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, currentSong, usingPreview]);

  useEffect(() => {
    if (currentSong && audioRef.current && !isResolvingAudio && (currentSong.audioUrl || usingPreview)) {
      if (isPlaying) {
        audioRef.current.play().catch(e => {
            console.warn("Autoplay blocked", e);
            setIsPlaying(false);
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentSong, isResolvingAudio, usingPreview]);

  // Fetch Lyrics when full player is open
  useEffect(() => {
      if (isPlayerFull && currentSong && !currentSong.lyrics && !currentSong.isLocal && !lyricsLoading) {
          const fetchLyrics = async () => {
              setLyricsLoading(true);
              const text = await getLyrics(currentSong.title, currentSong.artist);
              if (text) {
                  setCurrentSong(prev => prev ? ({...prev, lyrics: text}) : null);
                  // Update in main list too if possible
                  setSongs(prev => prev.map(s => s.id === currentSong.id ? ({...s, lyrics: text}) : s));
              }
              setLyricsLoading(false);
          };
          fetchLyrics();
      }
  }, [isPlayerFull, currentSong?.id]);

  // --- HANDLERS ---

  const handlePlaySong = async (song: Song, contextSongs?: Song[]) => {
    if (contextSongs && contextSongs !== songs) {
        setSongs(contextSongs);
    }

    if (currentSong?.id === song.id) {
        setIsPlaying(!isPlaying);
        return;
    }

    // Set basic metadata immediately so UI updates
    setCurrentSong(song);
    setIsPlaying(true);
    setShowLyrics(false);
    setUsingPreview(false);

    // If it's a local song or already has a resolved URL, just play
    if (song.isLocal || (song.audioUrl && song.audioUrl.length > 5)) {
        setIsResolvingAudio(false);
        return;
    }

    // Resolve Audio URL
    setIsResolvingAudio(true);
    try {
        const streamUrl = await getStreamUrl(song.title, song.artist);
        
        if (streamUrl) {
            const updatedSong = { ...song, audioUrl: streamUrl };
            setCurrentSong(updatedSong);
            setSongs(prev => prev.map(s => s.id === song.id ? updatedSong : s));
        } else {
            console.warn("Could not find full stream, using preview");
            if (song.previewUrl) {
                setUsingPreview(true);
                // We keep audioUrl empty so the UI knows we are using fallback logic if needed
            } else {
                 alert("Song unavailable.");
                 setIsPlaying(false);
            }
        }
    } catch (e) {
        console.error("Stream resolve failed", e);
        if (song.previewUrl) {
            setUsingPreview(true);
        } else {
            setIsPlaying(false);
        }
    }
    setIsResolvingAudio(false);
  };

  const handleAddToQueue = (song: Song) => {
    setSongs(prev => [...prev, song]);
    alert("Added to queue!");
  };

  const handleImportMusic = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const newLocalSongs: Song[] = Array.from(e.target.files).map((file: File, index) => ({
            id: `local-${Date.now()}-${index}`,
            title: file.name.replace(/\.[^/.]+$/, ""),
            artist: 'Local Device',
            album: 'My Imports',
            coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop',
            audioUrl: URL.createObjectURL(file),
            duration: 0,
            isLocal: true
        }));

        setLibrarySongs(prev => [...prev, ...newLocalSongs]);
        setSongs(prev => [...prev, ...newLocalSongs]);
        alert(`Imported ${newLocalSongs.length} songs!`);
        setView('library');
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    setCurrentTime(time);
  };

  const handleNext = () => {
    if (!currentSong) return;
    const currentIndex = songs.findIndex(s => s.id === currentSong.id);
    const nextIndex = (currentIndex + 1) % songs.length;
    handlePlaySong(songs[nextIndex]);
  };

  const handlePrev = () => {
    if (!currentSong) return;
    const currentIndex = songs.findIndex(s => s.id === currentSong.id);
    const prevIndex = (currentIndex - 1 + songs.length) % songs.length;
    handlePlaySong(songs[prevIndex]);
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
    // Fetch real data for suggestions
    const newPlaylist: Song[] = [];
    
    // Parallel fetch for speed
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
        alert("AI couldn't find matches. Try simpler keywords.");
    }
    setIsAiLoading(false);
  };

  // --- RENDER HELPERS ---

  const renderContent = () => {
    switch (view) {
      case 'home':
        return (
          <div className="p-4 pt-6">
             <div className="flex justify-between items-center mb-6">
                 <Logo />
                 <button className="p-2 bg-white/10 rounded-full hover:bg-white/20" onClick={() => setView('search')}>
                     <Search size={20} />
                 </button>
             </div>

             <h1 className="text-xl font-bold mb-4 text-white">
              {searchQuery ? `Results for "${searchQuery}"` : "Trending Now"}
            </h1>
            
            {isContentLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-4">
                    <Loader2 className="animate-spin text-green-500" size={40} />
                    <p>Fetching music...</p>
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
                <div className="text-center py-20 text-gray-500 flex flex-col items-center">
                    <AlertCircle size={40} className="mb-2 opacity-50"/>
                    <p>No songs found. Try a different search.</p>
                </div>
            )}
          </div>
        );
      case 'search':
        return (
          <div className="p-4 pt-8">
            <h1 className="text-3xl font-bold mb-6">Search</h1>
            <form onSubmit={handleSearch} className="mb-8 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Song, Artist, or Album..."
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-full py-4 pl-12 pr-6 focus:outline-none focus:border-green-500 transition-colors"
                autoFocus
              />
            </form>
            <div className="text-gray-400 text-sm">
                <p className="mb-3 font-semibold text-gray-300">Quick Moods</p>
                <div className="flex flex-wrap gap-2">
                    {['Bhojpuri', 'Hindi Top 50', 'Punjabi Hits', 'Lofi Beats', 'English Pop', 'Slowed Reverb'].map(tag => (
                        <button key={tag} onClick={() => { setSearchQuery(tag); handleSearch({ preventDefault: () => {} } as any); }} className="bg-gray-800 border border-white/5 px-4 py-2 rounded-full text-xs hover:bg-gray-700 hover:border-green-500/50 transition-all">
                            {tag}
                        </button>
                    ))}
                </div>
            </div>
          </div>
        );
      case 'ai-dj':
        return (
            <div className="p-4 pt-8 h-full flex flex-col relative">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                    <Sparkles className="text-purple-400 fill-purple-400" /> RajAI DJ
                </h1>
                <p className="text-gray-400 mb-8">Tell me how you feel, I'll handle the rest.</p>
                <div className="flex-1">
                    <textarea 
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="E.g., 'I want energy for my gym session' or 'Sad rainy day songs'..."
                        className="w-full h-40 bg-gray-800/80 border border-gray-700 rounded-3xl p-6 text-lg text-white placeholder-gray-500 focus:border-purple-500 outline-none resize-none shadow-xl"
                    />
                    <div className="mt-4 flex flex-wrap gap-2">
                         {['Feeling Happy', 'Late Night Drive', 'Romantic Dinner', 'Focus Mode'].map(p => (
                             <button key={p} onClick={() => setAiPrompt(p)} className="text-xs bg-white/5 px-3 py-1 rounded-full hover:bg-white/10">
                                 {p}
                             </button>
                         ))}
                    </div>
                </div>
                <button 
                    onClick={handleAIGenerate}
                    disabled={isAiLoading || !aiPrompt}
                    className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 py-5 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 mb-8"
                >
                    {isAiLoading ? (
                        <span className="flex items-center justify-center gap-2">
                             <Loader2 className="animate-spin" size={20} /> Thinking...
                        </span>
                    ) : "Generate Playlist"}
                </button>
            </div>
        );
      case 'library':
        return (
            <div className="p-4 pt-8 min-h-full">
                <div className="flex justify-between items-end mb-6">
                     <h1 className="text-3xl font-bold">Library</h1>
                     <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 bg-green-600 px-4 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform"
                     >
                        <Upload size={16} /> Import
                     </button>
                     <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleImportMusic} 
                        accept="audio/*" 
                        multiple 
                        className="hidden" 
                     />
                </div>
                
                {librarySongs.length > 0 ? (
                    <div className="mb-8">
                        <h2 className="text-gray-400 text-sm font-bold uppercase tracking-wider mb-4">Your Imports</h2>
                        <SongList 
                            songs={librarySongs} 
                            onPlay={(s) => handlePlaySong(s, librarySongs)} 
                            currentSongId={currentSong?.id} 
                            isPlaying={isPlaying}
                            onAddToQueue={handleAddToQueue}
                        />
                    </div>
                ) : (
                    <div className="bg-white/5 rounded-2xl p-8 text-center border border-white/5 mb-8">
                        <Music size={48} className="mx-auto text-gray-600 mb-4" />
                        <h3 className="text-lg font-bold mb-2">Offline Music</h3>
                        <p className="text-gray-400 text-sm mb-6">
                            Import MP3s from your device to listen offline.
                        </p>
                        <button onClick={() => fileInputRef.current?.click()} className="text-green-400 font-bold text-sm">Tap to Import</button>
                    </div>
                )}
            </div>
        )
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden font-sans selection:bg-green-500/30">
      <audio 
        ref={audioRef} 
        src={usingPreview && currentSong?.previewUrl ? currentSong.previewUrl : currentSong?.audioUrl} 
        crossOrigin="anonymous" 
      />

      <main className="h-screen overflow-y-auto no-scrollbar pb-32">
        {renderContent()}
      </main>

      {/* Mini Player */}
      {!isPlayerFull && (
        <div className="fixed bottom-0 left-0 right-0 bg-black/95 border-t border-white/10 pb-safe pt-2 px-2 z-40">
           {/* Navigation */}
           <div className="flex justify-around items-center pb-3 pt-2 text-[10px] font-medium text-gray-500">
             <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1.5 p-2 ${view === 'home' ? 'text-white' : ''}`}>
               <Home size={22} strokeWidth={view === 'home' ? 2.5 : 1.5} />
               <span>Home</span>
             </button>
             <button onClick={() => setView('search')} className={`flex flex-col items-center gap-1.5 p-2 ${view === 'search' ? 'text-white' : ''}`}>
               <Search size={22} strokeWidth={view === 'search' ? 2.5 : 1.5} />
               <span>Search</span>
             </button>
              <button onClick={() => setView('ai-dj')} className={`flex flex-col items-center gap-1.5 p-2 ${view === 'ai-dj' ? 'text-white' : ''}`}>
               <div className={`p-1 rounded-full ${view === 'ai-dj' ? 'bg-purple-500/20 text-purple-400' : ''}`}>
                    <Sparkles size={18} fill={view === 'ai-dj' ? "currentColor" : "none"} />
               </div>
               <span className={view === 'ai-dj' ? 'text-purple-400' : ''}>AI DJ</span>
             </button>
             <button onClick={() => setView('library')} className={`flex flex-col items-center gap-1.5 p-2 ${view === 'library' ? 'text-white' : ''}`}>
               <Library size={22} strokeWidth={view === 'library' ? 2.5 : 1.5} />
               <span>Library</span>
             </button>
           </div>
        </div>
      )}

      {/* Floating Mini Player Controls */}
      {currentSong && !isPlayerFull && (
        <div 
            onClick={() => setIsPlayerFull(true)}
            className="fixed bottom-[85px] left-3 right-3 bg-[#1A1A1A] rounded-xl p-2 flex items-center justify-between shadow-xl z-50 border border-white/5 cursor-pointer"
        >
            <div className="flex items-center gap-3 overflow-hidden pl-1">
                <img src={currentSong.coverUrl} className={`w-10 h-10 rounded-lg bg-gray-800 object-cover ${isPlaying ? 'animate-[spin_8s_linear_infinite]' : ''}`} alt="art" />
                <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-bold truncate text-white max-w-[150px]">{currentSong.title}</span>
                    <span className="text-xs text-gray-400 truncate">{currentSong.artist}</span>
                </div>
            </div>
            <div className="flex items-center gap-3 pr-2">
                 {isResolvingAudio ? (
                     <Loader2 size={20} className="animate-spin text-green-500" />
                 ) : (
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsPlaying(!isPlaying); }}
                        className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center"
                    >
                        {isPlaying ? <Pause size={16} fill="black" /> : <Play size={16} fill="black" className="ml-1" />}
                    </button>
                 )}
            </div>
            <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-gray-700 overflow-hidden rounded-full">
                <div 
                    className="h-full bg-green-500 rounded-full" 
                    style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                />
            </div>
        </div>
      )}

      {/* Full Screen Player */}
      {isPlayerFull && currentSong && (
        <div className="fixed inset-0 bg-[#0a0a0a] z-[100] flex flex-col overflow-y-auto">
            
            {/* Optimized Background */}
            <div className="absolute inset-0 z-0 bg-gradient-to-b from-gray-900 to-black opacity-90"></div>
            <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
                <img src={currentSong.coverUrl} className="w-full h-full object-cover" alt="" />
                <div className="absolute inset-0 bg-black/60"></div>
            </div>

            {/* Header */}
            <div className="relative z-10 flex justify-between items-center p-6 pt-12">
                <button onClick={() => setIsPlayerFull(false)} className="p-2 text-white">
                    <ChevronDown size={28} />
                </button>
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Now Playing</span>
                    {usingPreview && (
                        <span className="text-[10px] text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full mt-1">Preview Mode</span>
                    )}
                </div>
                <button 
                  onClick={() => setShowQueue(!showQueue)} 
                  className={`p-2 ${showQueue ? 'text-green-400' : 'text-white'}`}
                >
                    <ListMusic size={24} />
                </button>
            </div>

            {/* Main Content */}
            <div className="relative z-10 flex-1 flex flex-col px-8 pb-8">
                {showQueue ? (
                  <div className="flex-1 overflow-y-auto bg-white/5 rounded-3xl p-4 mb-8">
                      <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">Queue</h3>
                      <div className="space-y-3">
                        {songs.map((s, idx) => {
                           const isPlayingSong = s.id === currentSong.id;
                           return (
                             <div key={`${s.id}-${idx}`} onClick={() => handlePlaySong(s)} className={`flex items-center gap-3 p-2 rounded-xl ${isPlayingSong ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                                <img src={s.coverUrl} className="w-10 h-10 rounded-lg object-cover" alt="" />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-bold truncate ${isPlayingSong ? 'text-green-400' : 'text-white'}`}>{s.title}</p>
                                  <p className="text-xs text-gray-400 truncate">{s.artist}</p>
                                </div>
                                {isPlayingSong && <div className="w-2 h-2 bg-green-500 rounded-full" />}
                             </div>
                           );
                        })}
                      </div>
                  </div>
                ) : (
                  <div className="w-full aspect-square mb-10 relative mt-4 mx-auto max-w-sm">
                      {showLyrics ? (
                          <div className="w-full h-full bg-black/50 rounded-3xl border border-white/10 p-6 overflow-hidden flex flex-col">
                             <div className="flex justify-between items-center mb-4">
                                  <span className="text-xs font-bold uppercase text-gray-500">Lyrics</span>
                                  {lyricsLoading && <Loader2 size={12} className="animate-spin text-green-500"/>}
                             </div>
                             <div className="flex-1 overflow-y-auto text-center space-y-6 py-4 no-scrollbar">
                                 {currentSong.lyrics ? (
                                     currentSong.lyrics.split('\n').map((line, i) => (
                                         <p key={i} className={`text-lg font-medium ${line ? 'text-white' : 'h-4'}`}>{line}</p>
                                     ))
                                 ) : (
                                     <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                         {lyricsLoading ? (
                                             <p>Fetching lyrics...</p>
                                         ) : (
                                             <>
                                                <Music size={40} className="mb-2 opacity-30" />
                                                <p>Lyrics unavailable</p>
                                             </>
                                         )}
                                     </div>
                                 )}
                             </div>
                          </div>
                      ) : (
                          <img 
                              src={currentSong.coverUrl} 
                              alt="Full Art" 
                              className={`w-full h-full object-cover rounded-2xl shadow-2xl ring-1 ring-white/10 ${isResolvingAudio ? 'opacity-50' : ''}`} 
                          />
                      )}
                      
                      {isResolvingAudio && (
                          <div className="absolute inset-0 flex items-center justify-center z-20">
                              <div className="bg-black/50 backdrop-blur-sm p-4 rounded-full">
                                <Loader2 size={32} className="text-green-500 animate-spin" />
                              </div>
                          </div>
                      )}
                  </div>
                )}

                {/* Info */}
                <div className="flex justify-between items-end mb-6">
                    <div className="flex-1 pr-4">
                        <h2 className="text-2xl font-bold mb-1 leading-tight text-white line-clamp-2">{currentSong.title}</h2>
                        <p className="text-lg text-gray-400">{currentSong.artist}</p>
                    </div>
                    <button className="mb-2 text-green-500 active:scale-125 transition-transform">
                        <Heart size={28} fill="currentColor" />
                    </button>
                </div>

                {/* Progress */}
                <div className="mb-8">
                    <input 
                        type="range" 
                        min={0} 
                        max={duration || 100} 
                        value={currentTime} 
                        onChange={handleSeek}
                        disabled={isResolvingAudio}
                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer mb-2 accent-green-500"
                    />
                    <div className="flex justify-between text-xs text-gray-400 font-mono">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex justify-between items-center mb-10 px-2">
                    <button className="text-gray-400 hover:text-white"><Shuffle size={20} /></button>
                    
                    <div className="flex items-center gap-6">
                        <button onClick={handlePrev} className="text-white active:scale-90 transition-transform"><SkipBack size={36} fill="currentColor" /></button>
                        <button 
                            onClick={() => !isResolvingAudio && setIsPlaying(!isPlaying)}
                            disabled={isResolvingAudio}
                            className={`w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all ${isResolvingAudio ? 'opacity-50' : ''}`}
                        >
                            {isResolvingAudio ? <Loader2 className="animate-spin" /> : (isPlaying ? <Pause size={30} fill="black" /> : <Play size={30} fill="black" className="ml-1" />)}
                        </button>
                        <button onClick={handleNext} className="text-white active:scale-90 transition-transform"><SkipForward size={36} fill="currentColor" /></button>
                    </div>
                    
                    <button className="text-gray-400 hover:text-white"><Repeat size={20} /></button>
                </div>

                {/* Bottom Tools */}
                <div className="grid grid-cols-3 gap-4">
                    <button 
                        onClick={() => setShowLyrics(!showLyrics)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-colors ${showLyrics ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-white/5 border-white/5 text-gray-400'}`}
                    >
                        <Mic2 size={20} />
                        <span className="text-[10px] font-bold uppercase">Lyrics</span>
                    </button>
                    
                    <button className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/5 text-gray-400">
                        <Equalizer className="!p-0 !h-5 !w-5 overflow-hidden opacity-50" audioRef={audioRef} active={isPlayerFull && isPlaying} />
                        <span className="text-[10px] font-bold uppercase mt-1">EQ</span>
                    </button>
                    
                     <button className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/5 text-gray-400">
                        <div className="w-5 h-5 border-2 border-current rounded-full flex items-center justify-center text-[8px] font-bold">HD</div>
                        <span className="text-[10px] font-bold uppercase mt-1">Quality</span>
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
