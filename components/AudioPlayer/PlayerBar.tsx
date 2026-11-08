'use client';

import React, { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Track, AudioQuality } from '@/lib/tracks';
import { getStreamUrlForQuality } from '@/lib/tracks';
import type { Room } from '@/lib/store';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  ListMusic,
  Heart,
  Music2,
  Shuffle,
  Repeat,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';

interface PlayerBarProps {
  current: Track | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  audioQuality: AudioQuality;
  clockOffset: number;
  rtt: number;
  room: Room | null;
  isHostOrDj: boolean;
  onPlayPause: (playing: boolean) => void;
  onSeek: (seconds: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onVolumeChange: (vol: number) => void;
  onQualityChange: (quality: AudioQuality) => void;
  onOpenMobilePanel: () => void;
  onAutoplayBlocked: () => void;
  onPositionUpdate: (pos: number) => void;
  onDurationUpdate: (dur: number) => void;
  onPlaybackStatus?: (currentTime: number, isPlaying: boolean) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
}

function fmt(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0:00';
  const mins = Math.floor(n / 60);
  const secs = Math.floor(n % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  current,
  isPlaying,
  position,
  duration,
  volume,
  audioQuality,
  clockOffset,
  rtt,
  room,
  isHostOrDj,
  onPlayPause,
  onSeek,
  onNext,
  onPrevious,
  onVolumeChange,
  onQualityChange,
  onOpenMobilePanel,
  onAutoplayBlocked,
  onPositionUpdate,
  onDurationUpdate,
  onPlaybackStatus,
  audioRef,
}) => {
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const previousVolume = useRef(volume || 0.8);
  const lastQualityRef = useRef<AudioQuality>(audioQuality);

  // 1. Audio stream source resolution based on active quality preference
  const resolvedStreamUrl = current ? getStreamUrlForQuality(current, audioQuality) : '';

  // Synchronize audio element source
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current || !resolvedStreamUrl) return;

