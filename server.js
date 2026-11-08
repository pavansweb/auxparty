const { createServer } = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// ==========================================
// 1. PERSISTENCE LAYER (Redis & SQLite Fallback)
// ==========================================
let redisClient = null;
let redisSubClient = null;
let sqliteDb = null;
let hasRedis = false;

// Prepare data directory for SQLite
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory for SQLite:', err);
  }
}

// Initialize SQLite via built-in node:sqlite
try {
  const { DatabaseSync } = require('node:sqlite');
  sqliteDb = new DatabaseSync(path.join(DATA_DIR, 'rooms.db'));
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      room_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  console.log('📦 SQLite persistence initialized at data/rooms.db');
} catch (err) {
  console.warn('⚠️ SQLite DatabaseSync unavailable:', err.message);
}

// In-memory cache synced with persistent store
const rooms = new Map();

function canControlPlayback(socketId, r) {
  if (!socketId || !r) return false;
  if (r.mode === 'dj') {
    return socketId === r.hostId || socketId === r.djId;
  }
  // In collaborative mode, master playback clock is guarded by host (or DJ if assigned)
  // Listeners only report their playback status without overriding the master clock
  return socketId === r.hostId || (r.djId && socketId === r.djId);
}

function persistRoom(code, roomData, io = null) {
  const sanitized = {
    ...roomData,
    // Only persist registered users, remove ephemeral transient sockets
    users: (roomData.users || []).map((u) => ({ id: u.id, name: u.name, avatar: u.avatar })),
  };
  const json = JSON.stringify(sanitized);

  // 1. Try Redis if connected
  if (hasRedis && redisClient) {
    redisClient.set(`syncwave:room:${code}`, json).catch((err) => {
      console.warn(`Redis save error for room ${code}:`, err.message);
    });
    if (io && typeof io.serverSideEmit === 'function') {
      try {
        io.serverSideEmit('room:sync', { code, room: sanitized });
      } catch {}
    }
  }

  // 2. Persist to SQLite
  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare(`
        INSERT INTO rooms (room_id, state_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(room_id) DO UPDATE SET
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `);
      stmt.run(code, json, Date.now());
    } catch (err) {
      console.error(`SQLite save error for room ${code}:`, err.message);
    }
  }
}

function loadPersistedRooms() {
  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare('SELECT room_id, state_json FROM rooms');
      const rows = stmt.all();
      for (const row of rows) {
        try {
          const data = JSON.parse(row.state_json);
          // When restoring on server startup, reset active users and transient socket IDs
          rooms.set(row.room_id, {
            ...data,
            users: [],
            skipVotes: [],
            hostId: null,
            djId: null,
          });
        } catch {
          // ignore malformed rows
        }
      }
      console.log(`📦 Restored ${rooms.size} rooms from SQLite storage.`);
    } catch (err) {
      console.error('Failed to load persisted rooms from SQLite:', err.message);
    }
  }
}

// Load initial rooms
loadPersistedRooms();

const stamp = () => Date.now();

function ensureRoom(code) {
  let r = rooms.get(code);
  if (!r) {
    // Check SQLite cache-through
    if (sqliteDb) {
      try {
        const stmt = sqliteDb.prepare('SELECT state_json FROM rooms WHERE room_id = ?');
        const row = stmt.get(code);
        if (row && row.state_json) {
          const data = JSON.parse(row.state_json);
          r = {
            ...data,
            users: [],
            skipVotes: [],
            hostId: null,
            djId: null,
          };
          rooms.set(code, r);
          return r;
        }
      } catch (err) {
        console.error(`Error restoring room ${code} from SQLite:`, err.message);
      }
    }

    r = {
      roomId: code,
      currentTrack: null,
      isPlaying: false,
      seekTime: 0,
      lastUpdated: stamp(),
      queue: [],
      messages: [],
      users: [],
      hostId: null,
      djId: null,
      mode: 'collaborative', // 'collaborative' | 'dj'
      skipVotes: [],
    };
    rooms.set(code, r);
    persistRoom(code, r);
  }
  return r;
}

function emitRoom(io, code) {
  const r = ensureRoom(code);
  io.to(code).emit('room:state', r);
}

