import { Track, SpotifyPlaylistResponse } from '../types';

export function extractYouTubeId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const str = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }
  const match = str.match(
    /(?:(?:youtube|music\.youtube|m\.youtube)\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
  );
  if (match) return match[1];

  try {
    const url = new URL(str.startsWith('http') ? str : `https://${str}`);
    const v = url.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  } catch {}

  return null;
}

export async function fetchYouTubeTrack(urlOrId: string): Promise<Track | null> {
  const videoId = extractYouTubeId(urlOrId);
  if (!videoId) return null;

  try {
    // Try backend proxy first
    const res = await fetch(`/api/youtube?url=${encodeURIComponent(urlOrId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.track) return data.track;
    }
  } catch (e) {
    console.warn('Backend YouTube fetch failed, attempting client oembed fallback:', e);
  }

  // Fallback: direct oEmbed call from client
  try {
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      return {
        id: `yt-${videoId}`,
        youtubeId: videoId,
        source: 'youtube',
        title: oembed.title || 'YouTube Audio',
        artist: oembed.author_name || 'YouTube Creator',
        album: 'YouTube',
        duration: 0,
        image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
        has320: false,
      };
    }
  } catch (err) {
    console.error('Client oEmbed fallback failed:', err);
  }

  // Barebones fallback if offline or restricted
  return {
    id: `yt-${videoId}`,
    youtubeId: videoId,
    source: 'youtube',
    title: `YouTube Video (${videoId})`,
    artist: 'YouTube',
    album: 'YouTube',
    duration: 0,
    image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
    has320: false,
  };
}

export async function searchTracks(query: string): Promise<Track[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // If query is a YouTube link, resolve it directly with instant response!
  const ytId = extractYouTubeId(trimmed);
  if (ytId) {
    const ytTrack = await fetchYouTubeTrack(trimmed);
    if (ytTrack) {
      return [ytTrack];
    }
  }

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    return data.tracks || [];
  } catch (err) {
    console.error('Search error:', err);
    return [];
  }
}

export async function getTrendingTracks(): Promise<Track[]> {
  try {
    const res = await fetch('/api/trending');
    if (!res.ok) throw new Error('Failed to fetch trending tracks');
    const data = await res.json();
    return data.tracks || [];
  } catch (err) {
    console.error('Trending fetch error:', err);
    return [];
  }
}

export async function getRecommendedTracks(
  artist: string,
  title: string,
  currentId?: string
): Promise<Track[]> {
  try {
    const params = new URLSearchParams();
    if (artist) params.set('artist', artist);
    if (title) params.set('title', title);
    if (currentId) params.set('currentId', currentId);

    const res = await fetch(`/api/recommendations?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch recommendations');
    const data = await res.json();
    return data.tracks || [];
  } catch (err) {
    console.error('Recommendation fetch error, falling back to trending:', err);
    return getTrendingTracks();
  }
}

export async function fetchSpotifyPlaylist(url: string): Promise<SpotifyPlaylistResponse | null> {
  try {
    const res = await fetch(`/api/spotify/playlist?url=${encodeURIComponent(url.trim())}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to fetch playlist');
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Spotify import error:', err);
    throw err;
  }
}

export async function matchSpotifyTrack(title: string, artist: string): Promise<Track | null> {
  try {
    const query = `${title} ${artist}`;
    const results = await searchTracks(query);
    if (results.length > 0) {
      return results[0];
    }
    // Fallback search with title only
    const fallbackResults = await searchTracks(title);
    return fallbackResults[0] || null;
  } catch (err) {
    return null;
  }
}