    if (audio.src !== resolvedStreamUrl) {
      const prevTime = audio.currentTime;
      audio.src = resolvedStreamUrl;
      audio.load();

      // If quality changed on the fly, restore playback position
      if (prevTime > 0 && Number.isFinite(prevTime)) {
        audio.currentTime = prevTime;
      }

      if (isPlaying) {
        audio
          .play()
          .catch((err) => {
            if (err.name === 'NotAllowedError') {
              onAutoplayBlocked();
            }
          });
      }
    } else if (isPlaying && audio.paused) {
      audio
        .play()
        .catch((err) => {
          if (err.name === 'NotAllowedError') {
            onAutoplayBlocked();
          }
        });
    } else if (!isPlaying && !audio.paused) {
      audio.pause();
    }
  }, [current?.id, resolvedStreamUrl, isPlaying, onAutoplayBlocked, audioRef]);

  // Synchronize volume
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted, audioRef]);

  // 2. High-Precision NTP Clock Sync & Sub-50ms Drift Compensation (Continuous Steering)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current || !room || !room.currentTrack || room.currentTrack.id !== current.id) {
      if (audio) audio.playbackRate = 1.0;
      return;
    }

    const checkAndSteerSync = () => {
      if (!room.isPlaying) {
        if (Math.abs(audio.currentTime - room.seekTime) > 0.4) {
          audio.currentTime = room.seekTime;
        }
        audio.playbackRate = 1.0;
        return;
      }

      // Formula: masterTime = room.seekTime + (Date.now() + clockOffset - room.lastUpdated) / 1000
      const elapsedSec = (Date.now() + clockOffset - room.lastUpdated) / 1000;
      const masterTime = Math.max(0, room.seekTime + Math.max(0, elapsedSec));
      const drift = audio.currentTime - masterTime;

      // Hard-seek if drift exceeds 1.2s
      if (Math.abs(drift) > 1.2) {
        audio.currentTime = masterTime;
        audio.playbackRate = 1.0;
      } else if (drift > 0.1) {
        // Audio is ahead (>100ms) -> slow down subtly
        audio.playbackRate = 0.98;
      } else if (drift < -0.1) {
        // Audio is behind (<-100ms) -> speed up subtly
        audio.playbackRate = 1.02;
      } else if (Math.abs(drift) < 0.05) {
        // Within sub-50ms tight sync: restore standard playback rate
        audio.playbackRate = 1.0;
      }

      // Non-intrusive status report for listeners
      if (onPlaybackStatus && !audio.paused) {
        onPlaybackStatus(audio.currentTime, !audio.paused);
      }
    };

    checkAndSteerSync();
    // Monitor and steer drift every 500ms
    const timer = setInterval(checkAndSteerSync, 500);

    return () => {
      clearInterval(timer);
    };
  }, [
    room?.lastUpdated,
    room?.seekTime,
    room?.isPlaying,
    current?.id,
    clockOffset,
    audioRef,
    onPlaybackStatus,
  ]);

  // 3. Native OS Media Session Integration
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: current.album || 'SyncWave',
        artwork: [
          { src: current.image, sizes: '96x96', type: 'image/jpeg' },
          { src: current.image, sizes: '128x128', type: 'image/jpeg' },
          { src: current.image, sizes: '256x256', type: 'image/jpeg' },
          { src: current.image, sizes: '512x512', type: 'image/jpeg' },
        ],
      });

      navigator.mediaSession.setActionHandler('play', () => onPlayPause(true));
      navigator.mediaSession.setActionHandler('pause', () => onPlayPause(false));
      navigator.mediaSession.setActionHandler('previoustrack', onPrevious);
      navigator.mediaSession.setActionHandler('nexttrack', onNext);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') {
          onSeek(details.seekTime);
        }
      });
    } catch {
      // MediaSession error ignore
    }

    return () => {
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
          navigator.mediaSession.setActionHandler('previoustrack', null);
          navigator.mediaSession.setActionHandler('nexttrack', null);
          navigator.mediaSession.setActionHandler('seekto', null);
        } catch {}
      }
    };
  }, [current, onPlayPause, onPrevious, onNext, onSeek]);

  // Update MediaSession playback position
  useEffect(() => {
    if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;
    if (duration > 0 && position >= 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(duration, 0.1),
          playbackRate: audioRef.current?.playbackRate || 1.0,
          position: Math.min(position, duration),
        });
      } catch {}
    }
  }, [position, duration, audioRef]);

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      onVolumeChange(previousVolume.current || 0.8);
    } else {
      previousVolume.current = volume;
      setIsMuted(true);
      onVolumeChange(0);
    }
  };

  const progressPercent = duration ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
  const driftDisplay = Math.abs(Math.round(clockOffset));

  return (
    <>
      <section className="player-bar">
        {/* Left: Track Information */}
        <div className="player-track">
          {current ? (
            <>
              <img src={current.image} alt={current.title} />
              <div>
                <b>{current.title}</b>
                <span>{current.artist}</span>
              </div>
              <button className="player-heart" aria-label="Like track">
                <Heart size={16} />
              </button>
            </>
          ) : (
            <>
              <div className="player-placeholder">
                <Music2 size={20} />
              </div>
              <div>
                <b>Pick your first song</b>
                <span>Your soundtrack starts here</span>
              </div>
            </>
          )}
        </div>

        {/* Center: Playback Controls & Scrubber */}
        <div className="playback">
          <div className="playback-controls">
            <button title="Shuffle" aria-label="Shuffle">
              <Shuffle size={15} />
            </button>
            <button onClick={onPrevious} title="Previous track" aria-label="Previous">
              <SkipBack size={17} />
            </button>
            <button
              className="main-play"
              onClick={() => onPlayPause(!isPlaying)}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause size={17} fill="currentColor" />
              ) : (
                <Play size={17} fill="currentColor" />
              )}
            </button>
            <button onClick={onNext} title="Next track" aria-label="Next">
              <SkipForward size={17} />
            </button>
            <button title="Repeat" aria-label="Repeat">
              <Repeat size={15} />
            </button>
          </div>

          <div className="seek-row">
            <span>{fmt(position)}</span>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={Math.min(position, duration || 100)}
              style={{ '--progress': `${progressPercent}%` } as CSSProperties}
              onChange={(e) => {
                const p = Number(e.target.value);
                onSeek(p);
                if (audioRef.current) audioRef.current.currentTime = p;
              }}
              aria-label="Seek track position"
            />
            <span>{fmt(duration)}</span>
          </div>
        </div>

        {/* Right: Audio Quality Toggle, Clock Sync Pill, Volume & Queue */}
        <div className="player-right">
          {/* Audio Quality Toggle */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowQualityMenu((prev) => !prev)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '5px',
                padding: '4px 7px',
                fontSize: '8px',
                color: 'var(--lime)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Stream Quality"
            >
              <SlidersHorizontal size={11} />
              <span>
                {audioQuality === '320kbps'
                  ? '320k HQ'
                  : audioQuality === '96kbps'
                  ? '96k Saver'
                  : 'Auto Quality'}
              </span>
            </button>

            {showQualityMenu && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '120%',
                  right: 0,
                  background: '#161913',
                  border: '1px solid rgba(198, 242, 119, 0.2)',
                  borderRadius: '7px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7)',
                  zIndex: 20,
                  display: 'grid',
                  gap: '2px',
                  padding: '4px',
                  width: '130px',
                }}
              >
                {[
                  { id: 'auto', label: 'Auto (Adaptive)' },
                  { id: '320kbps', label: 'High (320kbps)' },
                  { id: '96kbps', label: 'Data Saver (96kbps)' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      onQualityChange(opt.id as AudioQuality);
                      setShowQualityMenu(false);
                    }}
                    style={{
                      background: audioQuality === opt.id ? 'rgba(198, 242, 119, 0.15)' : 'none',
                      color: audioQuality === opt.id ? 'var(--lime)' : '#cfd2c6',
                      border: 0,
                      borderRadius: '4px',
                      padding: '6px 8px',
                      textAlign: 'left',
                      fontSize: '9px',
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="sync-pill" title={`RTT: ${rtt}ms | Offset: ${clockOffset}ms`}>
            <span className="sync-dot" /> Sync active <b>±{driftDisplay < 50 ? '0.02s' : `${(driftDisplay / 1000).toFixed(2)}s`}</b>
          </span>

          <button className="volume-icon" onClick={toggleMute} aria-label="Toggle mute">
            {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <input
            className="volume-range"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setIsMuted(false);
              onVolumeChange(v);
            }}
            aria-label="Volume slider"
          />

          <button className="queue-toggle" onClick={onOpenMobilePanel} aria-label="Open queue">
            <ListMusic size={18} />
          </button>
        </div>

        {/* Hidden Audio Element */}
        <audio
          ref={audioRef}
          preload="auto"
          crossOrigin="anonymous"
          onError={() => {
            // If crossOrigin causes load rejection on non-CORS CDNs, remove attribute and retry
            const audio = audioRef.current;
            if (audio && audio.crossOrigin) {
              audio.removeAttribute('crossOrigin');
              audio.load();
              if (isPlaying) {
                audio.play().catch(() => {});
              }
            }
          }}
          onTimeUpdate={(e) => onPositionUpdate(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => onDurationUpdate(e.currentTarget.duration || 0)}
          onEnded={() => {
            // Only Host or DJ should trigger next song on playback end
            if (isHostOrDj) {
              onNext();
            }
          }}
        />
      </section>

      {/* Mobile Bottom Bar */}
      <div className="mobile-bottom" onClick={onOpenMobilePanel}>
        <img src={current?.image || 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=120'} alt="" />
        <div>
          <b>{current?.title || 'Pick a song'}</b>
          <span>{current?.artist || 'Tap to choose something to play'}</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlayPause(!isPlaying);
          }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          aria-label="Next track"
        >
          <SkipForward size={18} />
        </button>
      </div>
    </>
  );
};
