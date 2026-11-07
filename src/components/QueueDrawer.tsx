import React, { useState } from 'react';
import { X, Trash2, ListMusic, Music, History, Play, Sparkles, Plus, Loader2 } from 'lucide-react';
import { YoutubeIcon as Youtube } from './YoutubeIcon';
import { usePlayer } from '../context/PlayerContext';
import { useRoom } from '../context/RoomContext';
import { extractYouTubeId, fetchYouTubeTrack, searchTracks } from '../services/api';

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({ isOpen, onClose }) => {
  const {
    currentTrack,
    queue,
    history,
    isAutoplay,
    autoplayTrack,
    toggleAutoplay,
    addToQueue,
    removeFromQueue,
    clearQueue,
    playTrack,
  } = usePlayer();
  const { roomState, addToRoomQueue } = useRoom();
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
  const [quickInput, setQuickInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleQuickAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = quickInput.trim();
    if (!query) return;

    setIsAdding(true);
    try {
      const ytId = extractYouTubeId(query);
      if (ytId) {
        const track = await fetchYouTubeTrack(query);
        if (track) {
          if (roomState.connected) {
            addToRoomQueue(track);
          } else {
            addToQueue(track);
          }
          setQuickInput('');
          return;
        }
      }
      const results = await searchTracks(query);
      if (results.length > 0) {
        if (roomState.connected) {
          addToRoomQueue(results[0]);
        } else {
          addToQueue(results[0]);
        }
        setQuickInput('');
      }
    } catch (err) {
      console.error('Quick add error:', err);
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 glass-panel border-l border-white/10 shadow-2xl flex flex-col animate-slide-left">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <ListMusic className="w-5 h-5 text-purple-400" />
          <h3 className="font-extrabold text-base text-zinc-100">Play Queue</h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Autoplay toggle switch */}
          <button
            onClick={toggleAutoplay}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
              isAutoplay
                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                : 'glass-button text-zinc-400'
            }`}
            title={isAutoplay ? 'Autoplay ON' : 'Autoplay OFF'}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${isAutoplay ? 'bg-red-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span>Autoplay</span>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full glass-button text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 px-4 pt-2">
        <button
          onClick={() => setActiveTab('queue')}
          className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'queue'
              ? 'border-purple-500 text-purple-300'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <ListMusic className="w-3.5 h-3.5" />
          Up Next ({queue.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'history'
              ? 'border-purple-500 text-purple-300'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Recently Played
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Now Playing Banner */}
        {currentTrack && (
          <div className="p-3.5 rounded-2xl glass-card border-purple-500/30 flex items-center gap-3 shadow-lg shadow-purple-950/20">
            <img
              src={currentTrack.image}
              alt={currentTrack.title}
              className="w-12 h-12 rounded-xl object-cover shadow border border-white/10"
            />
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                Now Playing
                {currentTrack.source === 'youtube' && (
                  <Youtube className="w-3 h-3 text-red-500 fill-current inline" />
                )}
              </span>
              <p className="text-sm font-bold text-zinc-100 truncate">
                {currentTrack.title}
              </p>
              <p className="text-xs text-zinc-400 truncate">{currentTrack.artist}</p>
            </div>
            <div className="flex items-end gap-0.5 h-4 px-1">
              <span className="w-1 bg-purple-400 rounded-full h-full animate-soundwave"></span>
              <span className="w-1 bg-pink-400 rounded-full h-2/3 animate-soundwave [animation-delay:0.2s]"></span>
              <span className="w-1 bg-purple-400 rounded-full h-4/5 animate-soundwave [animation-delay:0.4s]"></span>
            </div>
          </div>
        )}

        {activeTab === 'queue' ? (
          <div>
            {/* Quick Add To Queue Form */}
            <form onSubmit={handleQuickAdd} className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={quickInput}
                  onChange={(e) => setQuickInput(e.target.value)}
                  placeholder="Paste YouTube link or search..."
                  className="flex-1 glass-input rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isAdding || !quickInput.trim()}
                  className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
                >
                  {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5" /> Queue</>}
                </button>
              </div>
            </form>

            <div className="flex items-center justify-between text-xs text-zinc-400 mb-2 font-medium">
              <span>Next In Line</span>
              {queue.length > 0 && (
                <button
                  onClick={clearQueue}
                  className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear Queue
                </button>
              )}
            </div>

            {queue.length === 0 ? (
              <div className="space-y-4 py-4">
                {/* YouTube Autoplay Up Next Card */}
                {isAutoplay && autoplayTrack ? (
                  <div className="p-3.5 rounded-2xl glass-card border border-red-500/20 bg-red-950/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-black tracking-wider text-red-300 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-red-400" />
                        Autoplay Next (YouTube Mode)
                      </span>
                      <span className="text-[10px] font-bold text-zinc-500 font-mono">Auto</span>
                    </div>

                    <div
                      onClick={() => playTrack(autoplayTrack, [])}
                      className="flex items-center gap-3 cursor-pointer group"
                    >
                      <img
                        src={autoplayTrack.image}
                        alt={autoplayTrack.title}
                        className="w-11 h-11 rounded-xl object-cover border border-white/10 group-hover:scale-105 transition-all"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-xs text-zinc-200 truncate group-hover:text-red-300">
                          {autoplayTrack.title}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">{autoplayTrack.artist}</p>
                      </div>
                      <button className="p-2 rounded-xl glass-button text-red-400 hover:text-white group-hover:scale-110 transition-all">
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-zinc-500 text-xs">
                    <Music className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>Your queue is empty.</p>
                    <p className="text-[11px] text-zinc-600 mt-1">
                      Search above, paste a YouTube link, or import Spotify!
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {queue.map((track, idx) => (
                  <div
                    key={`${track.id}-${idx}`}
                    className="group flex items-center justify-between p-2 rounded-xl glass-card border-transparent hover:border-white/10 transition-all text-xs"
                  >
                    <div
                      className="flex items-center gap-2.5 truncate cursor-pointer flex-1"
                      onClick={() => playTrack(track, queue.filter((_, i) => i !== idx))}
                    >
                      <span className="text-zinc-500 w-4 text-center font-mono">{idx + 1}</span>
                      <img src={track.image} alt={track.title} className="w-8 h-8 rounded-lg object-cover" />
                      <div className="truncate">
                        <p className="font-semibold text-zinc-200 truncate group-hover:text-purple-300">
                          {track.title}
                        </p>
                        <p className="text-[11px] text-zinc-500 truncate">{track.artist}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromQueue(idx)}
                      className="p-1 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="text-xs text-zinc-400 mb-2 font-medium">Played History</div>
            {history.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-xs">
                <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No recently played tracks yet.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {history.map((track, idx) => (
                  <div
                    key={`${track.id}-hist-${idx}`}
                    onClick={() => playTrack(track)}
                    className="group flex items-center justify-between p-2 rounded-xl glass-card border-transparent hover:border-white/10 transition-all text-xs cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate flex-1">
                      <img src={track.image} alt={track.title} className="w-8 h-8 rounded-lg object-cover" />
                      <div className="truncate">
                        <p className="font-semibold text-zinc-200 truncate group-hover:text-purple-300">
                          {track.title}
                        </p>
                        <p className="text-[11px] text-zinc-500 truncate">{track.artist}</p>
                      </div>
                    </div>
                    <Play className="w-3.5 h-3.5 text-zinc-500 group-hover:text-white" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
