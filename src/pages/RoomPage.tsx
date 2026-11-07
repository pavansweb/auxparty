import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Radio,
  Users,
  Copy,
  Check,
  Share2,
  Sparkles,
  ListMusic,
  MessageSquare,
  Send,
  Plus,
  Search,
  LogOut,
  Crown,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  RotateCw,
  Headphones,
  Music,
  Trash2,
  Loader2,
  ArrowLeft,
  Flame,
  AlertCircle,
  QrCode,
  Volume2,
  VolumeX,
  Volume1,
  ThumbsUp,
  Disc3,
  SlidersHorizontal,
  Zap,
  Heart,
  Shuffle,
  Repeat,
  Maximize2,
  Minimize2,
  Smile,
  Settings,
  AlignLeft,
  Info,
  ExternalLink,
} from 'lucide-react';
import { YoutubeIcon as Youtube } from '../components/YoutubeIcon';
import { useRoom } from '../context/RoomContext';
import { usePlayer } from '../context/PlayerContext';
import { AudioVisualizer } from '../components/AudioVisualizer';
import { SpotifyImportModal } from '../components/SpotifyImportModal';
import { YouTubeModal } from '../components/YouTubeModal';
import { QRCodeModal } from '../components/QRCodeModal';
import { searchTracks, fetchYouTubeTrack, extractYouTubeId } from '../services/api';
import { Track, SoundEffectType } from '../types';
import { extractPalette, DEFAULT_PALETTE, TrackPalette } from '../utils/colorExtractor';

