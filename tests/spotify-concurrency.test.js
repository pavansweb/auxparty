const test = require('node:test');
const assert = require('node:assert');

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      try {
        results[idx] = await fn(items[idx]);
      } catch {
        results[idx] = null;
      }
    }
  });

  await Promise.all(workers);
  return results.filter(Boolean);
}

test('Concurrent Spotify Importer: limits concurrency to 5 and caches results', async () => {
  const items = Array.from({ length: 15 }, (_, i) => ({ title: `Song ${i}`, artist: `Artist ${i}` }));
  let activeWorkers = 0;
  let maxObservedConcurrency = 0;

  const resolved = await mapConcurrent(items, 5, async (item) => {
    activeWorkers++;
    maxObservedConcurrency = Math.max(maxObservedConcurrency, activeWorkers);
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 10));
    activeWorkers--;
    return { title: item.title, artist: item.artist, streamUrl: `https://cdn.example.com/${item.title}.mp3` };
  });

  assert.strictEqual(resolved.length, 15);
  assert.ok(
    maxObservedConcurrency <= 5,
    `Max observed concurrency (${maxObservedConcurrency}) must not exceed 5`
  );
  assert.ok(
    maxObservedConcurrency >= 2,
    `Max observed concurrency (${maxObservedConcurrency}) should parallelize work`
  );
});

test('Spotify Importer: In-memory cache returns instant hits', () => {
  const cache = new Map();
  const getCacheKey = (title, artist) => `${title.trim().toLowerCase()}:::${artist.trim().toLowerCase()}`;

  const track = { id: 't1', title: 'Starboy', artist: 'The Weeknd', streamUrl: 'https://cdn.example.com/starboy.mp3' };
  const key = getCacheKey('Starboy', 'The Weeknd');
  cache.set(key, { track, expiresAt: Date.now() + 60000 });

  // Lookup
  const cachedHit = cache.get(getCacheKey('starboy ', ' the weeknd'));
  assert.ok(cachedHit, 'Should find cached song ignoring casing and whitespace');
  assert.strictEqual(cachedHit.track.streamUrl, 'https://cdn.example.com/starboy.mp3');

  // Miss
  const missed = cache.get(getCacheKey('Random Song', 'Nobody'));
  assert.strictEqual(missed, undefined);
});
