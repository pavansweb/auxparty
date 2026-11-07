import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  RoomState,
  RoomPeer,
  RoomMessage,
  FloatingReaction,
  Track,
  AuxMode,
  SoundEffectType,
} from '../types';
import { roomSync, RoomSyncService, SyncPayload } from '../services/roomSync';
import { playPartySound } from '../services/soundEffects';
import { usePlayer } from './PlayerContext';

interface RoomContextType {
  roomState: RoomState;
  messages: RoomMessage[];
  reactions: FloatingReaction[];
  error: string | null;
  isConnecting: boolean;
  createRoom: (hostName: string, customCode?: string) => Promise<string | null>;
  joinRoom: (roomCode: string, guestName: string) => Promise<boolean>;
  cancelConnecting: () => void;
  leaveRoom: () => void;
  sendMessage: (text: string) => void;
  sendReaction: (emoji: string) => void;
  triggerSound: (sound: SoundEffectType) => void;
  voteSkip: () => void;
  setAuxMode: (mode: AuxMode) => void;
  transferAux: (targetPeerName: string) => void;
  addToRoomQueue: (track: Track) => void;
  addManyToRoomQueue: (tracks: Track[]) => void;
  upvoteTrack: (trackId: string) => void;
  clearError: () => void;
}

const initialRoomState: RoomState = {
  roomId: '',
  roomCode: '',
  isHost: false,
  isDJ: false,
  hostName: '',
  activeDjName: '',
  userName: '',
  connected: false,
  peers: [],
  auxMode: 'host-only',
  skipVotes: [],
};

const RoomContext = createContext<RoomContextType | null>(null);

