const test = require('node:test');
const assert = require('node:assert');

test('NTP Clock Sync & Drift Compensation formulas', () => {
  // 1. Ping / Pong offset calculation
  const clientTime = 1000;
  const serverTime = 1550;
  const clientReceiveTime = 1100;

  const rtt = clientReceiveTime - clientTime; // 100ms
  assert.strictEqual(rtt, 100);

  // Formula: offset = (serverTime - clientTime) + (RTT / 2)
  const offset = (serverTime - clientTime) + (rtt / 2);
  assert.strictEqual(offset, 600); // 550 + 50 = 600ms

  // 2. Master time calculation
  const room = {
    seekTime: 30, // 30s
    lastUpdated: 1700000000000,
    isPlaying: true,
  };
  const now = 1700000010000; // 10 seconds later
  const clockOffset = 500; // server is +500ms ahead

  const elapsedSec = (now + clockOffset - room.lastUpdated) / 1000;
  const masterTime = room.seekTime + Math.max(0, elapsedSec);

  assert.strictEqual(masterTime, 30 + 10.5); // 40.5s

  // 3. Drift compensation logic
  function calculatePlaybackAdjustment(currentTime, targetMasterTime) {
    const drift = currentTime - targetMasterTime;

    if (Math.abs(drift) > 1.2) {
      return { action: 'hard-seek', seekTo: targetMasterTime, playbackRate: 1.0 };
    } else if (drift > 0.1) {
      return { action: 'slowdown', seekTo: null, playbackRate: 0.98 };
    } else if (drift < -0.1) {
      return { action: 'speedup', seekTo: null, playbackRate: 1.02 };
    } else {
      return { action: 'sync', seekTo: null, playbackRate: 1.0 };
    }
  }

  // Large drift (2 seconds behind) -> hard seek
  const largeDrift = calculatePlaybackAdjustment(38.5, 40.5);
  assert.strictEqual(largeDrift.action, 'hard-seek');
  assert.strictEqual(largeDrift.seekTo, 40.5);
  assert.strictEqual(largeDrift.playbackRate, 1.0);

  // Small drift: 400ms ahead -> slowdown to 0.98x
  const smallAhead = calculatePlaybackAdjustment(40.9, 40.5);
  assert.strictEqual(smallAhead.action, 'slowdown');
  assert.strictEqual(smallAhead.playbackRate, 0.98);

  // Small drift: 300ms behind -> speedup to 1.02x
  const smallBehind = calculatePlaybackAdjustment(40.2, 40.5);
  assert.strictEqual(smallBehind.action, 'speedup');
  assert.strictEqual(smallBehind.playbackRate, 1.02);

  // Perfect sync (30ms drift) -> 1.0x
  const tightSync = calculatePlaybackAdjustment(40.53, 40.5);
  assert.strictEqual(tightSync.action, 'sync');
  assert.strictEqual(tightSync.playbackRate, 1.0);
});
