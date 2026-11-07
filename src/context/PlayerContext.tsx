import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Track, PlayMode } from '../types';
import { getRecommendedTracks } from '../services/api';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface PlayerContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  isMuted: boolean;
  playMode: PlayMode;
  isShuffle: boolean;
  isAutoplay: boolean;
  isAutoplayBlocked: boolean;
  resumeAutoplay: () => void;
  queue: Track[];
  history: Track[];
  autoplayTrack: Track | null; // Next Up preview track for YouTube autoplay
  analyserNode: AnalyserNode | null;
  isLoading: boolean;
  audioRef: React.RefObject<HTMLAudioElement>;
  playTrack: (track: Track, newQueue?: Track[]) => void;
  togglePlayPause: () => void;
  seekTo: (time: number) => void;
  seekRelative: (deltaSeconds: number) => void;
  setVolume: (val: number) => void;
  toggleMute: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  toggleShuffle: () => void;
  toggleAutoplay: () => void;
  cyclePlayMode: () => void;
  syncFromHost: (
    track: Track | null,
    isPlaying: boolean,
    position: number,
    timestamp: number,
    queue?: Track[]
  ) => void;
  onStateChangeNotify?: (track: Track | null, isPlaying: boolean, pos: number, queue: Track[]) => void;
  setOnStateChangeNotify: (cb: (track: Track | null, isPlaying: boolean, pos: number, queue: Track[]) => void) => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  // YouTube Player Ref & Container
  const ytPlayerRef = useRef<any>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isYtReady, setIsYtReady] = useState(false);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [buffered, setBuffered] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playMode, setPlayMode] = useState<PlayMode>('none');
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [isAutoplay, setIsAutoplay] = useState<boolean>(true);
  const [queue, setQueue] = useState<Track[]>([]);
  const [history, setHistory] = useState<Track[]>([]);
  const [autoplayPool, setAutoplayPool] = useState<Track[]>([]);
  const [autoplayTrack, setAutoplayTrack] = useState<Track | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState<boolean>(false);

  const currentTrackRef = useRef<Track | null>(currentTrack);
  currentTrackRef.current = currentTrack;

  const resumeAutoplay = useCallback(() => {
    setIsAutoplayBlocked(false);
    if (isYouTubeTrack(currentTrackRef.current)) {
      ytPlayerRef.current?.playVideo?.();
    } else if (audioRef.current && currentTrackRef.current) {
      audioRef.current.play().catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (!isAutoplayBlocked) return;
    const onClick = () => {
      resumeAutoplay();
    };
    window.addEventListener('click', onClick, { once: true });
    window.addEventListener('keydown', onClick, { once: true });
    return () => {
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onClick);
    };
  }, [isAutoplayBlocked, resumeAutoplay]);

  // Callback to inform RoomSync when host performs an action
  const stateNotifierRef = useRef<((t: Track | null, playing: boolean, pos: number, q: Track[]) => void) | null>(null);

  const setOnStateChangeNotify = (cb: (t: Track | null, playing: boolean, pos: number, q: Track[]) => void) => {
    stateNotifierRef.current = cb;
  };

  const notifyHostStateChange = (t: Track | null, p: boolean, pos: number, q: Track[]) => {
    stateNotifierRef.current?.(t, p, pos, q);
  };

  // Helper: check if a track is a YouTube track
  const isYouTubeTrack = (track: Track | null): boolean => {
    if (!track) return false;
    return Boolean(track.youtubeId || track.source === 'youtube');
  };

  // 1. Initialize YouTube Iframe API
  useEffect(() => {
    const initYT = () => {
      if (window.YT && window.YT.Player) {
        try {
          ytPlayerRef.current = new window.YT.Player('auxparty-yt-iframe', {
            height: '100%',
            width: '100%',
            playerVars: {
              autoplay: 0,
              controls: 0,
              disablekb: 1,
              enablejsapi: 1,
              fs: 0,
              modestbranding: 1,
              playsinline: 1,
              rel: 0,
              origin: window.location.origin,
            },
            events: {
              onReady: () => {
                setIsYtReady(true);
                ytPlayerRef.current?.setVolume(volume * 100);
              },
              onStateChange: (event: any) => {
                // YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 video cued
                if (event.data === 1) {
                  setIsPlaying(true);
                  setIsLoading(false);
                } else if (event.data === 2) {
                  setIsPlaying(false);
                } else if (event.data === 3) {
                  setIsLoading(true);
                } else if (event.data === 0) {
                  setIsPlaying(false);
                  handleTrackEnded();
                }
              },
              onError: (err: any) => {
                console.warn('YouTube Player error code:', err.data);
                setIsLoading(false);
                // On unplayable video, auto skip next
                nextTrack();
              },
            },
          });
        } catch (e) {
          console.error('Failed to construct YT Player:', e);
        }
      }
    };

    if (window.YT && window.YT.Player) {
      initYT();
    } else {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = initYT;
    }

    return () => {
      if (ytTimerRef.current) clearInterval(ytTimerRef.current);
    };
  }, []);

  // 2. Poll YouTube Player for current time & duration when playing a YT track
  useEffect(() => {
    if (ytTimerRef.current) clearInterval(ytTimerRef.current);

    if (isYouTubeTrack(currentTrack)) {
      ytTimerRef.current = setInterval(() => {
        const player = ytPlayerRef.current;
        if (player && typeof player.getCurrentTime === 'function') {
          try {
            const time = player.getCurrentTime() || 0;
            const dur = player.getDuration() || 0;
            const loaded = player.getVideoLoadedFraction() || 0;
            setCurrentTime(time);
            if (dur > 0) setDuration(dur);
            setBuffered(loaded * dur);
          } catch (e) {
            // Player might be switching states
          }
        }
      }, 300);
    }

    return () => {
      if (ytTimerRef.current) clearInterval(ytTimerRef.current);
    };
  }, [currentTrack]);

  // 3. Initialize HTML5 Audio element and Web Audio API Analyser
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audio.volume = volume;
    audioRef.current = audio;

    const setupAudioGraph = () => {
      if (!audioContextRef.current) {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.8;

          const source = ctx.createMediaElementSource(audio);
          source.connect(analyser);
          analyser.connect(ctx.destination);

          audioContextRef.current = ctx;
          analyserRef.current = analyser;
          sourceNodeRef.current = source;
        } catch (e) {
          console.warn('AudioContext setup skipped or restricted:', e);
        }
      } else if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };

    const handleTimeUpdate = () => {
      if (!isYouTubeTrack(currentTrackRef.current)) {
        setCurrentTime(audio.currentTime);
        if (audio.buffered.length > 0) {
          setBuffered(audio.buffered.end(audio.buffered.length - 1));
        }
      }
    };

    const handleLoadedMetadata = () => {
      if (!isYouTubeTrack(currentTrackRef.current)) {
        setDuration(audio.duration || 0);
        setIsLoading(false);
      }
    };

    const handleWaiting = () => {
      if (!isYouTubeTrack(currentTrackRef.current)) setIsLoading(true);
    };
    const handleCanPlay = () => {
      if (!isYouTubeTrack(currentTrackRef.current)) setIsLoading(false);
    };
    const handlePlaying = () => {
      if (!isYouTubeTrack(currentTrackRef.current)) {
        setIsPlaying(true);
        setIsLoading(false);
      }
    };
    const handlePause = () => {
      if (!isYouTubeTrack(currentTrackRef.current)) setIsPlaying(false);
    };

    const handleEnded = () => {
      if (!isYouTubeTrack(currentTrackRef.current)) {
        handleTrackEnded();
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    window.addEventListener('click', setupAudioGraph, { once: true });

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      window.removeEventListener('click', setupAudioGraph);
    };
  }, []);

  // 4. Pre-fetch Autoplay Recommendations whenever currentTrack changes
  useEffect(() => {
    let isCancelled = false;
    if (!currentTrack) {
      setAutoplayTrack(null);
      return;
    }

    const fetchNext = async () => {
      try {
        const results = await getRecommendedTracks(
          currentTrack.artist,
          currentTrack.title,
          currentTrack.id
        );
        if (isCancelled) return;

        // Filter out current track and recently played tracks
        const historyIds = new Set(history.map((h) => h.id));
        const filtered = results.filter((t) => t.id !== currentTrack.id && !historyIds.has(t.id));

        const pool = filtered.length > 0 ? filtered : results;
        setAutoplayPool(pool);
        if (pool.length > 0) {
          setAutoplayTrack(pool[0]);
        }
      } catch (e) {
        console.error('Failed to prefetch autoplay recommendations:', e);
      }
    };

    fetchNext();

    return () => {
      isCancelled = true;
    };
  }, [currentTrack?.id, currentTrack?.artist]);

  // 5. Track Ended Handler (Repeat One, Queue, or YouTube-style Autoplay)
  const handleTrackEnded = () => {
    if (playMode === 'repeat-one') {
      if (isYouTubeTrack(currentTrack)) {
        ytPlayerRef.current?.seekTo(0, true);
        ytPlayerRef.current?.playVideo();
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
      return;
    }
    nextTrack();
  };

  // 6. MediaSession API Integration
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        artwork: [
          { src: currentTrack.image, sizes: '500x500', type: 'image/jpeg' },
          { src: currentTrack.image, sizes: '150x150', type: 'image/jpeg' },
        ],
      });

      navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
      navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) seekTo(details.seekTime);
      });
      navigator.mediaSession.setActionHandler('seekforward', () => seekRelative(10));
      navigator.mediaSession.setActionHandler('seekbackward', () => seekRelative(-10));
    }
  }, [currentTrack]);

  // Play a specific track
  const playTrack = (track: Track, newQueue?: Track[]) => {
    if (currentTrack) {
      setHistory((prev) => [currentTrack, ...prev.filter((h) => h.id !== currentTrack.id).slice(0, 24)]);
    }

    setCurrentTrack(track);
    setIsLoading(true);
    setCurrentTime(0);
    setBuffered(0);

    if (newQueue !== undefined) {
      setQueue(newQueue);
    }

    const updatedQueue = newQueue !== undefined ? newQueue : queue;

    if (isYouTubeTrack(track)) {
      // Pause HTML5 audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }

      const videoId = track.youtubeId || track.id.replace('yt-', '');
      const loadYt = () => {
        const player = ytPlayerRef.current;
        if (player && typeof player.loadVideoById === 'function') {
          player.loadVideoById({
            videoId: videoId,
            startSeconds: 0,
          });
          player.setVolume(volume * 100);
          if (isMuted) player.mute();
          else player.unMute();
          setIsPlaying(true);
          setIsLoading(false);
          notifyHostStateChange(track, true, 0, updatedQueue);
        } else {
          // Retry briefly if player is initializing
          setTimeout(loadYt, 200);
        }
      };
      loadYt();
    } else {
      // Pause YouTube player
      if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch (e) {}
      }

      if (audioRef.current) {
        const audio = audioRef.current;
        audio.src = track.streamUrl;
        audio.currentTime = 0;
        audio
          .play()
          .then(() => {
            setIsPlaying(true);
            setIsLoading(false);
            notifyHostStateChange(track, true, 0, updatedQueue);
          })
          .catch((e) => {
            console.error('Playback trigger error:', e);
            setIsLoading(false);
          });
      }
    }
  };

  // Toggle Play / Pause
  const togglePlayPause = () => {
    if (!currentTrack) return;

    if (isYouTubeTrack(currentTrack)) {
      const player = ytPlayerRef.current;
      if (player) {
        if (isPlaying) {
          player.pauseVideo?.();
          setIsPlaying(false);
          notifyHostStateChange(currentTrack, false, currentTime, queue);
        } else {
          player.playVideo?.();
          setIsPlaying(true);
          notifyHostStateChange(currentTrack, true, currentTime, queue);
        }
      }
    } else if (audioRef.current) {
      const audio = audioRef.current;
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
        notifyHostStateChange(currentTrack, false, audio.currentTime, queue);
      } else {
        audio
          .play()
          .then(() => {
            setIsPlaying(true);
            notifyHostStateChange(currentTrack, true, audio.currentTime, queue);
          })
          .catch(console.error);
      }
    }
  };

  // Seek To Absolute Time
  const seekTo = (time: number) => {
    const clamped = Math.max(0, Math.min(duration || 9999, time));
    setCurrentTime(clamped);

    if (isYouTubeTrack(currentTrack)) {
      ytPlayerRef.current?.seekTo?.(clamped, true);
    } else if (audioRef.current) {
      audioRef.current.currentTime = clamped;
    }
    notifyHostStateChange(currentTrack, isPlaying, clamped, queue);
  };

  // Relative Seek (e.g. +10s or -10s)
  const seekRelative = (deltaSeconds: number) => {
    seekTo(currentTime + deltaSeconds);
  };

  // Next Track (Guaranteed to work: pops queue OR triggers YouTube-style Autoplay)
  const nextTrack = () => {
    if (queue.length > 0) {
      let nextIndex = 0;
      if (isShuffle) {
        nextIndex = Math.floor(Math.random() * queue.length);
      }
      const next = queue[nextIndex];
      const newQueue = queue.filter((_, idx) => idx !== nextIndex);
      setQueue(newQueue);
      playTrack(next, newQueue);
      return;
    }

    // Queue is empty: Trigger YouTube-style Autoplay Next
    if (autoplayPool.length > 0) {
      const nextAutoplay = autoplayPool[0];
      const newPool = autoplayPool.slice(1);
      setAutoplayPool(newPool);
      setAutoplayTrack(newPool[0] || null);
      playTrack(nextAutoplay, []);
      return;
    }

    // Fallback: Repeat history or re-fetch trending
    if (history.length > 0) {
      const first = history[history.length - 1];
      playTrack(first, []);
    }
  };

  // Prev Track
  const prevTrack = () => {
    // If > 3 seconds in, restart track
    if (currentTime > 3) {
      seekTo(0);
      return;
    }

    if (history.length > 0) {
      const prev = history[0];
      setHistory((prevList) => prevList.slice(1));
      if (currentTrack) {
        setQueue((prevQ) => [currentTrack, ...prevQ]);
      }
      playTrack(prev);
    } else {
      seekTo(0);
    }
  };

  // Volume
  const setVolume = (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolumeState(clamped);

    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
    if (ytPlayerRef.current?.setVolume) {
      ytPlayerRef.current.setVolume(clamped * 100);
    }
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
      ytPlayerRef.current?.unMute?.();
    }
  };

  // Mute
  const toggleMute = () => {
    if (isMuted) {
      if (audioRef.current) audioRef.current.volume = volume;
      ytPlayerRef.current?.unMute?.();
      setIsMuted(false);
    } else {
      if (audioRef.current) audioRef.current.volume = 0;
      ytPlayerRef.current?.mute?.();
      setIsMuted(true);
    }
  };

  // Queue actions
  const addToQueue = (track: Track) => {
    if (!currentTrack) {
      playTrack(track);
      return;
    }
    setQueue((prev) => {
      const updated = [...prev, track];
      notifyHostStateChange(currentTrack, isPlaying, currentTime, updated);
      return updated;
    });
  };

  const removeFromQueue = (index: number) => {
    setQueue((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      notifyHostStateChange(currentTrack, isPlaying, currentTime, updated);
      return updated;
    });
  };

  const clearQueue = () => {
    setQueue([]);
    notifyHostStateChange(currentTrack, isPlaying, currentTime, []);
  };

  const toggleShuffle = () => setIsShuffle((prev) => !prev);
  const toggleAutoplay = () => setIsAutoplay((prev) => !prev);

  const cyclePlayMode = () => {
    setPlayMode((prev) => {
      if (prev === 'none') return 'repeat-all';
      if (prev === 'repeat-all') return 'repeat-one';
      return 'none';
    });
  };

  // Sync from Room Host (as a guest)
  const syncFromHost = (
    track: Track | null,
    hostPlaying: boolean,
    position: number,
    timestamp: number,
    hostQueue?: Track[]
  ) => {
    if (hostQueue !== undefined) {
      setQueue(hostQueue);
    }

    if (!track) {
      if (audioRef.current) audioRef.current.pause();
      ytPlayerRef.current?.pauseVideo?.();
      setIsPlaying(false);
      setCurrentTrack(null);
      return;
    }

    const latencySeconds = Math.max(0, (Date.now() - timestamp) / 1000);
    const targetTime = position + (hostPlaying ? latencySeconds : 0);

    const isDifferentTrack = !currentTrack || currentTrack.id !== track.id;

    if (isDifferentTrack) {
      setCurrentTrack(track);
      if (isYouTubeTrack(track)) {
        if (audioRef.current) audioRef.current.pause();
        const videoId = track.youtubeId || track.id.replace('yt-', '');
        const loadYtSync = () => {
          const player = ytPlayerRef.current;
          if (player && typeof player.loadVideoById === 'function') {
            player.loadVideoById({
              videoId: videoId,
              startSeconds: targetTime,
            });
            player.setVolume(volume * 100);
            if (isMuted) player.mute();
            else player.unMute();
            if (hostPlaying) {
              player.playVideo?.();
              setIsPlaying(true);
            } else {
              player.pauseVideo?.();
              setIsPlaying(false);
            }
            setIsLoading(false);
          } else {
            setTimeout(loadYtSync, 200);
          }
        };
        loadYtSync();
      } else if (audioRef.current) {
        ytPlayerRef.current?.pauseVideo?.();
        const audio = audioRef.current;
        if (audio.src !== track.streamUrl) {
          audio.src = track.streamUrl;
        }
        audio.currentTime = targetTime;
        if (hostPlaying) {
          audio.play().catch((err) => {
            console.warn('Autoplay blocked by browser policy:', err);
            setIsAutoplayBlocked(true);
          });
          setIsPlaying(true);
        } else {
          audio.pause();
          setIsPlaying(false);
        }
        setIsLoading(false);
      }
    } else {
      // Same track: check drift
      if (isYouTubeTrack(track)) {
        const currentYtTime = ytPlayerRef.current?.getCurrentTime?.() || 0;
        const drift = Math.abs(currentYtTime - targetTime);
        if (drift > 0.8) {
          ytPlayerRef.current?.seekTo?.(targetTime, true);
        }
        if (hostPlaying && !isPlaying) {
          ytPlayerRef.current?.playVideo?.();
          setIsPlaying(true);
        } else if (!hostPlaying && isPlaying) {
          ytPlayerRef.current?.pauseVideo?.();
          setIsPlaying(false);
        }
      } else if (audioRef.current) {
        const audio = audioRef.current;
        const drift = Math.abs(audio.currentTime - targetTime);
        if (drift > 0.5) {
          audio.currentTime = targetTime;
        }
        if (hostPlaying && audio.paused) {
          audio.play().catch(console.error);
          setIsPlaying(true);
        } else if (!hostPlaying && !audio.paused) {
          audio.pause();
          setIsPlaying(false);
        }
      }
    }
  };

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        currentTime,
        duration,
        buffered,
        volume,
        isMuted,
        playMode,
        isShuffle,
        isAutoplay,
        isAutoplayBlocked,
        resumeAutoplay,
        queue,
        history,
        autoplayTrack,
        analyserNode: analyserRef.current,
        isLoading,
        audioRef,
        playTrack,
        togglePlayPause,
        seekTo,
        seekRelative,
        setVolume,
        toggleMute,
        nextTrack,
        prevTrack,
        addToQueue,
        removeFromQueue,
        clearQueue,
        toggleShuffle,
        toggleAutoplay,
        cyclePlayMode,
        syncFromHost,
        setOnStateChangeNotify,
      }}
    >
      {children}

      {/* Hidden YouTube Iframe Player Container */}
      <div
        ref={ytContainerRef}
        className="fixed -bottom-[9999px] -right-[9999px] w-10 h-10 pointer-events-none opacity-0 overflow-hidden"
        aria-hidden="true"
      >
        <div id="auxparty-yt-iframe" />
      </div>
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used within PlayerProvider');
  return context;
};