export const RoomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const player = usePlayer();
  const playerRef = React.useRef(player);
  playerRef.current = player;

  const [roomState, setRoomState] = useState<RoomState>(initialRoomState);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  // Keep roomSync stateGetter always fresh and updated with real-time player values
  useEffect(() => {
    roomSync.setStateGetter(() => ({
      track: playerRef.current.currentTrack,
      isPlaying: playerRef.current.isPlaying,
      position: playerRef.current.currentTime,
      queue: playerRef.current.queue,
    }));
  }, [player.currentTrack, player.isPlaying, player.currentTime, player.queue]);

  // Inform peers whenever playback state changes (if Host or Open Aux)
  useEffect(() => {
    player.setOnStateChangeNotify((track, isPlaying, position, queue) => {
      if (roomState.connected && (roomState.isHost || roomState.auxMode === 'open-aux' || roomState.isDJ)) {
        roomSync.broadcastPlayback(track, isPlaying, position, queue);
      }
    });
  }, [roomState.connected, roomState.isHost, roomState.auxMode, roomState.isDJ, player]);

  // Periodic heartbeat sync: while Host/DJ is playing, broadcast state every 3 seconds to keep sub-second lockstep sync
  useEffect(() => {
    if (!roomState.connected || (!roomState.isHost && !roomState.isDJ && roomState.auxMode !== 'open-aux')) {
      return;
    }
    if (!player.isPlaying || !player.currentTrack) return;

    const timer = setInterval(() => {
      roomSync.broadcastPlayback(
        player.currentTrack,
        player.isPlaying,
        player.currentTime,
        player.queue
      );
    }, 3000);

    return () => clearInterval(timer);
  }, [
    roomState.connected,
    roomState.isHost,
    roomState.isDJ,
    roomState.auxMode,
    player.isPlaying,
    player.currentTrack,
    player.currentTime,
    player.queue,
  ]);

  // Reset skip votes when currentTrack changes
  useEffect(() => {
    if (roomState.isHost && roomState.connected) {
      roomSync.resetSkipVotes();
      setRoomState((prev) => ({ ...prev, skipVotes: [] }));
    }
  }, [player.currentTrack?.id]);

  // Setup callbacks for roomSync
  useEffect(() => {
    roomSync.onSyncReceived = (payload: SyncPayload) => {
      if (payload.type === 'INIT_SYNC' || payload.type === 'SYNC_STATE') {
        player.syncFromHost(
          payload.track || null,
          Boolean(payload.isPlaying),
          payload.position || 0,
          payload.timestamp || Date.now(),
          payload.queue
        );
        setRoomState((prev) => ({
          ...prev,
          hostName: payload.hostName || prev.hostName,
          activeDjName: payload.activeDjName || prev.activeDjName,
          auxMode: payload.auxMode || prev.auxMode,
          peers: payload.peers && payload.peers.length > 0 ? payload.peers : prev.peers,
          skipVotes: payload.skipVotes || prev.skipVotes,
          isDJ:
            payload.auxMode === 'open-aux' ||
            (payload.activeDjName ? payload.activeDjName === prev.userName : prev.isDJ),
        }));
      } else if (payload.type === 'QUEUE_UPDATE' && payload.queue) {
        player.syncFromHost(player.currentTrack, player.isPlaying, player.currentTime, Date.now(), payload.queue);
      }
    };

    roomSync.onPeersUpdated = (peers: RoomPeer[]) => {
      setRoomState((prev) => ({
        ...prev,
        peers,
        isDJ: prev.auxMode === 'open-aux' || prev.activeDjName === prev.userName,
      }));
    };

    roomSync.onChatReceived = (msg: RoomMessage) => {
      setMessages((prev) => [...prev, msg]);
    };

    roomSync.onReactionReceived = (emoji: string, sender: string) => {
      const newReaction: FloatingReaction = {
        id: `react-${Date.now()}-${Math.random()}`,
        emoji,
        sender,
        x: Math.random() * 80 + 10,
      };
      setReactions((prev) => [...prev, newReaction]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
      }, 2800);
    };

    // Sound effect triggered by peer
    roomSync.onSoundTriggered = (sound: SoundEffectType, sender: string) => {
      playPartySound(sound);
      const icon = sound === 'airhorn' ? '📢' : sound === 'scratch' ? '💽' : sound === 'bassdrop' ? '💣' : '👏';
      const soundMsg: RoomMessage = {
        id: `snd-${Date.now()}`,
        sender: 'AuxParty',
        text: `${sender} dropped ${icon} ${sound.toUpperCase()}!`,
        timestamp: Date.now(),
        isSystem: true,
      };
      setMessages((prev) => [...prev, soundMsg]);
    };

    // Vote to skip received
    roomSync.onVoteSkipReceived = (skipVotes: string[]) => {
      setRoomState((prev) => {
        const totalPeers = Math.max(1, prev.peers.length);
        const threshold = Math.ceil(totalPeers / 2);

        // If threshold reached and I am host, skip!
        if (prev.isHost && skipVotes.length >= threshold && totalPeers > 1) {
          player.nextTrack();
          roomSync.resetSkipVotes();
          const skipMsg: RoomMessage = {
            id: `skip-${Date.now()}`,
            sender: 'AuxParty',
            text: `Majority vote reached (${skipVotes.length}/${totalPeers})! Skipping song ⏭️`,
            timestamp: Date.now(),
            isSystem: true,
          };
          roomSync.broadcast({ type: 'CHAT', message: skipMsg });
          setMessages((m) => [...m, skipMsg]);
          return { ...prev, skipVotes: [] };
        }

        return { ...prev, skipVotes };
      });
    };

    // Aux Mode changed
    roomSync.onAuxModeChanged = (mode: AuxMode) => {
      setRoomState((prev) => ({
        ...prev,
        auxMode: mode,
        isDJ: mode === 'open-aux' || prev.activeDjName === prev.userName,
      }));
    };

    // DJ Changed
    roomSync.onDjChanged = (djName: string, isMe: boolean) => {
      setRoomState((prev) => ({
        ...prev,
        activeDjName: djName,
        isDJ: isMe || prev.auxMode === 'open-aux',
      }));
      const djMsg: RoomMessage = {
        id: `dj-${Date.now()}`,
        sender: 'AuxParty',
        text: `The Aux Cord was passed to 👑 ${djName}!`,
        timestamp: Date.now(),
        isSystem: true,
      };
      setMessages((prev) => [...prev, djMsg]);
    };

    // When a friend asks to add a song to the shared queue
    roomSync.onQueueAddRequested = (track: Track, sender: string) => {
      const enriched = { ...track, addedBy: sender, votes: 0 };
      if (!player.currentTrack) {
        player.playTrack(enriched);
      } else {
        player.addToQueue(enriched);
      }
      const queueMsg: RoomMessage = {
        id: `msg-${Date.now()}-${Math.random()}`,
        sender: 'AuxParty',
        text: `${sender} queued "${track.title}" 🎵`,
        timestamp: Date.now(),
        isSystem: true,
      };
      setMessages((prev) => [...prev, queueMsg]);
      if (roomState.isHost) {
        const nextQueue = player.currentTrack ? [...player.queue, enriched] : [];
        roomSync.broadcast({ type: 'QUEUE_UPDATE', queue: nextQueue });
        roomSync.broadcast({ type: 'CHAT', message: queueMsg });
      }
    };

    // When a friend asks to add multiple songs
    roomSync.onQueueAddManyRequested = (tracks: Track[], sender: string) => {
      const enriched = tracks.map((t) => ({ ...t, addedBy: sender, votes: 0 }));
      if (!player.currentTrack && enriched.length > 0) {
        const [first, ...rest] = enriched;
        player.playTrack(first, rest);
      } else {
        enriched.forEach((t) => player.addToQueue(t));
      }
      const queueMsg: RoomMessage = {
        id: `msg-${Date.now()}-${Math.random()}`,
        sender: 'AuxParty',
        text: `${sender} queued ${tracks.length} tracks! 🟢`,
        timestamp: Date.now(),
        isSystem: true,
      };
      setMessages((prev) => [...prev, queueMsg]);
      if (roomState.isHost) {
        const nextQueue = player.currentTrack ? [...player.queue, ...enriched] : enriched.slice(1);
        roomSync.broadcast({ type: 'QUEUE_UPDATE', queue: nextQueue });
        roomSync.broadcast({ type: 'CHAT', message: queueMsg });
      }
    };

    roomSync.onError = (errMsg: string) => {
      setError(errMsg);
      setIsConnecting(false);
    };

    return () => {
      roomSync.onSyncReceived = undefined;
      roomSync.onPeersUpdated = undefined;
      roomSync.onChatReceived = undefined;
      roomSync.onReactionReceived = undefined;
      roomSync.onSoundTriggered = undefined;
      roomSync.onVoteSkipReceived = undefined;
      roomSync.onAuxModeChanged = undefined;
      roomSync.onDjChanged = undefined;
      roomSync.onQueueAddRequested = undefined;
      roomSync.onQueueAddManyRequested = undefined;
      roomSync.onError = undefined;
    };
  }, [player]);

  const createRoom = async (hostName: string, customCode?: string): Promise<string | null> => {
    setIsConnecting(true);
    setError(null);
    const code = (customCode || RoomSyncService.generateRoomCode(4)).toUpperCase();
    const cleanHostName = hostName.trim() || 'DJ (Host)';

    try {
      const success = await roomSync.createRoom(code, cleanHostName, () => ({
        track: player.currentTrack,
        isPlaying: player.isPlaying,
        position: player.currentTime,
        queue: player.queue,
      }));

      setIsConnecting(false);
      if (success) {
        setRoomState({
          roomId: `auxparty-${code.toLowerCase()}`,
          roomCode: code,
          isHost: true,
          isDJ: true,
          hostName: cleanHostName,
          activeDjName: cleanHostName,
          userName: cleanHostName,
          connected: true,
          peers:
            roomSync.activePeers.length > 0
              ? roomSync.activePeers
              : [
                  {
                    id: roomSync.myPeerId || 'host',
                    name: cleanHostName,
                    isHost: true,
                    isDJ: true,
                    color: '#8b5cf6',
                  },
                ],
          auxMode: 'host-only',
          skipVotes: [],
        });
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(
            'auxparty_session',
            JSON.stringify({ role: 'host', roomCode: code, userName: cleanHostName })
          );
          localStorage.setItem('auxparty_nickname', cleanHostName);
        }
        setMessages([
          {
            id: 'welcome',
            sender: 'AuxParty',
            text: `Room created! Share link: /room/${code.toLowerCase()}`,
            timestamp: Date.now(),
            isSystem: true,
          },
        ]);
        return code;
      }
      return null;
    } catch (e: any) {
      setIsConnecting(false);
      setError(e.message || 'Failed to create room');
      return null;
    }
  };

  const joinRoom = async (roomCode: string, guestName: string): Promise<boolean> => {
    setIsConnecting(true);
    setError(null);
    const cleanCode = roomCode.trim().toUpperCase();
    const cleanName = guestName.trim() || 'Friend';

    try {
      const success = await roomSync.joinRoom(cleanCode, cleanName);

      setIsConnecting(false);
      if (success) {
        setRoomState({
          roomId: `auxparty-${cleanCode.toLowerCase()}`,
          roomCode: cleanCode,
          isHost: false,
          isDJ: false,
          hostName: 'Host',
          activeDjName: 'DJ',
          userName: cleanName,
          connected: true,
          peers:
            roomSync.activePeers.length > 0
              ? roomSync.activePeers
              : [
                  {
                    id: roomSync.myPeerId || 'guest',
                    name: cleanName,
                    isHost: false,
                    isDJ: false,
                    color: roomSync.userColor,
                  },
                ],
          auxMode: 'host-only',
          skipVotes: [],
        });
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(
            'auxparty_session',
            JSON.stringify({ role: 'guest', roomCode: cleanCode, userName: cleanName })
          );
          localStorage.setItem('auxparty_nickname', cleanName);
        }
        return true;
      }
      return false;
    } catch (e: any) {
      setIsConnecting(false);
      setError(e.message || 'Failed to join room');
      return false;
    }
  };

  const cancelConnecting = () => {
    roomSync.leave();
    setIsConnecting(false);
    setError(null);
  };

  const leaveRoom = () => {
    roomSync.leave();
    setRoomState(initialRoomState);
    setMessages([]);
    setReactions([]);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('auxparty_session');
    }
  };

  const sendMessage = (text: string) => {
    if (!text.trim() || !roomState.connected) return;
    roomSync.sendChatMessage(text);
  };

  const sendReaction = (emoji: string) => {
    if (!roomState.connected) return;
    roomSync.sendReaction(emoji);
  };

  const triggerSound = (sound: SoundEffectType) => {
    if (!roomState.connected) return;
    playPartySound(sound);
    roomSync.triggerSound(sound);
  };

  const voteSkip = () => {
    if (!roomState.connected) return;
    roomSync.voteSkip();
  };

  const setAuxMode = (mode: AuxMode) => {
    roomSync.setAuxMode(mode);
    setRoomState((prev) => ({
      ...prev,
      auxMode: mode,
      isDJ: mode === 'open-aux' || prev.activeDjName === prev.userName,
    }));
  };

  const transferAux = (targetPeerName: string) => {
    roomSync.transferAux(targetPeerName);
  };

  // Upvote / Vote track in room queue
  const upvoteTrack = (trackId: string) => {
    if (roomState.isHost) {
      const updatedQueue = player.queue.map((t) => {
        if (t.id === trackId) {
          const currentVotes = (t.votes || 0) + 1;
          return { ...t, votes: currentVotes };
        }
        return t;
      });
      updatedQueue.sort((a, b) => (b.votes || 0) - (a.votes || 0));
      player.syncFromHost(player.currentTrack, player.isPlaying, player.currentTime, Date.now(), updatedQueue);
      roomSync.broadcast({ type: 'QUEUE_UPDATE', queue: updatedQueue });
    } else {
      roomSync.broadcast({ type: 'VOTE_TRACK', trackId, sender: roomState.userName });
    }
  };

  const addToRoomQueue = (track: Track) => {
    const enriched = { ...track, addedBy: roomState.userName, votes: 0 };
    
    // Immediate local feedback
    if (!player.currentTrack) {
      player.playTrack(enriched);
    } else {
      player.addToQueue(enriched);
    }

    const msg: RoomMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      sender: 'AuxParty',
      text: `${roomState.userName} queued "${track.title}" 🎵`,
      timestamp: Date.now(),
      isSystem: true,
    };
    setMessages((prev) => [...prev, msg]);

    if (roomState.connected) {
      const nextQueue = player.currentTrack ? [...player.queue, enriched] : [];
      roomSync.broadcast({ type: 'QUEUE_UPDATE', queue: nextQueue });
      roomSync.broadcast({ type: 'CHAT', message: msg });
      if (!player.currentTrack && (roomState.isHost || roomState.isDJ || roomState.auxMode === 'open-aux')) {
        roomSync.broadcastPlayback(enriched, true, 0, nextQueue);
      } else if (!roomState.isHost) {
        roomSync.requestAddToQueue(enriched);
      }
    }
  };

  const addManyToRoomQueue = (tracks: Track[]) => {
    const enriched = tracks.map((t) => ({ ...t, addedBy: roomState.userName, votes: 0 }));
    if (enriched.length === 0) return;

    let nextQueue = [...player.queue];
    if (!player.currentTrack) {
      const [first, ...rest] = enriched;
      player.playTrack(first, rest);
      nextQueue = rest;
    } else {
      enriched.forEach((t) => player.addToQueue(t));
      nextQueue = [...player.queue, ...enriched];
    }

    const msg: RoomMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      sender: 'AuxParty',
      text: `${roomState.userName} queued ${tracks.length} tracks! 🟢`,
      timestamp: Date.now(),
      isSystem: true,
    };
    setMessages((prev) => [...prev, msg]);

    if (roomState.connected) {
      roomSync.broadcast({ type: 'QUEUE_UPDATE', queue: nextQueue });
      roomSync.broadcast({ type: 'CHAT', message: msg });
      if (!player.currentTrack && (roomState.isHost || roomState.isDJ || roomState.auxMode === 'open-aux')) {
        roomSync.broadcastPlayback(enriched[0], true, 0, nextQueue);
      } else if (!roomState.isHost) {
        roomSync.requestAddManyToQueue(enriched);
      }
    }
  };

  const clearError = () => setError(null);

  return (
    <RoomContext.Provider
      value={{
        roomState,
        messages,
        reactions,
        error,
        isConnecting,
        createRoom,
        joinRoom,
        cancelConnecting,
        leaveRoom,
        sendMessage,
        sendReaction,
        triggerSound,
        voteSkip,
        setAuxMode,
        transferAux,
        addToRoomQueue,
        addManyToRoomQueue,
        upvoteTrack,
        clearError,
      }}
    >
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = () => {
  const context = useContext(RoomContext);
  if (!context) throw new Error('useRoom must be used within RoomProvider');
  return context;
};
