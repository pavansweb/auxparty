export type AudioQuality = 'auto' | '320kbps' | '160kbps' | '96kbps' | '48kbps' | '12kbps';

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  image: string;
  duration: number;
  streamUrl: string;
  downloadUrls?: { quality: string; url: string }[];
  addedBy?: string;
  source?: string;
};

const covers = [
  'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=640&h=640&fit=crop',
  'https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=640&h=640&fit=crop',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=640&h=640&fit=crop',
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=640&h=640&fit=crop',
  'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=640&h=640&fit=crop',
  'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=640&h=640&fit=crop',
];

export const fallbackTracks: Track[] = Array.from({ length: 8 }, (_, i) => {
  const streamUrl = `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${i + 1}.mp3`;
  return {
    id: `demo-${i + 1}`,
    title: ['Night Drive', 'Golden Hour', 'Afterglow', 'Blue Skies', 'Daydream', 'Slow Motion', 'Open Road', 'Soft Focus'][i],
    artist: ['Mira Sol', 'The Sunroom', 'Juniper Lane', 'Atlas Bloom', 'Milo June', 'Lena Vale', 'Harbor Lights', 'Sunday Club'][i],
    album: 'SyncWave Sessions',
    image: covers[i % covers.length],
    duration: 198 + i * 13,
    streamUrl,
    downloadUrls: [
      { quality: '320kbps', url: streamUrl },
      { quality: '160kbps', url: streamUrl },
      { quality: '96kbps', url: streamUrl },
    ],
    source: 'demo',
  };
});

function clean(s: unknown): string {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

export function normalizeSong(song: any): Track | null {
  if (!song) return null;
  const id = String(song?.id || song?.encodeId || song?.song_id || '');
  const title = clean(song?.name || song?.song || song?.title);
  if (!title) return null;

  const artists = Array.isArray(song?.artists)
    ? song.artists.map((a: any) => clean(a?.name)).filter(Boolean).join(', ')
    : clean(song?.primary_artists || song?.singers || song?.artist || song?.primaryArtists?.[0]?.name || 'Unknown artist');

  const rawDownloadUrls = Array.isArray(song?.downloadUrl)
    ? song.downloadUrl
    : Array.isArray(song?.media_url)
    ? song.media_url
    : [];

  const downloadUrls: { quality: string; url: string }[] = rawDownloadUrls.map((u: any) => ({
    quality: String(u?.quality || u?.bitrate || '320kbps'),
    url: String(u?.url || u?.link || ''),
  })).filter((u: { quality: string; url: string }) => !!u.url);

  // Pick highest quality available (prefer 320kbps)
  let streamUrl =
    downloadUrls.find((u) => u.quality === '320kbps')?.url ||
    downloadUrls.find((u) => u.quality === '160kbps')?.url ||
    downloadUrls.at(-1)?.url ||
    song?.url ||
    song?.media_url ||
    song?.streamUrl ||
    '';

  if (!streamUrl && typeof rawDownloadUrls === 'string') {
    streamUrl = rawDownloadUrls;
  }

  const rawImage = song?.image;
  const image =
    (Array.isArray(rawImage)
      ? rawImage.find((x: any) => x.quality === '500x500')?.url || rawImage.at(-1)?.url
      : '') ||
    rawImage ||
    song?.album?.image?.at?.(-1)?.url ||
    fallbackTracks[0].image;

  return {
    id,
    title,
    artist: artists || 'Unknown artist',
    album: clean(song?.album?.name || song?.album || 'Single'),
    image: String(image).replace('150x150', '500x500'),
    duration: Math.round(Number(song?.duration) || 0),
    streamUrl: String(streamUrl),
    downloadUrls: downloadUrls.length ? downloadUrls : [{ quality: '320kbps', url: String(streamUrl) }],
    source: 'saavn',
  };
}

export function getStreamUrlForQuality(track: Track | null | undefined, quality: AudioQuality): string {
  if (!track) return '';
  if (!track.downloadUrls || track.downloadUrls.length === 0) return track.streamUrl;

  if (quality === '320kbps') {
    const match = track.downloadUrls.find((u) => u.quality === '320kbps');
    if (match?.url) return match.url;
  } else if (quality === '96kbps') {
    const match =
      track.downloadUrls.find((u) => u.quality === '96kbps') ||
      track.downloadUrls.find((u) => u.quality === '48kbps') ||
      track.downloadUrls.find((u) => u.quality === '12kbps');
    if (match?.url) return match.url;
  } else if (quality === '160kbps') {
    const match =
      track.downloadUrls.find((u) => u.quality === '160kbps') ||
      track.downloadUrls.find((u) => u.quality === '320kbps');
    if (match?.url) return match.url;
  }

  // Auto quality: default to 320kbps if available, else highest
  const best =
    track.downloadUrls.find((u) => u.quality === '320kbps') ||
    track.downloadUrls.find((u) => u.quality === '160kbps') ||
    track.downloadUrls.at(-1);

  return best?.url || track.streamUrl;
}
