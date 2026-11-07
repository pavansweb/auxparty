import { Track, RoomPeer, RoomMessage, AuxMode, SoundEffectType } from '../types';

export type SyncEventType =
  | 'INIT_SYNC'
  | 'SYNC_STATE'
  | 'REQUEST_STATE'
  | 'PLAY_PAUSE'
  | 'SEEK'
  | 'TRACK_CHANGE'
  | 'QUEUE_UPDATE'
  | 'REQUEST_ADD_TO_QUEUE'
  | 'REQUEST_ADD_MANY_TO_QUEUE'
  | 'JOIN'
  | 'LEAVE'
  | 'CHAT'
  | 'REACTION'
  | 'PEER_LIST'
  | 'TRIGGER_SOUND'
  | 'VOTE_SKIP'
  | 'VOTE_TRACK'
  | 'SET_AUX_MODE'
  | 'TRANSFER_AUX';

export interface SyncPayload {
  type: SyncEventType;
  senderId?: string;
  sender?: string;
  peer?: RoomPeer;
  peers?: RoomPeer[];
  peerId?: string;
  track?: Track | null;
  tracks?: Track[];
  isPlaying?: boolean;
  position?: number;
  timestamp?: number;
  queue?: Track[];
  hostName?: string;
  activeDjName?: string;
  message?: RoomMessage;
  emoji?: string;
  sound?: SoundEffectType;
  auxMode?: AuxMode;
  targetPeerId?: string;
  skipVotes?: string[];
  trackId?: string;
}

export type StateGetter = () => {
  track: Track | null;
  isPlaying: boolean;
  position: number;
  queue: Track[];
};

const TOPIC_PREFIX = 'auxp3_';
const PUB_SERVER = 'https://ntfy.sh';
const WS_SERVER = 'wss://ntfy.sh';

export class RoomSyncService {
  private ws: WebSocket | null = null;
  private es: EventSource | null = null;
  private bc: BroadcastChannel | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private publishQueueTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPublishPayload: SyncPayload | null = null;
  private lastPublishTime: number = 0;
  private stateGetter: StateGetter | null = null;

  public myPeerId: string = '';
  public isHost: boolean = false;
  public isDJ: boolean = false;
  public roomCode: string = '';
  public userName: string = '';
  public userColor: string = '#8b5cf6';
  public auxMode: AuxMode = 'host-only';
  public activeDjName: string = '';

  public onSyncReceived?: (payload: SyncPayload) => void;
  public onPeersUpdated?: (peers: RoomPeer[]) => void;
  public onChatReceived?: (msg: RoomMessage) => void;
  public onReactionReceived?: (emoji: string, sender: string) => void;
  public onSoundTriggered?: (sound: SoundEffectType, sender: string) => void;
  public onQueueAddRequested?: (track: Track, sender: string) => void;
  public onQueueAddManyRequested?: (tracks: Track[], sender: string) => void;
  public onVoteSkipReceived?: (skipVotes: string[]) => void;
  public onVoteTrackReceived?: (trackId: string, sender: string) => void;
  public onAuxModeChanged?: (mode: AuxMode) => void;
  public onDjChanged?: (djName: string, isMe: boolean) => void;
  public onError?: (err: string) => void;

