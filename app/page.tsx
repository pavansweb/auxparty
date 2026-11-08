'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useStore } from '@/lib/store';
import type { Track, AudioQuality } from '@/lib/tracks';
import { TrackCard } from '@/components/Discovery/TrackCard';
import { RoomHeader } from '@/components/Room/RoomHeader';
import { QueueDrawer } from '@/components/Room/QueueDrawer';
import { ChatPanel } from '@/components/Room/ChatPanel';
import { PlayerBar } from '@/components/AudioPlayer/PlayerBar';
import { AudioVisualizer } from '@/components/Visualizer/AudioVisualizer';
import { AmbientBackground } from '@/components/Visualizer/AmbientBackground';
import { AutoplayBanner } from '@/components/Room/AutoplayBanner';
import {
  AudioLines,
  Search,
  Radio,
  Library,
  Compass,
  Heart,
  Plus,
  Play,
  Share2,
  Music2,
  LoaderCircle,
  X,
  MoreHorizontal,
  Waves,
  Check,
} from 'lucide-react';

const demoUsers = [
  { id: 'u1', name: 'maya', avatar: 'https://i.pravatar.cc/80?img=47' },
  { id: 'u2', name: 'leo', avatar: 'https://i.pravatar.cc/80?img=12' },
  { id: 'u3', name: 'sasha', avatar: 'https://i.pravatar.cc/80?img=44' },
];

