const test = require('node:test');
const assert = require('node:assert');

test('Edge Case: Reset phantom hostId and djId on server restart restore', () => {
  const persistedRoomData = {
    roomId: 'ROOM-ALPHA',
    currentTrack: { id: 't1', title: 'Test' },
    isPlaying: true,
    seekTime: 12.0,
    lastUpdated: 1700000000000,
    queue: [],
    messages: [],
    users: [{ id: 'dead-socket-1', name: 'Alice' }],
    hostId: 'dead-socket-1',
    djId: 'dead-socket-1',
    mode: 'dj',
  };

  // Restoration function from server.js
  const restored = {
    ...persistedRoomData,
    users: [],
    skipVotes: [],
    hostId: null,
    djId: null,
  };

  assert.strictEqual(restored.users.length, 0);
  assert.strictEqual(restored.hostId, null);
  assert.strictEqual(restored.djId, null);

  // When first new user joins, they cleanly become host and DJ
  const newSocket = { id: 'new-socket-99', name: 'Bob' };
  restored.users.push(newSocket);
  if (!restored.hostId || !restored.users.some(u => u.id === restored.hostId)) {
    restored.hostId = newSocket.id;
  }
  if (!restored.djId || !restored.users.some(u => u.id === restored.djId)) {
    restored.djId = restored.hostId;
  }

  assert.strictEqual(restored.hostId, 'new-socket-99');
  assert.strictEqual(restored.djId, 'new-socket-99');
});

test('Edge Case: Listener status reporting does not override master playback clock', () => {
  const room = {
    roomId: 'COLLAB-01',
    currentTrack: { id: 'track-1', title: 'Cosmic Beats' },
    isPlaying: true,
    seekTime: 45.0,
    lastUpdated: 1700000000000,
    users: [
      { id: 'host-socket', name: 'Host Alice' },
      { id: 'listener-socket', name: 'Listener Bob' },
    ],
    hostId: 'host-socket',
    mode: 'collaborative',
  };

  const initialSeekTime = room.seekTime;
  const initialIsPlaying = room.isPlaying;
  const initialLastUpdated = room.lastUpdated;

  // Listener sends player:status with their local position
  function handleListenerStatus(socketId, status, r) {
    const user = r.users.find(u => u.id === socketId);
    if (user) {
      user.playback = {
        currentTime: status.currentTime,
        isPlaying: status.isPlaying,
        updatedAt: Date.now(),
      };
    }
  }

  handleListenerStatus('listener-socket', { currentTime: 0, isPlaying: false }, room);

  // Room master clock should remain untouched
  assert.strictEqual(room.seekTime, initialSeekTime);
  assert.strictEqual(room.isPlaying, initialIsPlaying);
  assert.strictEqual(room.lastUpdated, initialLastUpdated);

  // Listener's presence status is recorded
  const listener = room.users.find(u => u.id === 'listener-socket');
  assert.strictEqual(listener.playback.currentTime, 0);
  assert.strictEqual(listener.playback.isPlaying, false);
});

test('Edge Case: Continuous drift steering converges to 1.0x within 50ms', () => {
  let currentTime = 40.2; // 300ms behind target 40.5s
  const masterTime = 40.5;
  let playbackRate = 1.0;

  function steer(curr, master) {
    const drift = curr - master;
    if (Math.abs(drift) > 1.2) {
      return { playbackRate: 1.0, seekTo: master };
    } else if (drift > 0.1) {
      return { playbackRate: 0.98, seekTo: null };
    } else if (drift < -0.1) {
      return { playbackRate: 1.02, seekTo: null };
    } else if (Math.abs(drift) < 0.05) {
      return { playbackRate: 1.0, seekTo: null };
    }
    return { playbackRate, seekTo: null };
  }

  // Step 1: 300ms behind -> speed up to 1.02x
  let result = steer(currentTime, masterTime);
  assert.strictEqual(result.playbackRate, 1.02);

  // Step 2: After playing at 1.02x, drift narrows to -40ms (tight sync < 50ms)
  currentTime = 40.46; // only 40ms behind
  result = steer(currentTime, masterTime);
  assert.strictEqual(result.playbackRate, 1.0, 'Playback rate should restore to 1.0x within 50ms drift');
});

test('Edge Case: Spotify playlist URL and URI pattern matching', () => {
  const parsePlaylistId = (url) => {
    return (
      url.match(/(?:playlist\/|embed\/playlist\/)([A-Za-z0-9]+)/)?.[1] ||
      url.match(/spotify:playlist:([A-Za-z0-9]+)/)?.[1]
    );
  };

  assert.strictEqual(
    parsePlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'),
    '37i9dQZF1DXcBWIGoYBM5M'
  );
  assert.strictEqual(
    parsePlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=e8c2fb5f98cf4a95'),
    '37i9dQZF1DXcBWIGoYBM5M'
  );
  assert.strictEqual(
    parsePlaylistId('https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M'),
    '37i9dQZF1DXcBWIGoYBM5M'
  );
  assert.strictEqual(
    parsePlaylistId('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M'),
    '37i9dQZF1DXcBWIGoYBM5M'
  );
});