// Helper to advance room to next track in queue
function advanceNextTrack(r, triggeredBy = 'System') {
  const nextTrack = r.queue.shift() || null;
  r.currentTrack = nextTrack;
  r.seekTime = 0;
  r.isPlaying = !!nextTrack;
  r.lastUpdated = stamp();
  r.skipVotes = [];

  if (nextTrack) {
    r.messages.push({
      id: `${stamp()}-auto-next`,
      user: 'SyncWave',
      text: `Now playing: ${nextTrack.title} - ${nextTrack.artist}`,
      time: new Date().toISOString(),
      system: true,
    });
  } else {
    r.messages.push({
      id: `${stamp()}-queue-empty`,
      user: 'SyncWave',
      text: 'Queue is empty. Pick a song to keep the vibe going!',
      time: new Date().toISOString(),
      system: true,
    });
  }
  r.messages = r.messages.slice(-100);
  persistRoom(r.roomId, r);
}

app.prepare().then(async () => {
  const server = createServer((req, res) => handle(req, res));
  const io = new Server(server, {
    cors: { origin: process.env.NEXT_PUBLIC_APP_URL || true },
    maxHttpBufferSize: 1e6,
  });

  // ==========================================
  // Redis Adapter & Clustering Setup (if REDIS_URL provided)
  // ==========================================
  if (process.env.REDIS_URL) {
    try {
      const Redis = require('ioredis');
      const { createAdapter } = require('@socket.io/redis-adapter');

      redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
      redisSubClient = redisClient.duplicate();

      await Promise.all([
        new Promise((resolve) => redisClient.once('ready', resolve)),
        new Promise((resolve) => redisSubClient.once('ready', resolve)),
      ]);

      io.adapter(createAdapter(redisClient, redisSubClient));
      hasRedis = true;
      console.log('🚀 Connected to Redis & Socket.IO Redis Adapter configured!');

      // Restore persisted rooms from Redis if available
      try {
        const keys = await redisClient.keys('syncwave:room:*');
        let redisRestored = 0;
        for (const key of keys) {
          const code = key.replace('syncwave:room:', '');
          const json = await redisClient.get(key);
          if (json) {
            try {
              const data = JSON.parse(json);
              const existing = rooms.get(code);
              rooms.set(code, {
                ...data,
                users: existing?.users || [],
                skipVotes: existing?.skipVotes || [],
                hostId: existing?.hostId || null,
                djId: existing?.djId || null,
              });
              redisRestored++;
            } catch {}
          }
        }
        if (redisRestored > 0) {
          console.log(`📦 Restored ${redisRestored} rooms from Redis storage.`);
        }
      } catch (err) {
        console.warn('Failed to scan Redis for persisted rooms:', err.message);
      }

      // Listen for cluster sync events across nodes
      if (typeof io.on === 'function') {
        io.on('room:sync', ({ code, room }) => {
          if (!code || !room) return;
          const current = rooms.get(code);
          if (current) {
            rooms.set(code, {
              ...room,
              users: current.users,
              skipVotes: current.skipVotes,
              hostId: current.hostId || room.hostId,
              djId: current.djId || room.djId,
            });
          }
        });
      }
    } catch (err) {
      console.warn('⚠️ Could not connect to Redis, running in standalone SQLite mode:', err.message);
      hasRedis = false;
    }
  }

  // ==========================================
  // Socket.IO Real-Time Handlers
  // ==========================================
  io.on('connection', (socket) => {
    // 1. High-Precision NTP Clock Sync Heartbeat
    socket.on('sync:ping', (data) => {
      socket.emit('sync:pong', {
        clientTime: Number(data?.clientTime) || 0,
        serverTime: stamp(),
      });
    });

    // 2. Room Join
    socket.on('room:join', ({ roomId, name, avatar }) => {
      const code = String(roomId || 'WAVE-ROOM').toUpperCase().slice(0, 24);
      const r = ensureRoom(code);

      socket.join(code);
      socket.data.roomId = code;
      socket.data.name = String(name || 'Guest').slice(0, 24);

      const user = {
        id: socket.id,
        name: socket.data.name,
        avatar: avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(socket.data.name)}`,
      };

      r.users = (r.users || []).filter((u) => u.id !== socket.id);
      r.users.push(user);

      // Assign host/DJ if room doesn't have an active host
      if (!r.hostId || !r.users.some((u) => u.id === r.hostId)) {
        r.hostId = socket.id;
      }
      if (!r.djId || !r.users.some((u) => u.id === r.djId)) {
        r.djId = r.hostId;
      }

      r.messages.push({
        id: `${stamp()}-${socket.id}`,
        user: 'SyncWave',
        text: `${user.name} joined the room`,
        time: new Date().toISOString(),
        system: true,
      });
      r.messages = r.messages.slice(-100);

      persistRoom(code, r);
      emitRoom(io, code);
    });

    // 3. Room Leave / Disconnect
    const handleLeave = () => {
      const code = socket.data.roomId;
      if (!code) return;
      const r = ensureRoom(code);

      r.users = (r.users || []).filter((u) => u.id !== socket.id);
      r.skipVotes = (r.skipVotes || []).filter((id) => id !== socket.id);

      // Promote next user if host left
      if (r.hostId === socket.id) {
        if (r.users.length > 0) {
          r.hostId = r.users[0].id;
          if (r.djId === socket.id) {
            r.djId = r.hostId;
          }
          r.messages.push({
            id: `${stamp()}-host-change`,
            user: 'SyncWave',
            text: `${r.users[0].name} is now the room host`,
            time: new Date().toISOString(),
            system: true,
          });
        } else {
          r.hostId = null;
          r.djId = null;
        }
      }

      r.messages.push({
        id: `${stamp()}-${socket.id}`,
        user: 'SyncWave',
        text: `${socket.data.name || 'Guest'} left the room`,
        time: new Date().toISOString(),
        system: true,
      });
      r.messages = r.messages.slice(-100);

      socket.leave(code);
      socket.data.roomId = null;

      persistRoom(code, r);
      emitRoom(io, code);
    };

    socket.on('room:leave', handleLeave);
    socket.on('disconnect', handleLeave);

    // 4. Room Chat
    socket.on('chat:send', ({ text }) => {
      const code = socket.data.roomId;
      if (!code || !text?.trim()) return;
      const r = ensureRoom(code);

      r.messages.push({
        id: `${stamp()}-${socket.id}`,
        user: socket.data.name || 'Guest',
        text: String(text).slice(0, 500),
        time: new Date().toISOString(),
      });
      r.messages = r.messages.slice(-100);

      persistRoom(code, r);
      emitRoom(io, code);
    });

    // 5. Room Permissions: Mode & DJ Management
    socket.on('room:mode:set', ({ mode }) => {
      const code = socket.data.roomId;
      if (!code) return;
      const r = ensureRoom(code);

      // Only host can change room mode
      if (socket.id !== r.hostId) {
        return socket.emit('room:error', { message: 'Only the room host can change room mode.' });
      }

      if (mode === 'dj' || mode === 'collaborative') {
        r.mode = mode;
        r.messages.push({
          id: `${stamp()}-mode`,
          user: 'SyncWave',
          text: `Room mode set to ${mode === 'dj' ? 'Host/DJ Mode 🎧' : 'Collaborative Mode 👥'}`,
          time: new Date().toISOString(),
          system: true,
        });
        persistRoom(code, r);
        emitRoom(io, code);
      }
    });

    socket.on('room:dj:set', ({ djId }) => {
      const code = socket.data.roomId;
      if (!code) return;
      const r = ensureRoom(code);

      // Only host can assign DJ
      if (socket.id !== r.hostId) {
        return socket.emit('room:error', { message: 'Only the room host can assign DJ role.' });
      }

      const targetUser = (r.users || []).find((u) => u.id === djId);
      if (targetUser) {
        r.djId = targetUser.id;
        r.messages.push({
          id: `${stamp()}-dj-change`,
          user: 'SyncWave',
          text: `🎧 ${targetUser.name} is now the active DJ!`,
          time: new Date().toISOString(),
          system: true,
        });
        persistRoom(code, r);
        emitRoom(io, code);
      }
    });

    // 6. Queue Management (Add / Remove)
    socket.on('room:queue:add', (track) => {
      const code = socket.data.roomId;
      if (!code || !track) return;
      const r = ensureRoom(code);

      const trackItem = {
        ...track,
        addedBy: socket.data.name || 'Guest',
      };

      // If nothing is playing, start this track immediately
      if (!r.currentTrack) {
        r.currentTrack = trackItem;
        r.isPlaying = true;
        r.seekTime = 0;
        r.lastUpdated = stamp();
      } else {
        r.queue.push(trackItem);
      }

      persistRoom(code, r);
      emitRoom(io, code);
    });

    socket.on('room:queue:remove', (trackId) => {
      const code = socket.data.roomId;
      if (!code || !trackId) return;
      const r = ensureRoom(code);

      // In DJ mode, only Host/DJ or the person who added it can remove
      if (r.mode === 'dj' && socket.id !== r.hostId && socket.id !== r.djId) {
        const item = r.queue.find((t) => t.id === trackId);
        if (item && item.addedBy !== socket.data.name) {
          return socket.emit('room:error', { message: 'In DJ mode, only the DJ can modify the queue.' });
        }
      }

      r.queue = r.queue.filter((t) => t.id !== trackId);
      persistRoom(code, r);
      emitRoom(io, code);
    });

    // 7. Listener Playback Status Reporting (without overriding master clock)
    socket.on('player:status', ({ currentTime, isPlaying }) => {
      const code = socket.data.roomId;
      if (!code) return;
      const r = ensureRoom(code);
      const user = (r.users || []).find((u) => u.id === socket.id);
      if (user) {
        user.playback = {
          currentTime: Number(currentTime) || 0,
          isPlaying: !!isPlaying,
          updatedAt: stamp(),
        };
      }
    });

    // 7.5. Master Clock Playback State Synchronization
    socket.on('player:state', ({ currentTrack, isPlaying, seekTime }) => {
      const code = socket.data.roomId;
      if (!code) return;
      const r = ensureRoom(code);

      // Permission check: Host or designated DJ controls the master playback clock
      if (!canControlPlayback(socket.id, r)) {
        // Echo back master state so rogue/unauthorized client aligns with room
        return socket.emit('room:state', r);
      }

      if (currentTrack) {
        r.currentTrack = currentTrack;
        r.skipVotes = [];
      }
      r.isPlaying = !!isPlaying;
      r.seekTime = Math.max(0, Number(seekTime) || 0);
      r.lastUpdated = stamp();

      persistRoom(code, r, io);
      emitRoom(io, code);
    });

    socket.on('player:seek', ({ seekTime }) => {
      const code = socket.data.roomId;
      if (!code) return;
      const r = ensureRoom(code);

      if (!canControlPlayback(socket.id, r)) {
        return socket.emit('room:state', r);
      }

      r.seekTime = Math.max(0, Number(seekTime) || 0);
      r.lastUpdated = stamp();

      persistRoom(code, r, io);
      emitRoom(io, code);
    });

    // Advance to next song manually (Host/DJ permission required)
    socket.on('player:next', () => {
      const code = socket.data.roomId;
      if (!code) return;
      const r = ensureRoom(code);

      if (!canControlPlayback(socket.id, r)) {
        return socket.emit('room:error', {
          message: r.mode === 'dj'
            ? 'Only the room DJ can skip to the next track.'
            : 'In Collaborative Mode, use Vote-to-Skip to skip the current track.',
        });
      }

      advanceNextTrack(r, socket.data.name);
      emitRoom(io, code);
    });

    // 8. Vote-to-Skip Mechanism
    socket.on('vote:skip', () => {
      const code = socket.data.roomId;
      if (!code) return;
      const r = ensureRoom(code);

      if (!r.currentTrack) return;

      r.skipVotes = r.skipVotes || [];
      const userIdx = r.skipVotes.indexOf(socket.id);

      // Toggle vote
      if (userIdx >= 0) {
        r.skipVotes.splice(userIdx, 1);
      } else {
        r.skipVotes.push(socket.id);
      }

      const activeUsersCount = Math.max(1, (r.users || []).length);
      // Skip when > 50% of active listeners vote
      const requiredVotes = activeUsersCount <= 2 ? activeUsersCount : Math.floor(activeUsersCount / 2) + 1;

      if (r.skipVotes.length >= requiredVotes) {
        r.messages.push({
          id: `${stamp()}-vote-passed`,
          user: 'SyncWave',
          text: `⏩ Vote to skip passed (${r.skipVotes.length}/${activeUsersCount} votes). Skipping track!`,
          time: new Date().toISOString(),
          system: true,
        });
        advanceNextTrack(r, 'Vote');
      } else {
        persistRoom(code, r);
      }

      emitRoom(io, code);
    });

    // 9. Floating Emoji Reactions
    socket.on('reaction', (emoji) => {
      const code = socket.data.roomId;
      if (code) {
        io.to(code).emit('reaction', {
          emoji: String(emoji).slice(0, 8),
          user: socket.data.name || 'Friend',
          id: `${stamp()}-${Math.random().toString(36).slice(2, 7)}`,
        });
      }
    });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`🎧 SyncWave server listening on http://localhost:${PORT}`);
  });
});