export default function Home() {
  const state = useStore();

  const [query, setQuery] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'queue' | 'chat'>('queue');
  const [message, setMessage] = useState('');
  const [mobilePanel, setMobilePanel] = useState(false);
  const [toast, setToast] = useState('');
  const [roomCode, setRoomCode] = useState('WAVE-7K2');
  const [name, setName] = useState('Alex');

  const audioRef = useRef<HTMLAudioElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitRef = useRef(0);

  const tracks = state.tracks;
  const current = state.current;
  const queue = state.queue;
  const room = state.room;
  const listeners = room?.users && room.users.length > 0 ? room.users : demoUsers;

  const isHost = Boolean(room?.hostId && socketRef.current?.id === room.hostId);
  const isHostOrDj = Boolean(
    socketRef.current?.id &&
      (socketRef.current.id === room?.hostId || socketRef.current.id === room?.djId)
  );

  // 1. Fetch catalog tracks
  const fetchTracks = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/saavn?query=${encodeURIComponent(q)}`);
      const data = await res.json();
      state.setTracks(data.tracks || []);
    } catch {
      setError('Could not load tracks. Showing demo library.');
    } finally {
      setLoading(false);
    }
  }, [state]);

  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  // 2. Query search debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchTracks(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchTracks]);

  // 3. Room initialization from URL or localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const savedRoom = localStorage.getItem('syncwave_room');
    const initialRoom = (
      params.get('room') ||
      savedRoom ||
      `WAVE-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    ).toUpperCase();

    setRoomCode(initialRoom);
    localStorage.setItem('syncwave_room', initialRoom);

    const savedName = localStorage.getItem('syncwave_name');
    if (savedName) setName(savedName);
  }, []);

  useEffect(() => {
    localStorage.setItem('syncwave_room', roomCode);
  }, [roomCode]);

  // 4. Socket.IO connection & High-Precision NTP Clock Sync
  useEffect(() => {
    const socket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      state.setUser(socket.id || '', name);
      socket.emit('room:join', {
        roomId: roomCode,
        name,
        avatar: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(name)}`,
      });

      // Trigger initial clock sync
      socket.emit('sync:ping', { clientTime: Date.now() });
    });

    // NTP Pong handler: calculate Round-Trip Time (RTT) and clock offset
    socket.on('sync:pong', (data: { clientTime: number; serverTime: number }) => {
      const clientReceiveTime = Date.now();
      const rtt = clientReceiveTime - (data.clientTime || 0);
      // offset = (serverTime - clientTime) + (RTT / 2)
      const offset = (data.serverTime - data.clientTime) + (rtt / 2);
      state.setClockOffset(offset, rtt);
    });

    socket.on('room:state', (roomData) => {
      state.setRoom(roomData);
    });

    socket.on('reaction', ({ emoji }: { emoji: string }) => {
      setToast(`${emoji} reaction in the room`);
      setTimeout(() => setToast(''), 1800);
    });

    socket.on('room:error', ({ message }: { message: string }) => {
      setError(message);
    });

    // Periodic NTP Ping Heartbeat every 6 seconds for sub-50ms sync accuracy
    const ntpInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('sync:ping', { clientTime: Date.now() });
      }
    }, 6000);

    return () => {
      clearInterval(ntpInterval);
      socket.emit('room:leave');
      socket.disconnect();
    };
  }, [roomCode, name]);

  // 5. Autoplay Unlock Handler
  const unlockAudio = () => {
    state.setIsAutoplayBlocked(false);
    state.setPlaying(true);
    const audio = audioRef.current;
    if (audio) {
      if (room?.isPlaying) {
        const elapsedSec = (Date.now() + state.clockOffset - room.lastUpdated) / 1000;
        audio.currentTime = Math.max(0, room.seekTime + elapsedSec);
      }
      audio.play().catch(() => {});
    }
  };

  // 6. Player event dispatcher
  const emitPlayer = (isPlaying = state.playing, seekTime = audioRef.current?.currentTime || 0, track = current) => {
    if (!track) return;
    lastEmitRef.current = Date.now();
    socketRef.current?.emit('player:state', {
      currentTrack: track,
      isPlaying,
      seekTime,
    });
  };

  const handlePlaybackStatus = useCallback((currentTime: number, isPlaying: boolean) => {
    if (!isHostOrDj && socketRef.current?.connected) {
      socketRef.current.emit('player:status', { currentTime, isPlaying });
    }
  }, [isHostOrDj]);

  const handlePlayPause = (isPlaying: boolean) => {
    if (!isHostOrDj) {
      setError(
        room?.mode === 'dj'
          ? 'Only the room DJ can control playback in DJ mode.'
          : 'Only the room host controls playback for the room. Use the volume slider to silence locally.'
      );
      return;
    }
    state.setPlaying(isPlaying);
    emitPlayer(isPlaying, audioRef.current?.currentTime || 0);
  };

  const handleSeek = (seekSeconds: number) => {
    if (!isHostOrDj) {
      setError(
        room?.mode === 'dj'
          ? 'Only the room DJ can seek playback in DJ mode.'
          : 'Only the room host can seek playback for the room.'
      );
      return;
    }
    state.setPosition(seekSeconds);
    lastEmitRef.current = Date.now();
    socketRef.current?.emit('player:seek', { seekTime: seekSeconds });
  };

  const playTrack = (t: Track) => {
    if (!isHostOrDj) {
      setError('Track added to queue! Only Host/DJ can interrupt current track.');
      addToQueue(t);
      return;
    }
    state.play(t);
    setError('');
    emitPlayer(true, 0, t);
  };

  const addToQueue = (t: Track) => {
    socketRef.current?.emit('room:queue:add', t);
    state.addQueue(t);
    setToast(`Added "${t.title}" to room queue`);
    setTimeout(() => setToast(''), 2200);
  };

  const removeFromQueue = (id: string) => {
    socketRef.current?.emit('room:queue:remove', id);
  };

  const handleNext = () => {
    if (isHostOrDj) {
      socketRef.current?.emit('player:next');
    } else {
      // In collaborative mode or for non-DJs, skipping is governed by voting
      handleVoteSkip();
    }
  };

  const handlePrevious = () => {
    if (!isHostOrDj) {
      setError('Only the room host/DJ can change tracks.');
      return;
    }
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      state.setPosition(0);
      socketRef.current?.emit('player:seek', { seekTime: 0 });
      return;
    }
    const idx = tracks.findIndex((t) => t.id === current?.id);
    if (tracks.length > 0) {
      playTrack(tracks[(idx - 1 + tracks.length) % tracks.length]);
    }
  };

  const handleVoteSkip = () => {
    socketRef.current?.emit('vote:skip');
  };

  const handleToggleMode = () => {
    if (!isHost) return;
    const newMode = room?.mode === 'dj' ? 'collaborative' : 'dj';
    socketRef.current?.emit('room:mode:set', { mode: newMode });
  };

  // 7. Spotify Playlist Importer
  const importPlaylist = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    setError('');
    try {
      const res = await fetch('/api/import-spotify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Playlist import failed.');

      if (Array.isArray(data.tracks)) {
        data.tracks.forEach((t: Track) => {
          socketRef.current?.emit('room:queue:add', t);
        });
      }
      setImportUrl('');
      setToast(`Imported ${data.count} tracks from ${data.name || 'playlist'}`);
      setTimeout(() => setToast(''), 3000);
    } catch (e: any) {
      setError(e.message || 'Playlist import failed.');
    } finally {
      setImporting(false);
    }
  };

  const sendMessage = (text = message) => {
    if (!text.trim()) return;
    socketRef.current?.emit('chat:send', { text: text.trim() });
    setMessage('');
  };

  const sendReaction = (emoji: string) => {
    socketRef.current?.emit('reaction', emoji);
  };

  const shareRoom = async () => {
    try {
      const url = `${window.location.origin}/?room=${roomCode}`;
      await navigator.clipboard.writeText(url);
      setToast('Room invite link copied to clipboard!');
      setTimeout(() => setToast(''), 2000);
    } catch {
      setToast(`Room code: ${roomCode}`);
      setTimeout(() => setToast(''), 2000);
    }
  };

  return (
    <main className="app-shell">
      {/* Dynamic Ambient Background Glow */}
      <AmbientBackground imageUrl={current?.image} />

      {/* Browser Autoplay Blocked Banner */}
      {state.isAutoplayBlocked && (
        <AutoplayBanner currentTrack={current} onUnlock={unlockAudio} />
      )}

      {/* Left Sidebar */}
      <aside className="sidebar">
        <a className="brand" href="#">
          <span className="brand-icon">
            <AudioLines size={22} />
          </span>
          <span>
            sync<span className="brand-light">wave</span>
          </span>
        </a>

        <div className="nav-label">MENU</div>
        <nav className="nav-list">
          <a className="nav-item active">
            <Compass size={18} />
            Discover
          </a>
          <a className="nav-item">
            <Radio size={18} />
            Party rooms
            <span className="nav-count">1</span>
          </a>
          <a className="nav-item">
            <Library size={18} />
            Your library
          </a>
          <a className="nav-item">
            <Heart size={18} />
            Liked songs
          </a>
        </nav>

        <div className="library-head">
          <span className="nav-label">YOUR PLAYLISTS</span>
          <button className="tiny-icon" aria-label="Add playlist">
            <Plus size={17} />
          </button>
        </div>
        <div className="playlist-list">
          <div>
            <span className="playlist-dot green" />
            Late night drives
          </div>
          <div>
            <span className="playlist-dot pink" />
            Sunday reset
          </div>
          <div>
            <span className="playlist-dot blue" />
            Soft focus
          </div>
          <div>
            <span className="playlist-dot yellow" />
            On repeat
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="tiny-wave">
            <Waves size={17} />
          </div>
          <div>
            <b>Music sounds better together.</b>
            <span>Invite someone to your room</span>
          </div>
          <button className="small-pill" onClick={shareRoom}>
            Invite
          </button>
        </div>
      </aside>

      {/* Main Center Column */}
      <section className="center-column">
        {/* Topbar */}
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-icon">
              <AudioLines size={18} />
            </span>
            syncwave
          </div>

          <div className="search-box">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What do you want to listen to?"
            />
            <kbd>⌘ K</kbd>
          </div>

          <div className="top-actions">
            <button className="room-badge" onClick={() => setMobilePanel(true)}>
              <span className="live-dot" /> {roomCode}
              <span className="badge-users">{listeners.length}</span>
            </button>
            <button className="avatar-button" title="Your profile">
              {name.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>

        {/* Scrollable Feed */}
        <div className="feed-scroll">
          <div className="greeting-row">
            <div>
              <p className="eyebrow">AUXPARTY · SYNCWAVE</p>
              <h1>
                Good evening, {name} <span>✦</span>
              </h1>
              <p className="subheading">
                Sub-50ms synchronized listening with 320kbps audio.
              </p>
            </div>
            <button className="circle-muted" aria-label="More options">
              <MoreHorizontal size={20} />
            </button>
          </div>

          {/* Hero Banner with Integrated Audio Visualizer */}
          <section className="hero">
            <div className="hero-glow" />
            <div className="hero-copy">
              <span className="hero-kicker">
                <span className="live-dot" /> YOUR ROOM IS LIVE
              </span>
              <h2>
                Good music.
                <br />
                <em>Good company.</em>
              </h2>
              <p>
                You and {listeners.length} friends are synced lockstep in {roomCode}.
              </p>

              <div className="hero-bottom">
                <button className="hero-cta" onClick={() => setMobilePanel(true)}>
                  Open your room <span>↗</span>
                </button>
                <div className="avatar-stack">
                  {listeners.slice(0, 3).map((u, i) => (
                    <img key={u.id || i} src={u.avatar} alt="" />
                  ))}
                </div>
                <span className="friend-count">
                  +{Math.max(0, listeners.length - 3)}
                </span>
              </div>
            </div>

            <div className="hero-art">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="hero-disc">
                <div className="disc-label">
                  <AudioLines size={23} />
                </div>
              </div>
              <span className="float-note note-a">♪</span>
              <span className="float-note note-b">♫</span>
              <span className="hero-spark">✳</span>
            </div>

            {/* Embedded Live Frequency Visualizer in Hero */}
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                right: '24px',
                zIndex: 3,
                opacity: 0.85,
              }}
            >
              <AudioVisualizer
                audioRef={audioRef}
                isPlaying={state.playing}
                width={190}
                height={38}
              />
            </div>

            <div className="hero-index">
              01 <span>/ 03</span>
            </div>
          </section>

          {/* Spotify Concurrent Importer Box */}
          <div className="spotify-import">
            <div className="import-icon">
              <Music2 size={19} />
            </div>
            <div className="import-copy">
              <b>Bring your playlist</b>
              <span>Fast parallel Spotify scraping & matching</span>
            </div>
            <div className="import-control">
              <input
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && importPlaylist()}
                placeholder="Paste public Spotify Playlist Link..."
              />
              <button onClick={importPlaylist} disabled={importing}>
                {importing ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  'Import'
                )}
                <span className="import-arrow">↗</span>
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="error-banner">
              <span>{error}</span>
              <button onClick={() => setError('')} aria-label="Dismiss">
                <X size={15} />
              </button>
            </div>
          )}

          {/* Track Discovery Grid */}
          <section className="section-block">
            <div className="section-heading">
              <div>
                <p className="eyebrow">MADE FOR THIS MOMENT</p>
                <h2>{query ? `Results for “${query}”` : 'The daily mix'}</h2>
              </div>
              <button className="see-all" onClick={() => fetchTracks(query)}>
                Refresh <span>→</span>
              </button>
            </div>

            <div className="track-grid">
              {loading
                ? Array.from({ length: 4 }, (_, i) => (
                    <div className="track-skeleton" key={i} />
                  ))
                : tracks.slice(0, 8).map((t, i) => (
                    <TrackCard
                      key={t.id}
                      track={t}
                      index={i}
                      isCurrent={current?.id === t.id}
                      isPlaying={state.playing}
                      onPlay={playTrack}
                      onAddToQueue={addToQueue}
                    />
                  ))}
            </div>
          </section>

          {/* Fresh Picks Section */}
          <section className="section-block fresh-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">A FEW GOOD RECORDS</p>
                <h2>Made for the long way home</h2>
              </div>
              <button className="see-all">
                Explore <span>→</span>
              </button>
            </div>
            <div className="album-row">
              {tracks.slice(2, 6).map((t, i) => (
                <button
                  className="album-tile"
                  key={t.id}
                  onClick={() => playTrack(t)}
                >
                  <img src={t.image} alt="" />
                  <div>
                    <b>{['After hours', 'The slow down', 'No rush', 'Golden'][i]}</b>
                    <span>
                      {t.artist} · {t.album}
                    </span>
                  </div>
                  <Play size={16} />
                </button>
              ))}
            </div>
          </section>

          <footer className="feed-footer">
            <span>Made for the moments in between. AuxParty SyncWave.</span>
            <span>SYNCWAVE © 2026</span>
          </footer>
        </div>
      </section>

      {/* Right Room Panel / Drawer */}
      <aside className={`room-panel ${mobilePanel ? 'mobile-open' : ''}`}>
        <RoomHeader
          roomCode={roomCode}
          listeners={listeners}
          tab={tab}
          queueCount={queue.length}
          isHost={isHost}
          mode={room?.mode}
          onCloseMobile={() => setMobilePanel(false)}
          onShare={shareRoom}
          onTabChange={setTab}
          onToggleMode={handleToggleMode}
        />

        {tab === 'queue' ? (
          <QueueDrawer
            current={current}
            queue={queue}
            skipVotes={room?.skipVotes}
            activeUsersCount={listeners.length}
            myUserId={socketRef.current?.id}
            isHostOrDj={isHostOrDj}
            mode={room?.mode}
            onRemove={removeFromQueue}
            onVoteSkip={handleVoteSkip}
            onSwitchToChat={() => setTab('chat')}
            onFindSongs={() => {
              document.querySelector<HTMLInputElement>('.search-box input')?.focus();
            }}
          />
        ) : (
          <ChatPanel
            messages={room?.messages || []}
            messageText={message}
            onMessageChange={setMessage}
            onSendMessage={sendMessage}
            onSendReaction={sendReaction}
          />
        )}

        <div className="room-footer">
          <span>
            <span className="sync-dot" />
            SYNC ACTIVE
          </span>
          <b>±{Math.abs(state.clockOffset) < 50 ? '0.02s' : `${(Math.abs(state.clockOffset) / 1000).toFixed(2)}s`}</b>
          <button onClick={() => setMobilePanel(!mobilePanel)}>
            Close details
          </button>
        </div>
      </aside>

      {/* Player Bar */}
      <PlayerBar
        current={current}
        isPlaying={state.playing}
        position={state.position}
        duration={state.duration}
        volume={state.volume}
        audioQuality={state.audioQuality}
        clockOffset={state.clockOffset}
        rtt={state.rtt}
        room={room}
        isHostOrDj={isHostOrDj}
        onPlayPause={handlePlayPause}
        onSeek={handleSeek}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onVolumeChange={state.setVolume}
        onQualityChange={state.setAudioQuality}
        onOpenMobilePanel={() => setMobilePanel(true)}
        onAutoplayBlocked={() => state.setIsAutoplayBlocked(true)}
        onPositionUpdate={state.setPosition}
        onDurationUpdate={state.setDuration}
        onPlaybackStatus={handlePlaybackStatus}
        audioRef={audioRef}
      />

      {/* Toast Feedback */}
      {toast && (
        <div className="toast">
          <Check size={15} />
          {toast}
        </div>
      )}
    </main>
  );
}