  private peerMap: Map<string, { peer: RoomPeer; lastSeen: number }> = new Map();
  public activePeers: RoomPeer[] = [];
  public currentSkipVotes: Set<string> = new Set();
  public isConnected: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.sendLeaveBeacon();
      });
    }
  }

  public static generateRoomCode(len: number = 4): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < len; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private initIdentity(name: string, isHostRole: boolean) {
    this.myPeerId = `peer_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
    const colors = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#06b6d4'];
    this.userColor = colors[Math.floor(Math.random() * colors.length)];
    this.userName = name || (isHostRole ? 'DJ (Host)' : 'Friend');
    this.isHost = isHostRole;
    this.isDJ = isHostRole;
    this.activeDjName = isHostRole ? this.userName : '';
    this.auxMode = 'host-only';
    this.currentSkipVotes.clear();
    this.peerMap.clear();

    const myPeer: RoomPeer = {
      id: this.myPeerId,
      name: this.userName,
      isHost: this.isHost,
      isDJ: this.isDJ,
      color: this.userColor,
    };
    this.peerMap.set(this.myPeerId, { peer: myPeer, lastSeen: Date.now() });
    this.updateActivePeers();
  }

  private updateActivePeers() {
    this.activePeers = Array.from(this.peerMap.values()).map((p) => p.peer);
    this.onPeersUpdated?.(this.activePeers);
  }

  // Create room as Host (instant non-blocking)
  public async createRoom(
    roomCode: string,
    hostName: string,
    initialState:
      | { track: Track | null; isPlaying: boolean; position: number; queue: Track[] }
      | StateGetter
  ): Promise<boolean> {
    this.leave();
    this.roomCode = roomCode.toUpperCase().trim();
    this.initIdentity(hostName, true);

    if (typeof initialState === 'function') {
      this.stateGetter = initialState;
    } else {
      this.stateGetter = () => initialState;
    }

    // Connect in background
    this.setupBroadcastChannel();
    this.connectCloudChannel().then(() => {
      this.broadcastSelfPresence('JOIN');
      const st = this.stateGetter ? this.stateGetter() : null;
      if (st) {
        this.publish({
          type: 'INIT_SYNC',
          senderId: this.myPeerId,
          sender: this.userName,
          track: st.track,
          isPlaying: st.isPlaying,
          position: st.position,
          timestamp: Date.now(),
          queue: st.queue,
          hostName: this.userName,
          activeDjName: this.userName,
          auxMode: this.auxMode,
          peers: this.activePeers,
        });
      }
    });

    return true;
  }

  // Join room as Guest (instant non-blocking)
  public async joinRoom(roomCode: string, guestName: string): Promise<boolean> {
    this.leave();
    this.roomCode = roomCode.toUpperCase().trim();
    this.initIdentity(guestName, false);

    // Setup local fast broadcast channel immediately
    this.setupBroadcastChannel();

    // Connect cloud pubsub in background
    this.connectCloudChannel().then(() => {
      // Announce join to room
      this.broadcastSelfPresence('JOIN');
      // Request latest playback state from DJ/Host
      this.publish({
        type: 'REQUEST_STATE',
        senderId: this.myPeerId,
        sender: this.userName,
      });
    });

    // If nobody claims DJ within 2.5 seconds, assume DJ role locally
    setTimeout(() => {
      if (!this.activeDjName && this.activePeers.length <= 1) {
        this.isDJ = true;
        this.activeDjName = this.userName;
        const myP = this.peerMap.get(this.myPeerId);
        if (myP) myP.peer.isDJ = true;
        this.updateActivePeers();
        this.onDjChanged?.(this.userName, true);
      }
    }, 2500);

    return true;
  }

  // Setup BroadcastChannel for 0ms same-origin tab sync
  private setupBroadcastChannel() {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    try {
      if (this.bc) {
        this.bc.close();
      }
      this.bc = new BroadcastChannel(`auxparty_room_${this.roomCode}`);
      this.bc.onmessage = (event) => {
        if (event.data) {
          this.handleIncomingPayload(event.data);
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported:', e);
    }
  }

  // Connect to the room pubsub channel using WebSocket (with SSE fallback)
  private async connectCloudChannel(): Promise<boolean> {
    const topic = `${TOPIC_PREFIX}${this.roomCode.toLowerCase()}`;
    const wsUrl = `${WS_SERVER}/${topic}/ws`;

    return new Promise((resolve) => {
      let resolved = false;

      const finishConnect = (success: boolean) => {
        if (resolved) return;
        resolved = true;
        this.isConnected = success;
        resolve(success);
      };

      // 3.5s timeout for WS fallback to SSE
      const fallbackTimer = setTimeout(() => {
        if (!resolved) {
          this.connectSSE(topic);
          finishConnect(true);
        }
      }, 3500);

      try {
        const ws = new WebSocket(wsUrl);
        this.ws = ws;

        ws.onopen = () => {
          clearTimeout(fallbackTimer);
          finishConnect(true);
        };

        ws.onmessage = (event) => {
          try {
            const raw = JSON.parse(event.data);
            if (raw.event === 'message' && raw.message) {
              const payload = JSON.parse(raw.message) as SyncPayload;
              this.handleIncomingPayload(payload);
            }
          } catch (e) {
            console.error('Error parsing room message:', e);
          }
        };

        ws.onerror = () => {
          if (!resolved) {
            clearTimeout(fallbackTimer);
            this.connectSSE(topic);
            finishConnect(true);
          }
        };

        ws.onclose = () => {
          if (this.roomCode) {
            this.scheduleReconnect();
          }
        };
      } catch (err: any) {
        clearTimeout(fallbackTimer);
        this.connectSSE(topic);
        finishConnect(true);
      }
    });
  }

  // SSE Fallback
  private connectSSE(topic: string) {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    try {
      const sseUrl = `${PUB_SERVER}/${topic}/sse`;
      const es = new EventSource(sseUrl);
      this.es = es;

      es.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          if (raw.event === 'message' && raw.message) {
            const payload = JSON.parse(raw.message) as SyncPayload;
            this.handleIncomingPayload(payload);
          }
        } catch (e) {}
      };

      es.onerror = () => {
        // SSE auto-reconnects natively
      };
    } catch (e) {
      console.error('SSE initialization error:', e);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.roomCode) {
        this.connectCloudChannel();
      }
    }, 4000);
  }

  // Publish message with throttling (never rate-limit)
  private publish(payload: SyncPayload) {
    if (!this.roomCode) return;

    // 1. Broadcast locally immediately (0ms latency for same-device tabs)
    try {
      this.bc?.postMessage(payload);
    } catch {}

    // 2. Throttle network POSTs to avoid hitting server rate limits
    const now = Date.now();
    const MIN_INTERVAL_MS = 1000;

    // High priority events send immediately (e.g. Chat, Queue, Sound, Skip)
    const isImmediate =
      payload.type === 'CHAT' ||
      payload.type === 'TRIGGER_SOUND' ||
      payload.type === 'VOTE_SKIP' ||
      payload.type === 'REQUEST_ADD_TO_QUEUE' ||
      payload.type === 'REQUEST_ADD_MANY_TO_QUEUE' ||
      payload.type === 'QUEUE_UPDATE' ||
      payload.type === 'SYNC_STATE' ||
      payload.type === 'INIT_SYNC' ||
      payload.type === 'VOTE_TRACK' ||
      payload.type === 'JOIN' ||
      payload.type === 'LEAVE';

    if (isImmediate || now - this.lastPublishTime >= MIN_INTERVAL_MS) {
      this.lastPublishTime = now;
      this.sendPostPayload(payload);
    } else {
      // Debounce the state update (e.g. seeking)
      this.pendingPublishPayload = payload;
      if (!this.publishQueueTimer) {
        this.publishQueueTimer = setTimeout(() => {
          this.publishQueueTimer = null;
          if (this.pendingPublishPayload) {
            this.lastPublishTime = Date.now();
            this.sendPostPayload(this.pendingPublishPayload);
            this.pendingPublishPayload = null;
          }
        }, MIN_INTERVAL_MS);
      }
    }
  }

  private async sendPostPayload(payload: SyncPayload) {
    if (!this.roomCode) return;
    try {
      const topic = `${TOPIC_PREFIX}${this.roomCode.toLowerCase()}`;
      await fetch(`${PUB_SERVER}/${topic}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.warn('Publish failed:', e);
    }
  }

  private broadcastSelfPresence(type: 'JOIN') {
    const myPeer: RoomPeer = {
      id: this.myPeerId,
      name: this.userName,
      isHost: this.isHost,
      isDJ: this.isDJ,
      color: this.userColor,
    };
    this.publish({
      type,
      senderId: this.myPeerId,
      sender: this.userName,
      peer: myPeer,
      activeDjName: this.activeDjName,
      auxMode: this.auxMode,
    });
  }

  // Process incoming payloads from room subscribers
  private handleIncomingPayload(payload: SyncPayload) {
    // Ignore our own broadcast messages
    if (payload.senderId && payload.senderId === this.myPeerId) {
      return;
    }

    switch (payload.type) {
      case 'JOIN': {
        if (payload.peer && payload.peer.id) {
          const isNew = !this.peerMap.has(payload.peer.id);
          this.peerMap.set(payload.peer.id, {
            peer: payload.peer,
            lastSeen: Date.now(),
          });
          this.updateActivePeers();

          if (payload.auxMode) this.auxMode = payload.auxMode;
          if (payload.activeDjName) {
            this.activeDjName = payload.activeDjName;
            this.isDJ = this.auxMode === 'open-aux' || this.activeDjName === this.userName;
          }

          if (isNew) {
            const joinMsg: RoomMessage = {
              id: `msg-${Date.now()}-${Math.random()}`,
              sender: 'AuxParty',
              text: `${payload.peer.name} joined the room! 🎧`,
              timestamp: Date.now(),
              isSystem: true,
            };
            this.onChatReceived?.(joinMsg);

            // If I am DJ or Host, reply with current state
            if (this.isDJ || this.isHost) {
              const st = this.stateGetter ? this.stateGetter() : null;
              if (st) {
                this.publish({
                  type: 'SYNC_STATE',
                  senderId: this.myPeerId,
                  sender: this.userName,
                  track: st.track,
                  isPlaying: st.isPlaying,
                  position: st.position,
                  timestamp: Date.now(),
                  queue: st.queue,
                  activeDjName: this.activeDjName,
                  auxMode: this.auxMode,
                  peers: this.activePeers,
                });
              }
            }
          }
        }
        break;
      }

      case 'LEAVE': {
        if (payload.peerId) {
          const existing = this.peerMap.get(payload.peerId);
          this.peerMap.delete(payload.peerId);
          this.updateActivePeers();
          if (existing) {
            this.currentSkipVotes.delete(existing.peer.name);
            const leaveMsg: RoomMessage = {
              id: `msg-${Date.now()}`,
              sender: 'AuxParty',
              text: `${existing.peer.name} left the room.`,
              timestamp: Date.now(),
              isSystem: true,
            };
            this.onChatReceived?.(leaveMsg);
          }
        }
        break;
      }

      case 'REQUEST_STATE': {
        if (this.isDJ || this.isHost) {
          const st = this.stateGetter ? this.stateGetter() : null;
          if (st) {
            this.publish({
              type: 'SYNC_STATE',
              senderId: this.myPeerId,
              sender: this.userName,
              track: st.track,
              isPlaying: st.isPlaying,
              position: st.position,
              timestamp: Date.now(),
              queue: st.queue,
              activeDjName: this.activeDjName,
              auxMode: this.auxMode,
              peers: this.activePeers,
            });
          }
        }
        break;
      }

      case 'INIT_SYNC':
      case 'SYNC_STATE': {
        if (payload.activeDjName) {
          this.activeDjName = payload.activeDjName;
          this.isDJ = this.auxMode === 'open-aux' || this.activeDjName === this.userName;
        }
        if (payload.auxMode) {
          this.auxMode = payload.auxMode;
        }
        if (payload.peers && payload.peers.length > 0) {
          payload.peers.forEach((p) => {
            if (p.id) {
              this.peerMap.set(p.id, { peer: p, lastSeen: Date.now() });
            }
          });
          this.updateActivePeers();
        }
        this.onSyncReceived?.(payload);
        break;
      }

      case 'QUEUE_UPDATE': {
        this.onSyncReceived?.(payload);
        break;
      }

      case 'CHAT': {
        if (payload.message) {
          this.onChatReceived?.(payload.message);
        }
        break;
      }

      case 'REACTION': {
        if (payload.emoji) {
          this.onReactionReceived?.(payload.emoji, payload.sender || 'Friend');
        }
        break;
      }

      case 'TRIGGER_SOUND': {
        if (payload.sound) {
          this.onSoundTriggered?.(payload.sound, payload.sender || 'Friend');
        }
        break;
      }

      case 'VOTE_SKIP': {
        const voter = payload.sender || 'Friend';
        this.currentSkipVotes.add(voter);
        const votes = Array.from(this.currentSkipVotes);
        this.onVoteSkipReceived?.(votes);
        break;
      }

      case 'VOTE_TRACK': {
        if (payload.trackId) {
          this.onVoteTrackReceived?.(payload.trackId, payload.sender || 'Friend');
        }
        break;
      }

      case 'SET_AUX_MODE': {
        if (payload.auxMode) {
          this.auxMode = payload.auxMode;
          this.isDJ = this.auxMode === 'open-aux' || this.activeDjName === this.userName;
          this.onAuxModeChanged?.(payload.auxMode);
        }
        break;
      }

      case 'TRANSFER_AUX': {
        if (payload.activeDjName) {
          this.activeDjName = payload.activeDjName;
          this.isDJ = this.auxMode === 'open-aux' || this.activeDjName === this.userName;
          this.onDjChanged?.(payload.activeDjName, this.isDJ);
        }
        break;
      }

      case 'REQUEST_ADD_TO_QUEUE': {
        if (payload.track) {
          this.onQueueAddRequested?.(payload.track, payload.sender || 'Friend');
        }
        break;
      }

      case 'REQUEST_ADD_MANY_TO_QUEUE': {
        if (payload.tracks) {
          this.onQueueAddManyRequested?.(payload.tracks, payload.sender || 'Friend');
        }
        break;
      }
    }
  }

  // Broadcast playback state to room
  public broadcastPlayback(
    track: Track | null,
    isPlaying: boolean,
    position: number,
    queue: Track[]
  ) {
    if (!this.isHost && this.auxMode !== 'open-aux' && this.activeDjName !== this.userName) {
      return;
    }
    this.publish({
      type: 'SYNC_STATE',
      senderId: this.myPeerId,
      sender: this.userName,
      track,
      isPlaying,
      position,
      timestamp: Date.now(),
      queue,
      activeDjName: this.activeDjName,
      auxMode: this.auxMode,
    });
  }

  public triggerSound(sound: SoundEffectType) {
    this.publish({
      type: 'TRIGGER_SOUND',
      senderId: this.myPeerId,
      sound,
      sender: this.userName,
    });
    this.onSoundTriggered?.(sound, this.userName);
  }

  public voteSkip() {
    this.currentSkipVotes.add(this.userName);
    const votes = Array.from(this.currentSkipVotes);
    this.publish({
      type: 'VOTE_SKIP',
      senderId: this.myPeerId,
      sender: this.userName,
    });
    this.onVoteSkipReceived?.(votes);
  }

  public resetSkipVotes() {
    this.currentSkipVotes.clear();
    this.onVoteSkipReceived?.([]);
  }

  public setAuxMode(mode: AuxMode) {
    this.auxMode = mode;
    this.isDJ = mode === 'open-aux' || this.activeDjName === this.userName;
    this.publish({
      type: 'SET_AUX_MODE',
      senderId: this.myPeerId,
      auxMode: mode,
      sender: this.userName,
    });
    this.onAuxModeChanged?.(mode);
  }

  public transferAux(targetPeerName: string) {
    this.activeDjName = targetPeerName;
    this.isDJ = this.auxMode === 'open-aux' || targetPeerName === this.userName;
    this.publish({
      type: 'TRANSFER_AUX',
      senderId: this.myPeerId,
      activeDjName: targetPeerName,
      sender: this.userName,
    });
    this.onDjChanged?.(targetPeerName, targetPeerName === this.userName);
  }

  public requestAddToQueue(track: Track) {
    const enriched = { ...track, addedBy: this.userName, votes: 0 };
    this.publish({
      type: 'REQUEST_ADD_TO_QUEUE',
      senderId: this.myPeerId,
      track: enriched,
      sender: this.userName,
    });
  }

  public requestAddManyToQueue(tracks: Track[]) {
    const enriched = tracks.map((t) => ({ ...t, addedBy: this.userName, votes: 0 }));
    this.publish({
      type: 'REQUEST_ADD_MANY_TO_QUEUE',
      senderId: this.myPeerId,
      tracks: enriched,
      sender: this.userName,
    });
  }

  public sendChatMessage(text: string) {
    const msg: RoomMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      sender: this.userName,
      text: text.trim(),
      timestamp: Date.now(),
    };
    this.publish({
      type: 'CHAT',
      senderId: this.myPeerId,
      message: msg,
      sender: this.userName,
    });
    this.onChatReceived?.(msg);
  }

  public sendReaction(emoji: string) {
    this.publish({
      type: 'REACTION',
      senderId: this.myPeerId,
      emoji,
      sender: this.userName,
    });
    this.onReactionReceived?.(emoji, this.userName);
  }

  public broadcast(payload: SyncPayload) {
    this.publish({
      ...payload,
      senderId: this.myPeerId,
      sender: this.userName,
    });
  }

  private sendLeaveBeacon() {
    if (!this.roomCode) return;
    try {
      const topic = `${TOPIC_PREFIX}${this.roomCode.toLowerCase()}`;
      const payload: SyncPayload = {
        type: 'LEAVE',
        senderId: this.myPeerId,
        peerId: this.myPeerId,
        sender: this.userName,
      };
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(`${PUB_SERVER}/${topic}`, JSON.stringify(payload));
      }
    } catch {}
  }

  public leave() {
    if (this.roomCode) {
      this.publish({
        type: 'LEAVE',
        senderId: this.myPeerId,
        peerId: this.myPeerId,
        sender: this.userName,
      });
    }

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.publishQueueTimer) clearTimeout(this.publishQueueTimer);
    this.publishQueueTimer = null;
    this.pendingPublishPayload = null;

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    if (this.es) {
      this.es.close();
      this.es = null;
    }

    if (this.bc) {
      this.bc.close();
      this.bc = null;
    }

    this.roomCode = '';
    this.isHost = false;
    this.isDJ = false;
    this.isConnected = false;
    this.peerMap.clear();
    this.activePeers = [];
    this.currentSkipVotes.clear();
  }
}

export const roomSync = new RoomSyncService();
