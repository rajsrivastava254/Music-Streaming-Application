import React from 'react';
import { Song } from '../types';
import { Play, BarChart2, Download, MoreVertical, ListPlus } from 'lucide-react';

interface SongListProps {
  songs: Song[];
  onPlay: (song: Song) => void;
  currentSongId?: string;
  isPlaying: boolean;
  onAddToQueue?: (song: Song) => void;
}

const SongList: React.FC<SongListProps> = ({ songs, onPlay, currentSongId, isPlaying, onAddToQueue }) => {
  const handleDownload = (e: React.MouseEvent, title: string) => {
    e.stopPropagation();
    // Simulation of download
    const btn = e.currentTarget as HTMLButtonElement;
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<span class="text-green-500 animate-pulse">...</span>`;
    setTimeout(() => {
        alert(`Downloaded "${title}" to offline library!`);
        btn.innerHTML = originalContent;
    }, 1000);
  };

  const handleQueue = (e: React.MouseEvent, song: Song) => {
      e.stopPropagation();
      if (onAddToQueue) onAddToQueue(song);
  };

  return (
    <div className="space-y-2 pb-32">
      {songs.map((song) => {
        const isCurrent = song.id === currentSongId;
        return (
          <div 
            key={song.id} 
            onClick={() => onPlay(song)}
            className={`flex items-center justify-between p-3 rounded-xl transition-all active:scale-[0.98] group ${isCurrent ? 'bg-white/10' : 'hover:bg-white/5'}`}
          >
            <div className="flex items-center gap-3 overflow-hidden flex-1">
              <div className="relative w-12 h-12 flex-shrink-0">
                <img 
                  src={song.coverUrl} 
                  alt={song.title} 
                  loading="lazy"
                  className={`w-full h-full object-cover rounded-md ${isCurrent && isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`}
                />
                {isCurrent && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-md">
                    <BarChart2 size={16} className="text-green-400 animate-pulse" />
                  </div>
                )}
              </div>
              <div className="flex flex-col min-w-0 pr-2">
                <h3 className={`font-medium truncate ${isCurrent ? 'text-green-400' : 'text-white'}`}>{song.title}</h3>
                <p className="text-sm text-gray-400 truncate">{song.artist}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1 text-gray-400">
               {isCurrent && isPlaying ? null : (
                 <button className="p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                   <Play size={16} fill="currentColor" />
                 </button>
               )}
               <button 
                onClick={(e) => handleQueue(e, song)}
                className="p-2 hover:text-white transition-colors"
                title="Add to Queue"
               >
                 <ListPlus size={18} />
               </button>
               <button 
                onClick={(e) => handleDownload(e, song.title)}
                className="p-2 hover:text-green-400 transition-colors"
               >
                 <Download size={18} />
               </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SongList;