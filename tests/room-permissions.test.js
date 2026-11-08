const test = require('node:test');
const assert = require('node:assert');

test('Room Authority & DJ Permissions logic', () => {
  const room = {
    roomId: 'PARTY-01',
    mode: 'dj',
    hostId: 'user-host',
    djId: 'user-dj',
    currentTrack: { id: 's1', title: 'Song 1' },
    isPlaying: true,
    seekTime: 10,
    queue: [
      { id: 's2', title: 'Song 2', addedBy: 'user-listener' },
      { id: 's3', title: 'Song 3', addedBy: 'user-host' },
    ],
    users: [
      { id: 'user-host', name: 'Host Alice' },
      { id: 'user-dj', name: 'DJ Bob' },
      { id: 'user-listener', name: 'Listener Charlie' },
    ],
  };

  // Helper verifying permission to control playback and master clock
  function canControlPlayback(socketId, r) {
    if (!socketId || !r) return false;
    if (r.mode === 'dj') {
      return socketId === r.hostId || socketId === r.djId;
    }
    // In collaborative mode, master playback clock is guarded by host (or DJ if assigned)
    // Listeners only report their playback status without overriding the master clock
    return socketId === r.hostId || (r.djId && socketId === r.djId);
  }

  // DJ and Host should be allowed in DJ mode
  assert.strictEqual(canControlPlayback('user-host', room), true);
  assert.strictEqual(canControlPlayback('user-dj', room), true);

  // Non-DJ listener should be blocked in DJ mode
  assert.strictEqual(canControlPlayback('user-listener', room), false);

  // In Collaborative mode: Host retains master clock control
  room.mode = 'collaborative';
  assert.strictEqual(canControlPlayback('user-host', room), true);
  // Listeners only report status; they cannot override the master playback clock
  assert.strictEqual(canControlPlayback('user-listener', room), false);
});

test('Vote-to-Skip mechanism logic', () => {
  const activeUsers = ['u1', 'u2', 'u3', 'u4'];
  let skipVotes = [];

  function registerVote(userId) {
    if (!skipVotes.includes(userId)) {
      skipVotes.push(userId);
    }
    const requiredVotes = activeUsers.length <= 2 ? activeUsers.length : Math.floor(activeUsers.length / 2) + 1;
    const shouldSkip = skipVotes.length >= requiredVotes;
    return { shouldSkip, votes: skipVotes.length, required: requiredVotes };
  }

  // 1 vote out of 4: requires 3 votes (>50%)
  let res = registerVote('u1');
  assert.strictEqual(res.required, 3);
  assert.strictEqual(res.shouldSkip, false);

  // 2 votes out of 4
  res = registerVote('u2');
  assert.strictEqual(res.shouldSkip, false);

  // 3 votes out of 4: threshold reached!
  res = registerVote('u3');
  assert.strictEqual(res.shouldSkip, true);
});

test('Host transfer when host disconnects', () => {
  const room = {
    hostId: 'host-1',
    djId: 'host-1',
    users: [
      { id: 'host-1', name: 'Host' },
      { id: 'listener-2', name: 'Next In Line' },
    ],
  };

  // Simulate host-1 leaving
  const leavingId = 'host-1';
  room.users = room.users.filter(u => u.id !== leavingId);

  if (room.hostId === leavingId) {
    if (room.users.length > 0) {
      room.hostId = room.users[0].id;
      if (room.djId === leavingId) {
        room.djId = room.hostId;
      }
    }
  }

  assert.strictEqual(room.hostId, 'listener-2');
  assert.strictEqual(room.djId, 'listener-2');
});
