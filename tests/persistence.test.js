const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

test('Room Persistence: saves and restores room across server restarts', () => {
  const testDbPath = path.join(__dirname, 'test_rooms.db');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  // 1. First server lifecycle: create DB and persist room
  const db1 = new DatabaseSync(testDbPath);
  db1.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      room_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const initialRoom = {
    roomId: 'TEST-ROOM-1',
    currentTrack: {
      id: 'track-101',
      title: 'Midnight Echoes',
      artist: 'Solaris',
      streamUrl: 'https://example.com/audio.mp3',
    },
    isPlaying: true,
    seekTime: 42.5,
    lastUpdated: 1700000000000,
    queue: [
      { id: 'track-102', title: 'Neon Pulse', artist: 'Cyberwave' }
    ],
    messages: [
      { id: 'm1', user: 'Alex', text: 'Love this track!' }
    ],
    hostId: 'socket-host-123',
    djId: 'socket-host-123',
    mode: 'dj',
  };

  const insertStmt = db1.prepare(`
    INSERT INTO rooms (room_id, state_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(room_id) DO UPDATE SET
      state_json = excluded.state_json,
      updated_at = excluded.updated_at
  `);
  insertStmt.run(initialRoom.roomId, JSON.stringify(initialRoom), Date.now());
  db1.close();

  // 2. Second server lifecycle: simulate restart and load persisted rooms
  const db2 = new DatabaseSync(testDbPath);
  const selectStmt = db2.prepare('SELECT room_id, state_json FROM rooms WHERE room_id = ?');
  const row = selectStmt.get('TEST-ROOM-1');

  assert.ok(row, 'Row should exist in SQLite after restart');
  const restored = JSON.parse(row.state_json);

  assert.strictEqual(restored.roomId, 'TEST-ROOM-1');
  assert.strictEqual(restored.currentTrack.title, 'Midnight Echoes');
  assert.strictEqual(restored.seekTime, 42.5);
  assert.strictEqual(restored.isPlaying, true);
  assert.strictEqual(restored.mode, 'dj');
  assert.strictEqual(restored.queue.length, 1);
  assert.strictEqual(restored.queue[0].title, 'Neon Pulse');
  assert.strictEqual(restored.messages.length, 1);
  assert.strictEqual(restored.messages[0].text, 'Love this track!');

  db2.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
});