export const RoomPage: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();

  const {
    roomState,
    messages,
    reactions,
    error,
    isConnecting,
    joinRoom,
    createRoom,
    cancelConnecting,
    leaveRoom,
    sendMessage,
    sendReaction,
    triggerSound,
    voteSkip,
    setAuxMode,
    transferAux,
    addToRoomQueue,
    upvoteTrack,
    clearError,
  } = useRoom();

  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    isLoading,
    isAutoplay,
    autoplayTrack,
    toggleAutoplay,
    togglePlayPause,
    seekTo,
    seekRelative,
    nextTrack,
    prevTrack,
    queue,
    removeFromQueue,
    clearQueue,
    playTrack,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    isShuffle,
    toggleShuffle,
    playMode,
    cyclePlayMode,
  } = usePlayer();

  const targetCode = (roomCode || '').toUpperCase();

  // Local State
  const [palette, setPalette] = useState<TrackPalette>(DEFAULT_PALETTE);
  const [userNameInput, setUserNameInput] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('auxparty_nickname') || '';
    }
    return '';
  });
  const [copied, setCopied] = useState(false);
  const [mobileTab, setMobileTab] = useState<'queue' | 'stage' | 'chat'>('stage');
  const [viewMode, setViewMode] = useState<'artwork' | 'vinyl'>('artwork');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLiked, setIsLiked] = useState(false);

  // Room custom name / topic
  const [roomTitle, setRoomTitle] = useState(() => {
    return localStorage.getItem(`room_title_${targetCode}`) || 'hideout';
  });
  const [roomDescription, setRoomDescription] = useState(() => {
    return localStorage.getItem(`room_desc_${targetCode}`) || 'Add a description';
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isSpotifyModalOpen, setIsSpotifyModalOpen] = useState(false);
  const [isYouTubeModalOpen, setIsYouTubeModalOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isAuxMenuOpen, setIsAuxMenuOpen] = useState(false);
  const [isPeersOpen, setIsPeersOpen] = useState(false);

  // In-Room Search & Quick Add
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [roomSearchResults, setRoomSearchResults] = useState<Track[]>([]);
  const [isRoomSearching, setIsRoomSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Extract color palette whenever current track changes
  useEffect(() => {
    if (currentTrack?.image) {
      extractPalette(currentTrack.image, `${currentTrack.title}-${currentTrack.artist}`).then(setPalette);
    } else {
      setPalette(DEFAULT_PALETTE);
    }
  }, [currentTrack?.image, currentTrack?.title, currentTrack?.artist]);

  // High-Contrast Alive Ambient Gradient Background (Matching Image 1 reference)
  const stageGradientStyle = useMemo(
    () => ({
      background: `
        radial-gradient(ellipse 70% 60% at 20% 25%, ${palette.primaryGlow} 0%, transparent 72%),
        radial-gradient(ellipse 65% 55% at 85% 75%, ${palette.secondaryGlow} 0%, transparent 68%),
        #0b0c13
      `,
    }),
    [palette.primaryGlow, palette.secondaryGlow]
  );

  // In-Room Search & Quick YouTube Resolution
  const handleRoomSearchChange = (val: string) => {
    setRoomSearchQuery(val);
    const ytId = extractYouTubeId(val);
    if (ytId) {
      setIsRoomSearching(true);
      fetchYouTubeTrack(val).then((ytTrack) => {
        setIsRoomSearching(false);
        if (ytTrack) {
          setRoomSearchResults([ytTrack]);
        }
      });
    }
  };

  const handleAddSearchOrUrl = async () => {
    const trimmed = roomSearchQuery.trim();
    if (!trimmed) return;

    const ytId = extractYouTubeId(trimmed);
    if (ytId) {
      setIsRoomSearching(true);
      const ytTrack = await fetchYouTubeTrack(trimmed);
      setIsRoomSearching(false);
      if (ytTrack) {
        addToRoomQueue(ytTrack);
        setRoomSearchQuery('');
        setRoomSearchResults([]);
        return;
      }
    }

    if (roomSearchResults.length > 0) {
      addToRoomQueue(roomSearchResults[0]);
      setRoomSearchQuery('');
      setRoomSearchResults([]);
      return;
    }

    setIsRoomSearching(true);
    const results = await searchTracks(trimmed);
    setIsRoomSearching(false);
    if (results.length > 0) {
      addToRoomQueue(results[0]);
      setRoomSearchQuery('');
      setRoomSearchResults([]);
    }
  };

  const handleRoomSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await handleAddSearchOrUrl();
    }
  };

  useEffect(() => {
    if (!roomSearchQuery.trim()) {
      setRoomSearchResults([]);
      setIsRoomSearching(false);
      return;
    }
    if (extractYouTubeId(roomSearchQuery)) return;

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setIsRoomSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      const res = await searchTracks(roomSearchQuery);
      setRoomSearchResults(res);
      setIsRoomSearching(false);
    }, 280);
  }, [roomSearchQuery]);

  // Auto-join room on mount if nickname is already saved
  useEffect(() => {
    if (targetCode && (!roomState.connected || roomState.roomCode !== targetCode)) {
      const saved = localStorage.getItem('auxparty_nickname');
      if (saved && saved.trim()) {
        joinRoom(targetCode, saved.trim());
      }
    }
  }, [targetCode]);

  const handleExit = () => {
    leaveRoom();
    navigate('/');
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCode) return;
    clearError();
    const name = userNameInput.trim() || 'Friend';
    if (typeof window !== 'undefined') {
      localStorage.setItem('auxparty_nickname', name);
    }
    await joinRoom(targetCode, name);
  };

  const handleCreateThisRoom = async () => {
    clearError();
    const name = userNameInput.trim() || 'DJ Host';
    if (typeof window !== 'undefined') {
      localStorage.setItem('auxparty_nickname', name);
    }
    await createRoom(name, targetCode);
  };

  const handleCopyLink = () => {
    const fullUrl = window.location.href;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendMessage(chatInput);
    setChatInput('');
    setIsEmojiPickerOpen(false);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const emojis = ['❤️', '🔥', '✨', '⚡', '🎵'];
  const quickChatEmojis = ['😊', '🔥', '💖', '🎶', '🎉', '👏', '🚀', '💯'];
  const totalPeers = Math.max(1, roomState.peers.length);
  const skipThreshold = Math.ceil(totalPeers / 2);
  const hasVotedSkip = roomState.skipVotes.includes(roomState.userName);
  const isYT = currentTrack?.source === 'youtube' || Boolean(currentTrack?.youtubeId);

  // NOT CONNECTED VIEW: Sleek Join Screen
  if (!roomState.connected || roomState.roomCode !== targetCode) {
    return (
      <div className="min-h-screen text-zinc-100 flex flex-col justify-center items-center p-4 selection:bg-purple-600 relative overflow-hidden bg-[#0c0c14]">
        <div className="relative z-10 w-full max-w-md glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 border border-white/10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Discover
          </Link>

          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 flex items-center justify-center text-white shadow-xl shadow-purple-600/30 border border-white/20">
              <span className="font-black text-xl tracking-tighter">w</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white">hideout #{targetCode}</h2>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  HIFI Sync
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 font-medium">
                Join this synchronized party room to stream together
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
              <button onClick={clearError} className="text-rose-400 hover:text-white font-bold text-xs ml-2">
                ✕
              </button>
            </div>
          )}

          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Your Nickname
              </label>
              <input
                type="text"
                value={userNameInput}
                onChange={(e) => setUserNameInput(e.target.value)}
                placeholder="e.g. DJ Star, Alex, Luna"
                maxLength={24}
                required
                className="w-full glass-input rounded-2xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none transition-all font-medium"
              />
            </div>

            <button
              type="submit"
              disabled={isConnecting}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 text-white font-bold text-sm shadow-xl shadow-purple-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-white/20 disabled:opacity-50"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting to Party...</span>
                </>
              ) : (
                <>
                  <Radio className="w-4 h-4" />
                  <span>Join Room #{targetCode}</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
            <span>Room #{targetCode}</span>
            <button
              onClick={handleCreateThisRoom}
              className="text-purple-400 hover:text-purple-300 font-bold transition-colors"
            >
              Host this Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  // CONNECTED VIEW: The Full 3-Column Experience (Matching Image 1 Reference)
  return (
    <div className="h-screen w-screen text-zinc-100 flex flex-col selection:bg-purple-600 selection:text-white relative overflow-hidden bg-[#0a0a10]">
      {/* Floating Animated Reaction Emojis Canvas */}
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        {reactions.map((r) => (
          <div
            key={r.id}
            className="absolute bottom-16 animate-reaction text-3xl select-none"
            style={{ left: `${r.x}%` }}
          >
            {r.emoji}
          </div>
        ))}
      </div>

      {/* TOP HEADER BAR (Clean, Minimalist, Matching Image 1) */}
      <header className="h-14 shrink-0 w-full glass-panel border-b border-white/10 px-3 sm:px-6 flex items-center justify-between gap-3 z-30">
        {/* Left: Brand Logo & Room Name */}
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="w-8 h-8 rounded-xl bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-lg shadow-purple-600/30 transition-all font-black text-lg tracking-tighter"
            title="AuxParty Home"
          >
            w
          </Link>

          <div>
            <div className="flex items-center gap-2">
              {isEditingTitle ? (
                <input
                  type="text"
                  value={roomTitle}
                  onChange={(e) => setRoomTitle(e.target.value)}
                  onBlur={() => {
                    setIsEditingTitle(false);
                    localStorage.setItem(`room_title_${targetCode}`, roomTitle);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setIsEditingTitle(false);
                      localStorage.setItem(`room_title_${targetCode}`, roomTitle);
                    }
                  }}
                  autoFocus
                  className="bg-transparent text-sm font-black text-white border-b border-purple-500 focus:outline-none"
                />
              ) : (
                <span
                  onClick={() => setIsEditingTitle(true)}
                  className="font-black text-sm text-white tracking-wide cursor-pointer hover:text-purple-300 transition-colors"
                  title="Click to edit room name"
                >
                  {roomTitle}
                </span>
              )}

              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {roomState.isHost ? 'Host' : roomState.isDJ ? 'DJ' : 'Listener'}
              </span>
            </div>

            {isEditingDesc ? (
              <input
                type="text"
                value={roomDescription}
                onChange={(e) => setRoomDescription(e.target.value)}
                onBlur={() => {
                  setIsEditingDesc(false);
                  localStorage.setItem(`room_desc_${targetCode}`, roomDescription);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setIsEditingDesc(false);
                    localStorage.setItem(`room_desc_${targetCode}`, roomDescription);
                  }
                }}
                autoFocus
                className="bg-transparent text-[11px] text-zinc-400 border-b border-zinc-600 focus:outline-none"
              />
            ) : (
              <p
                onClick={() => setIsEditingDesc(true)}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer truncate max-w-[160px] sm:max-w-xs transition-colors"
                title="Click to edit description"
              >
                {roomDescription}
              </p>
            )}
          </div>
        </div>

        {/* Center / Right: Minimalist Controls Bar */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Soundboard Dock (Frosted Pill with Minimalist Emojis) */}
          <div className="hidden md:flex items-center gap-0.5 glass-panel-subtle px-1.5 py-1 rounded-full border border-white/10">
            <button
              onClick={() => triggerSound('airhorn')}
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs hover:bg-white/15 transition-all active:scale-90 hover:scale-110"
              title="Airhorn (📢)"
            >
              📢
            </button>
            <button
              onClick={() => triggerSound('scratch')}
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs hover:bg-white/15 transition-all active:scale-90 hover:scale-110"
              title="Vinyl Scratch (💽)"
            >
              💽
            </button>
            <button
              onClick={() => triggerSound('bassdrop')}
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs hover:bg-white/15 transition-all active:scale-90 hover:scale-110"
              title="Bass Drop (💣)"
            >
              💣
            </button>
            <button
              onClick={() => triggerSound('cheer')}
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs hover:bg-white/15 transition-all active:scale-90 hover:scale-110"
              title="Applause (👏)"
            >
              👏
            </button>
          </div>

          {/* Direct YouTube Modal Button */}
          <button
            onClick={() => setIsYouTubeModalOpen(true)}
            className="w-8 h-8 rounded-full glass-button flex items-center justify-center text-red-400 hover:text-white hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 transition-all active:scale-95"
            title="Add YouTube URL"
          >
            <Youtube className="w-4 h-4 fill-current text-red-500" />
          </button>

          {/* Pass Aux / Host Controls */}
          {roomState.isHost && (
            <div className="relative">
              <button
                onClick={() => setIsAuxMenuOpen(!isAuxMenuOpen)}
                className="w-8 h-8 rounded-full glass-button flex items-center justify-center text-amber-300 hover:text-amber-200 hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/30 transition-all active:scale-95"
                title="Pass Aux Cord & DJ Mode"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>

              {isAuxMenuOpen && (
                <div className="absolute right-0 mt-2 w-52 glass-panel rounded-2xl p-2 shadow-2xl z-50 space-y-1 border border-white/15 backdrop-blur-xl">
                  <div className="px-3 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    Aux Mode
                  </div>
                  <button
                    onClick={() => {
                      setAuxMode('host-only');
                      setIsAuxMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between ${
                      roomState.auxMode === 'host-only'
                        ? 'bg-white/15 text-white'
                        : 'text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    <span>Host Only</span>
                    {roomState.auxMode === 'host-only' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                  <button
                    onClick={() => {
                      setAuxMode('open-aux');
                      setIsAuxMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between ${
                      roomState.auxMode === 'open-aux'
                        ? 'bg-white/15 text-white'
                        : 'text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    <span>Open Aux</span>
                    {roomState.auxMode === 'open-aux' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>

                  <div className="px-3 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider pt-2 border-t border-white/10">
                    Pass Aux
                  </div>
                  {roomState.peers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        transferAux(p.name);
                        setIsAuxMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-300 hover:bg-white/10 flex items-center justify-between"
                    >
                      <span>{p.name}</span>
                      {p.name === roomState.activeDjName && (
                        <Crown className="w-3.5 h-3.5 text-amber-400" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* QR Code Button */}
          <button
            onClick={() => setIsQRModalOpen(true)}
            className="w-8 h-8 rounded-full glass-button flex items-center justify-center text-zinc-300 hover:text-white border border-white/10 transition-all active:scale-95"
            title="Scan QR Code to join on phone"
          >
            <QrCode className="w-3.5 h-3.5" />
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setIsSpotifyModalOpen(true)}
            className="w-8 h-8 rounded-full glass-button flex items-center justify-center text-zinc-400 hover:text-white border border-white/10 transition-all active:scale-95"
            title="Spotify Import & Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* Invite Pill Button (Matching Image 1) */}
          <button
            onClick={handleCopyLink}
            className="glass-button h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold text-zinc-200 border border-white/10 hover:border-white/20 hover:text-white transition-all active:scale-95"
            title="Copy Invite Link"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[11px] text-emerald-300">Copied</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-purple-300" />
                <span className="text-[11px] font-mono tracking-wider">Invite {targetCode}</span>
              </>
            )}
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="w-8 h-8 rounded-full glass-button flex items-center justify-center text-zinc-400 hover:text-white border border-white/10 transition-all active:scale-95 hidden sm:flex"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Leave Button */}
          <button
            onClick={handleExit}
            className="h-8 px-2.5 rounded-full glass-button flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 border border-white/10 transition-all active:scale-95"
            title="Leave Room"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">Leave</span>
          </button>
        </div>
      </header>

      {/* MOBILE TAB SWITCHER (< 1024px) */}
      <div className="lg:hidden shrink-0 px-3 py-2 bg-black/40 border-b border-white/10 flex items-center justify-around gap-2 z-20">
        <button
          onClick={() => setMobileTab('queue')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            mobileTab === 'queue'
              ? 'bg-white/15 text-white border border-white/20'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <ListMusic className="w-3.5 h-3.5 text-purple-400" />
          <span>Up Next</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10">{queue.length}</span>
        </button>
        <button
          onClick={() => setMobileTab('stage')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            mobileTab === 'stage'
              ? 'bg-white/15 text-white border border-white/20'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Now Playing</span>
        </button>
        <button
          onClick={() => setMobileTab('chat')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            mobileTab === 'chat'
              ? 'bg-white/15 text-white border border-white/20'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
          <span>Chat</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10">{messages.length}</span>
        </button>
      </div>

      {/* MAIN 3-COLUMN LAYOUT (Matching Image 1 Reference) */}
      <main className="flex-1 overflow-hidden p-2.5 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 max-w-[1800px] w-full mx-auto">
        {/* ======================================================== */}
        {/* COLUMN 1 (LEFT): UP NEXT / QUEUE (3 Cols)                */}
        {/* ======================================================== */}
        <aside
          className={`lg:col-span-3 flex-col h-full glass-panel rounded-3xl p-3 sm:p-4 overflow-hidden border border-white/10 relative transition-all ${
            mobileTab === 'queue' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Header: Up Next & Queued Count */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-purple-400" />
              <h2 className="font-black text-sm text-white tracking-wide">Up Next</h2>
            </div>
            <span className="text-xs font-bold text-zinc-400 font-mono">
              {queue.length} queued
            </span>
          </div>

          {/* Quick Search & Direct YouTube Input with + Add Button */}
          <div className="py-3 relative shrink-0">
            <div className="relative flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                <input
                  type="text"
                  value={roomSearchQuery}
                  onChange={(e) => handleRoomSearchChange(e.target.value)}
                  onKeyDown={handleRoomSearchKeyDown}
                  placeholder="Search songs or paste link..."
                  className="w-full glass-input rounded-2xl pl-8 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none transition-all font-medium"
                />
                {isRoomSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-purple-400" />
                )}
              </div>

              {/* Purple + Add Pill Button (Matching Image 1) */}
              <button
                type="button"
                onClick={handleAddSearchOrUrl}
                disabled={!roomSearchQuery.trim() || isRoomSearching}
                className="px-3.5 py-2 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-600/30 transition-all flex items-center gap-1 active:scale-95 disabled:opacity-40 shrink-0"
                title="Add to Queue"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            {/* Instant Search Suggestions Dropdown */}
            {roomSearchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto glass-panel rounded-2xl p-1.5 space-y-1 shadow-2xl z-40 border border-white/15">
                {roomSearchResults.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => {
                      addToRoomQueue(t);
                      setRoomSearchQuery('');
                      setRoomSearchResults([]);
                    }}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-white/10 cursor-pointer transition-colors text-xs"
                  >
                    <div className="flex items-center gap-2 truncate flex-1">
                      <img src={t.image} alt={t.title} className="w-7 h-7 rounded-lg object-cover" />
                      <div className="truncate">
                        <p className="font-bold text-zinc-200 truncate">{t.title}</p>
                        <p className="text-[10px] text-zinc-400 truncate">{t.artist}</p>
                      </div>
                    </div>
                    <button className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-purple-600/40 text-purple-200 border border-purple-500/30 hover:bg-purple-600 transition-all shrink-0">
                      <Plus className="w-3 h-3" /> Queue
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Now Playing Card (Matching Image 1) */}
          <div className="shrink-0 space-y-1.5 pb-2">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
              Now playing
            </span>
            {currentTrack ? (
              <div className="p-2.5 rounded-2xl bg-purple-500/[0.08] border border-purple-500/30 flex items-center gap-2.5 transition-all shadow-sm">
                <div className="flex items-center gap-0.5 shrink-0 text-purple-400">
                  <div className="w-0.5 h-3 bg-purple-400 rounded-full animate-soundwave" style={{ animationDelay: '0ms' }} />
                  <div className="w-0.5 h-4 bg-purple-400 rounded-full animate-soundwave" style={{ animationDelay: '150ms' }} />
                  <div className="w-0.5 h-2 bg-purple-400 rounded-full animate-soundwave" style={{ animationDelay: '300ms' }} />
                </div>
                <img
                  src={currentTrack.image}
                  alt={currentTrack.title}
                  className="w-10 h-10 rounded-xl object-cover shadow-sm shrink-0 border border-white/10"
                />
                <div className="truncate flex-1">
                  <p className="font-bold text-xs text-white truncate">{currentTrack.title}</p>
                  <p className="text-[11px] text-zinc-400 truncate">{currentTrack.artist}</p>
                </div>
                <span className="text-[11px] font-mono text-zinc-400 font-semibold shrink-0">
                  {formatTime(duration)}
                </span>
              </div>
            ) : (
              <div className="p-3 rounded-2xl glass-card text-center text-xs text-zinc-500">
                No song currently playing
              </div>
            )}
          </div>

          {/* Section: Up Next Queue List (Matching Image 1) */}
          <div className="flex-1 flex flex-col min-h-0 pt-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                Up next
              </span>
              {queue.length > 0 && (roomState.isHost || roomState.isDJ) && (
                <button
                  onClick={clearQueue}
                  className="text-[10px] text-zinc-500 hover:text-rose-400 transition-colors flex items-center gap-0.5"
                >
                  <Trash2 className="w-2.5 h-2.5" /> Clear
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {queue.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-2 text-zinc-500">
                  <p className="text-xs text-zinc-400 font-medium">
                    Nothing up next. Add a song or let autoplay pick.
                  </p>
                  {isAutoplay && autoplayTrack && (
                    <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 w-full text-left">
                      <span className="text-[9px] uppercase font-bold text-red-400 block mb-0.5">
                        Autoplay continuous:
                      </span>
                      <p className="text-xs font-bold text-zinc-300 truncate">{autoplayTrack.title}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{autoplayTrack.artist}</p>
                    </div>
                  )}
                </div>
              ) : (
                queue.map((track, idx) => {
                  const trackIsYT = track.source === 'youtube' || Boolean(track.youtubeId);
                  return (
                    <div
                      key={`${track.id}-${idx}`}
                      className="group flex items-center justify-between p-2 rounded-2xl glass-card border-white/5 hover:border-white/15 transition-all text-xs"
                    >
                      <div
                        className="flex items-center gap-2 truncate flex-1 cursor-pointer"
                        onClick={() => {
                          if (roomState.isHost || roomState.isDJ) {
                            playTrack(track, queue.filter((_, i) => i !== idx));
                          }
                        }}
                      >
                        <span className="text-zinc-500 w-3 text-center font-mono text-[11px] font-bold">
                          {idx + 1}
                        </span>
                        <img
                          src={track.image}
                          alt={track.title}
                          className="w-8 h-8 rounded-lg object-cover shrink-0"
                        />
                        <div className="truncate">
                          <div className="flex items-center gap-1">
                            <p className="font-bold text-zinc-200 truncate group-hover:text-purple-300">
                              {track.title}
                            </p>
                            {trackIsYT && (
                              <Youtube className="w-3 h-3 text-red-400 fill-current shrink-0" />
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-400 truncate">
                            {track.artist}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => upvoteTrack(track.id)}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg glass-button text-zinc-300 hover:text-purple-300 text-[10px] font-mono"
                          title="Upvote song"
                        >
                          <Flame className="w-2.5 h-2.5 text-pink-500" />
                          <span>{track.votes || 0}</span>
                        </button>
                        {(roomState.isHost || roomState.isDJ) && (
                          <button
                            onClick={() => removeFromQueue(idx)}
                            className="p-1 text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Bottom Left Column Stats (Matching Image 1) */}
          <div className="pt-2.5 border-t border-white/10 shrink-0 flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono text-[11px]">
              {totalPeers} in session / {formatTime(duration)}
            </span>
            <button
              onClick={toggleAutoplay}
              className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                isAutoplay
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                  : 'text-zinc-500 border-white/5 hover:text-zinc-300'
              }`}
              title="Autoplay recommended tracks when queue ends"
            >
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>Autoplay</span>
            </button>
          </div>
        </aside>

        {/* ======================================================== */}
        {/* COLUMN 2 (CENTER): NOW PLAYING STAGE & CONTROLS (6 Cols) */}
        {/* ======================================================== */}
        <section
          className={`lg:col-span-6 flex flex-col h-full justify-between glass-panel rounded-3xl overflow-hidden border border-white/10 relative transition-all ${
            mobileTab === 'stage' ? 'flex' : 'hidden lg:flex'
          }`}
          style={stageGradientStyle}
        >
          {/* Stage Top Bar (Matching Image 1 Reference) */}
          <div className="w-full flex items-center justify-between text-xs text-zinc-400 z-10 px-4 pt-3 pb-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-bold text-emerald-400 text-[11px] tracking-wider uppercase">
                Now playing
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-black/40 border border-white/10 text-zinc-300 font-mono text-[11px]">
                Sync 38 ms
              </span>
              <button
                onClick={() => setViewMode(viewMode === 'artwork' ? 'vinyl' : 'artwork')}
                className="px-2 py-0.5 rounded-full glass-button text-[11px] font-bold flex items-center gap-1 hover:text-white"
                title="Toggle Artwork / Vinyl mode"
              >
                {viewMode === 'artwork' ? '💽 Vinyl' : '🖼️ Cover'}
              </button>
              <button
                onClick={() => setMobileTab('chat')}
                className="lg:hidden p-1 rounded-full glass-button text-zinc-400 hover:text-white"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Stage Floating Reactions Dock (Vertical on Right - Exact Image 1 Match) */}
          <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2 p-1.5 rounded-full glass-panel-subtle border border-white/15 shadow-2xl backdrop-blur-md">
            {emojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => sendReaction(emoji)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm sm:text-base hover:scale-125 active:scale-90 hover:bg-white/15 transition-all"
                title={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Stage Center: Large Squircle Album Art or Vinyl Mode */}
          <div className="flex-1 flex flex-col items-center justify-center p-3 relative z-10 my-auto">
            {currentTrack ? (
              <div className="flex flex-col items-center space-y-4">
                {viewMode === 'artwork' ? (
                  /* Large Squircle Cover Art (Exact Match to Image 1) */
                  <div className="relative group">
                    <img
                      src={currentTrack.image}
                      alt={currentTrack.title}
                      className="w-52 h-52 sm:w-64 sm:h-64 md:w-72 md:h-72 rounded-3xl sm:rounded-[32px] object-cover shadow-[0_24px_50px_-12px_rgba(0,0,0,0.85)] border-2 border-white/15 transition-transform duration-500 group-hover:scale-105"
                    />
                    {isPlaying && (
                      <div
                        className="absolute -inset-4 rounded-3xl -z-10 pointer-events-none opacity-40 blur-xl"
                        style={{ background: palette.primary }}
                      />
                    )}
                  </div>
                ) : (
                  /* Spinning Vinyl Record Mode */
                  <div
                    className={`w-48 h-48 sm:w-60 sm:h-60 rounded-full bg-zinc-950 p-2 shadow-2xl border-4 border-white/15 flex items-center justify-center ${
                      isPlaying ? 'animate-[spin_12s_linear_infinite]' : ''
                    }`}
                  >
                    <div className="w-full h-full rounded-full border border-white/10 flex items-center justify-center p-2.5 relative overflow-hidden">
                      <div className="absolute inset-0 rounded-full border border-white/5 scale-90"></div>
                      <div className="absolute inset-0 rounded-full border border-white/5 scale-75"></div>
                      <img
                        src={currentTrack.image}
                        alt={currentTrack.title}
                        className="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover shadow-2xl border-2 border-white/30"
                      />
                      <div className="absolute w-4 h-4 rounded-full bg-zinc-950 border-2 border-zinc-600"></div>
                    </div>
                  </div>
                )}

                {/* Real-time Spectrum Audio Visualizer */}
                <div className="w-full flex justify-center pt-1">
                  <AudioVisualizer height={26} barWidth={3} gap={2} className="w-56 opacity-80" />
                </div>
              </div>
            ) : (
              <div className="text-center space-y-3 py-12">
                <Music className="w-12 h-12 text-purple-400/40 mx-auto" />
                <h3 className="text-lg font-black text-zinc-200">No Song Playing Right Now</h3>
                <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                  Paste a direct YouTube link or search on the left to start the party!
                </p>
                <button
                  onClick={() => setIsYouTubeModalOpen(true)}
                  className="px-4 py-2 rounded-full bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-md shadow-red-600/20"
                >
                  <Youtube className="w-3.5 h-3.5 fill-current" />
                  Paste YouTube Link
                </button>
              </div>
            )}
          </div>

          {/* Stage Bottom Player Controls Card (Matching Image 1 Reference) */}
          <div className="p-3 sm:p-4 rounded-2xl glass-panel-subtle border-t border-white/10 bg-black/40 backdrop-blur-xl shrink-0 z-20 space-y-2">
            {/* Scrubber & Track Title Row */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Mini Art & Track Details (Left) */}
              <div className="flex items-center gap-2.5 truncate w-full sm:w-auto">
                {currentTrack ? (
                  <>
                    <img
                      src={currentTrack.image}
                      alt={currentTrack.title}
                      className="w-10 h-10 rounded-xl object-cover shrink-0 border border-white/10"
                    />
                    <div className="truncate flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-black text-sm text-white truncate">{currentTrack.title}</h3>
                        {isYT && (
                          <span className="text-[9px] font-black px-1.5 py-0.2 rounded-full bg-red-600/30 text-red-300 border border-red-500/40 uppercase shrink-0 flex items-center gap-1">
                            <Youtube className="w-2.5 h-2.5 fill-current" /> YT
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 font-medium truncate">{currentTrack.artist}</p>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-zinc-500 font-medium">Idle</div>
                )}
              </div>

              {/* Scrubber Line (Right) */}
              <div className="w-full sm:flex-1 sm:max-w-md flex items-center gap-2 text-xs font-mono text-zinc-400">
                <span className="w-8 text-right text-[11px]">{formatTime(currentTime)}</span>
                <div className="relative flex-1 py-1 cursor-pointer">
                  <div className="h-1.5 w-full bg-zinc-800/90 rounded-full overflow-hidden border border-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  {(roomState.isHost || roomState.isDJ) && (
                    <input
                      type="range"
                      min="0"
                      max={duration || 100}
                      step="0.1"
                      value={currentTime}
                      onChange={(e) => seekTo(parseFloat(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  )}
                </div>
                <span className="w-8 text-[11px]">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Playback Controls Row (Matching Image 1) */}
            <div className="flex items-center justify-between pt-1">
              {/* Left Group: Heart & Shuffle */}
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={() => setIsLiked(!isLiked)}
                  className={`p-2 rounded-xl transition-all ${
                    isLiked ? 'text-pink-500 hover:text-pink-400' : 'text-zinc-400 hover:text-white'
                  }`}
                  title={isLiked ? 'Liked' : 'Like'}
                >
                  <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                </button>
                <button
                  onClick={toggleShuffle}
                  className={`p-2 rounded-xl transition-all ${
                    isShuffle ? 'text-purple-400' : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Shuffle"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
              </div>

              {/* Center Group: Prev, -5, Big Purple Play Button, +5, Next */}
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={prevTrack}
                  disabled={!roomState.isHost && !roomState.isDJ}
                  className="p-2 text-zinc-300 hover:text-white glass-button rounded-xl transition-all active:scale-95 disabled:opacity-40"
                  title="Previous Track"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>

                <button
                  onClick={() => seekRelative(-5)}
                  disabled={!roomState.isHost && !roomState.isDJ}
                  className="px-2 py-1 text-zinc-400 hover:text-white glass-button rounded-xl transition-all active:scale-95 text-[11px] font-mono font-bold disabled:opacity-40"
                  title="Rewind 5s"
                >
                  -5
                </button>

                {/* Big Circular Purple Play/Pause Button (Image 1 Signature) */}
                <button
                  onClick={togglePlayPause}
                  disabled={isLoading || (!roomState.isHost && !roomState.isDJ)}
                  className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-lg shadow-purple-600/40 hover:scale-105 active:scale-95 transition-all border border-white/20 disabled:opacity-50"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : isPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  onClick={() => seekRelative(5)}
                  disabled={!roomState.isHost && !roomState.isDJ}
                  className="px-2 py-1 text-zinc-400 hover:text-white glass-button rounded-xl transition-all active:scale-95 text-[11px] font-mono font-bold disabled:opacity-40"
                  title="Forward 5s"
                >
                  +5
                </button>

                <button
                  onClick={nextTrack}
                  disabled={!roomState.isHost && !roomState.isDJ}
                  className="p-2 text-zinc-300 hover:text-white glass-button rounded-xl transition-all active:scale-95 disabled:opacity-40"
                  title="Next Track (Skip Forward)"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>
              </div>

              {/* Right Group: Repeat & Volume */}
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={cyclePlayMode}
                  className={`p-2 rounded-xl transition-all ${
                    playMode !== 'none' ? 'text-purple-400' : 'text-zinc-400 hover:text-white'
                  }`}
                  title={`Repeat: ${playMode}`}
                >
                  <Repeat className="w-4 h-4" />
                </button>

                {/* Vote Skip */}
                <button
                  onClick={voteSkip}
                  className={`px-2 py-1 rounded-xl text-[10px] font-bold border transition-all ${
                    hasVotedSkip
                      ? 'bg-purple-600/30 text-purple-300 border-purple-500/50'
                      : 'glass-button text-zinc-400 hover:text-white'
                  }`}
                  title="Vote to skip"
                >
                  <span>Skip</span>{' '}
                  <span className="font-mono">
                    {roomState.skipVotes.length}/{skipThreshold}
                  </span>
                </button>

                {/* Volume Slider */}
                <div className="hidden sm:flex items-center gap-1.5 pl-1">
                  <button
                    onClick={toggleMute}
                    className="p-1 text-zinc-400 hover:text-white transition-colors"
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4 text-rose-400" />
                    ) : volume < 0.5 ? (
                      <Volume1 className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="w-16 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/* COLUMN 3 (RIGHT): ROOM CHAT & PARTICIPANTS (3 Cols)      */}
        {/* ======================================================== */}
        <aside
          className={`lg:col-span-3 flex-col h-full glass-panel rounded-3xl overflow-hidden border border-white/10 relative transition-all ${
            mobileTab === 'chat' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Header: User avatar & 1 in the room (Matching Image 1) */}
          <div className="p-3 border-b border-white/10 flex items-center justify-between bg-black/20 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 p-0.5 flex items-center justify-center">
                <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center font-bold text-xs text-white">
                  {roomState.userName.slice(0, 1).toUpperCase()}
                </div>
              </div>
              <div>
                <p className="font-bold text-xs text-white">
                  {totalPeers} in the room
                </p>
                <p className="text-[10px] text-zinc-400">
                  {roomState.auxMode === 'open-aux' ? 'Open booth' : `DJ: ${roomState.activeDjName}`}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsPeersOpen(!isPeersOpen)}
              className="w-7 h-7 rounded-full glass-button flex items-center justify-center text-zinc-400 hover:text-white"
              title="View room members"
            >
              <Users className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Members Overlay Drawer */}
          {isPeersOpen && (
            <div className="p-2 border-b border-white/10 bg-black/40 space-y-1 max-h-36 overflow-y-auto">
              <span className="text-[10px] uppercase font-bold text-zinc-400 px-2 block">
                Connected Friends ({roomState.peers.length})
              </span>
              {roomState.peers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-2 py-1 rounded-xl glass-card text-xs"
                >
                  <span className="font-medium text-zinc-200">{p.name}</span>
                  {p.isHost ? (
                    <span className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                      <Crown className="w-3 h-3" /> Host
                    </span>
                  ) : p.name === roomState.activeDjName ? (
                    <span className="text-[10px] text-purple-400 font-bold flex items-center gap-1">
                      <Disc3 className="w-3 h-3 animate-spin" /> DJ
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {/* Chat Messages Body (Matching Image 1) */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-2 text-zinc-500">
                <MessageSquare className="w-10 h-10 opacity-30 text-purple-400" />
                <p className="text-sm font-bold text-zinc-300">No messages yet</p>
                <p className="text-xs text-zinc-500">Start the conversation!</p>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${
                    m.isSystem ? 'items-center text-zinc-400 italic py-1 text-center' : 'items-start'
                  }`}
                >
                  {!m.isSystem && (
                    <span className="text-[10px] font-bold text-purple-400 mb-0.5">
                      {m.sender}
                    </span>
                  )}
                  <span
                    className={`${
                      m.isSystem
                        ? 'text-[11px] glass-panel-subtle px-3 py-1 rounded-full border border-white/10'
                        : 'glass-card border-white/10 text-zinc-100 px-3 py-1.5 rounded-2xl max-w-[90%]'
                    }`}
                  >
                    {m.text}
                  </span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Chat Emoji Picker Popup */}
          {isEmojiPickerOpen && (
            <div className="p-2 border-t border-white/10 bg-black/60 flex items-center justify-around gap-1">
              {quickChatEmojis.map((em) => (
                <button
                  key={em}
                  onClick={() => {
                    setChatInput((prev) => prev + em);
                    setIsEmojiPickerOpen(false);
                  }}
                  className="text-base hover:scale-125 transition-transform p-1"
                >
                  {em}
                </button>
              ))}
            </div>
          )}

          {/* Chat Input Bar (Matching Image 1) */}
          <form
            onSubmit={handleSendChat}
            className="p-2.5 border-t border-white/10 bg-black/40 flex items-center gap-1.5 shrink-0"
          >
            <button
              type="button"
              onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
              className="p-2 rounded-xl text-zinc-400 hover:text-white glass-button transition-colors"
              title="Add Emoji"
            >
              <Smile className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 glass-input rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
            />

            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-md active:scale-95 disabled:opacity-40"
              title="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </aside>
      </main>

      {/* Direct YouTube Modal in Room */}
      <YouTubeModal
        isOpen={isYouTubeModalOpen}
        onClose={() => setIsYouTubeModalOpen(false)}
      />

      {/* Spotify Import Modal */}
      <SpotifyImportModal
        isOpen={isSpotifyModalOpen}
        onClose={() => setIsSpotifyModalOpen(false)}
      />

      {/* Scan QR Code Modal */}
      <QRCodeModal
        isOpen={isQRModalOpen}
        onClose={() => setIsQRModalOpen(false)}
        roomCode={roomState.roomCode}
      />
    </div>
  );
};
