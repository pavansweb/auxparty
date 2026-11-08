# AuxParty (SyncWave) 🎧

A high-fidelity real-time collaborative music listening room built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**, **Zustand**, and **Socket.IO**.

![AuxParty Banner](https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&auto=format&fit=crop&q=80)

---

## 🚀 Key Improvements & Architecture

### 1. Robust State Persistence & Horizontal Scaling
- **SQLite & Redis Persistence**: Room states, queues, chat history, and permissions persist across server restarts via Node.js built-in `node:sqlite` (`data/rooms.db`) or Redis (`REDIS_URL`).
- **Cluster & Redis Adapter**: Ready for multi-instance horizontal scaling with `@socket.io/redis-adapter`.

### 2. Room Authority, DJ Roles & Queue Conflict Prevention
- **Host / DJ Mode**: In DJ mode, only the room host or designated DJ can control playback state and seek.
- **Collaborative Mode**: All participants can add songs and vote.
- **Vote-to-Skip**: If participants want to skip a track, >50% vote threshold automatically advances the queue.
- **Queue Protection**: Server prevents race conditions and rogue queue overwrites.

### 3. High-Precision NTP Clock Sync (Sub-50ms Drift Compensation)
- **Client-Server Ping/Pong**: Measures Round-Trip Time (RTT) and calculates clock offset: `offset = (serverTime - clientTime) + (RTT / 2)`.
- **Master Time Compensation**: `masterTime = room.seekTime + (Date.now() + clockOffset - room.lastUpdated) / 1000`.
- **Dynamic Playback Rate Steering**: Small drifts (100ms–1200ms) smoothly steer `playbackRate` (0.98x / 1.02x) for click-free sync. Hard seeks only trigger when drift exceeds 1.2s.

### 4. Fast Concurrent Spotify Playlist Importer
- **5-Concurrent Worker Pool**: Parallel resolution replaces sequential loops to avoid timeouts.
- **24-Hour Cache**: Resolved `title + artist -> streamUrl` queries are cached to minimize external API roundtrips.

### 5. Web Audio Visualizer, Dynamic Ambient Glow & Media Session
- **Web Audio Analyser**: Responsive frequency equalizer and waveform visualizer.
- **Dynamic Ambient Glow**: Canvas color extraction samples album covers and smoothly transitions ambient room gradients.
- **Native OS Media Session**: Track info, artwork, and hardware media keys (`play`, `pause`, `prev`, `next`, `seekto`) work on lock screens and smartwatches.
- **Audio Quality Switcher**: Toggle between 320kbps High Quality, 96kbps Data Saver, and Adaptive Auto.
- **Autoplay Handling**: Sleek animated "Click to Sync & Listen" banner when browsers block unprompted audio autoplay.

---

## 🛠️ Run Locally

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

3. **Run automated tests:**
   ```bash
   npm test
   ```

4. **Production build:**
   ```bash
   npm run build
   npm start
   ```
