import React, { useState, useEffect } from 'react';
import { X, Play, Plus, Loader2, AlertCircle, Check, Music } from 'lucide-react';
import { YoutubeIcon as Youtube } from './YoutubeIcon';
import { fetchYouTubeTrack, extractYouTubeId } from '../services/api';
import { Track } from '../types';
import { usePlayer } from '../context/PlayerContext';
import { useRoom } from '../context/RoomContext';

interface YouTubeModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultUrl?: string;
}

export const YouTubeModal: React.FC<YouTubeModalProps> = ({ isOpen, onClose, defaultUrl = '' }) => {
  const { playTrack, addToQueue } = usePlayer();
  const { roomState, addToRoomQueue } = useRoom();

  const [inputUrl, setInputUrl] = useState(defaultUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewTrack, setPreviewTrack] = useState<Track | null>(null);
  const [addedSuccess, setAddedSuccess] = useState(false);

  useEffect(() => {
    if (defaultUrl) {
      setInputUrl(defaultUrl);
      handleResolve(defaultUrl);
    }
  }, [defaultUrl]);

  if (!isOpen) return null;

  const handleResolve = async (urlToResolve?: string): Promise<Track | null> => {
    const target = (urlToResolve || inputUrl).trim();
    if (!target) return null;

    const videoId = extractYouTubeId(target);
    if (!videoId) {
      setError('Please enter a valid YouTube or YouTube Music link (e.g. https://youtu.be/... or watch?v=...)');
      return null;
    }

    setLoading(true);
    setError(null);
    setAddedSuccess(false);

    try {
      const track = await fetchYouTubeTrack(target);
      if (!track) {
        throw new Error('Could not fetch YouTube video details. Ensure the video is public.');
      }
      setPreviewTrack(track);
      return track;
    } catch (err: any) {
      setError(err.message || 'Failed to resolve YouTube link');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputUrl(val);
    setError(null);
    setAddedSuccess(false);
    if (extractYouTubeId(val)) {
      handleResolve(val);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputUrl(text);
        setError(null);
        handleResolve(text);
      }
    } catch (e) {
      // Clipboard read permission might be denied
    }
  };

  const handlePlayNow = () => {
    if (!previewTrack) return;
    if (roomState.connected) {
      addToRoomQueue(previewTrack);
    } else {
      playTrack(previewTrack);
    }
    onClose();
  };

  const handleAddToQueue = async () => {
    let trackToAdd = previewTrack;

    if (!trackToAdd) {
      const target = inputUrl.trim();
      if (!target) {
        setError('Please paste a YouTube link first');
        return;
      }
      trackToAdd = await handleResolve(target);
    }

    if (!trackToAdd) return;

    if (roomState.connected) {
      addToRoomQueue(trackToAdd);
    } else {
      addToQueue(trackToAdd);
    }
    setAddedSuccess(true);
    setTimeout(() => {
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-lg glass-panel rounded-3xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl border border-white/10">
        {/* Glow Header Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-600 via-rose-500 to-amber-500" />

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500 shadow-lg shadow-red-600/20">
              <Youtube className="w-6 h-6 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white">Add Direct YouTube Track</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                  Direct Stream
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Paste any YouTube song, remix, or video link to play in sync
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-zinc-400 hover:text-white glass-button transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Input & Paste */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
              YouTube URL or Video ID
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputUrl}
                onChange={handleInputChange}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text');
                  if (text) {
                    setInputUrl(text);
                    if (extractYouTubeId(text)) {
                      handleResolve(text);
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddToQueue();
                  }
                }}
                placeholder="https://www.youtube.com/watch?v=... or youtu.be/..."
                className="flex-1 glass-input rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none transition-all font-medium"
                autoFocus
              />
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="px-3.5 py-2.5 rounded-xl glass-button text-xs font-semibold text-zinc-300 hover:text-white shrink-0"
                title="Paste from clipboard"
              >
                Paste
              </button>
              <button
                type="button"
                onClick={handleAddToQueue}
                disabled={loading || !inputUrl.trim()}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white text-xs font-bold shadow-lg shadow-red-600/30 transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                title="Add to queue"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Add to Queue</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error notice */}
          {error && (
            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success notice */}
          {addedSuccess && (
            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs animate-fade-in">
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Added to queue! Dropping the beat now...</span>
            </div>
          )}

          {/* Preview Card */}
          {previewTrack && (
            <div className="glass-card rounded-2xl p-4 border border-white/10 space-y-4 animate-fade-in">
              <div className="flex items-center gap-3.5">
                <div className="relative aspect-video w-32 rounded-xl overflow-hidden bg-zinc-950 shrink-0 border border-white/10 shadow-md">
                  <img
                    src={previewTrack.image}
                    alt={previewTrack.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <Youtube className="w-6 h-6 text-red-500 fill-current opacity-90" />
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30 uppercase inline-block">
                    Ready to stream
                  </span>
                  <h4 className="font-bold text-sm text-zinc-100 truncate leading-snug">
                    {previewTrack.title}
                  </h4>
                  <p className="text-xs text-zinc-400 truncate">{previewTrack.artist}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-1">
                {(roomState.isHost || roomState.isDJ || !roomState.connected) && (
                  <button
                    onClick={handlePlayNow}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white font-bold text-xs shadow-xl shadow-red-600/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Play Now
                  </button>
                )}

                <button
                  onClick={handleAddToQueue}
                  className="flex-1 py-3 rounded-xl glass-button hover:bg-white/15 text-white font-bold text-xs border border-white/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {roomState.connected ? 'Add to Room Queue' : 'Queue Next'}
                </button>
              </div>
            </div>
          )}

          {/* Quick suggestions / helpful examples */}
          {!previewTrack && !loading && (
            <div className="pt-2 text-xs text-zinc-500 space-y-1.5">
              <span className="font-semibold text-zinc-400 block">Supported formats:</span>
              <p>• Standard YouTube: <span className="font-mono text-zinc-400">youtube.com/watch?v=...</span></p>
              <p>• Short link: <span className="font-mono text-zinc-400">youtu.be/...</span></p>
              <p>• YouTube Music: <span className="font-mono text-zinc-400">music.youtube.com/...</span></p>
              <p>• YouTube Shorts: <span className="font-mono text-zinc-400">youtube.com/shorts/...</span></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
