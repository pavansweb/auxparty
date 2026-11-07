function extractYouTubeId(urlOrId) {
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

function cleanHtml(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const rawUrl = req.query.url || req.query.q;
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing YouTube URL or video ID' });
  }

  const videoId = extractYouTubeId(rawUrl);
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube link or video ID' });
  }

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedRes = await fetch(oembedUrl);
    if (!oembedRes.ok) {
      return res.status(404).json({ error: 'YouTube video not found or embed restricted' });
    }
    const oembed = await oembedRes.json();

    const track = {
      id: `yt-${videoId}`,
      youtubeId: videoId,
      source: 'youtube',
      title: cleanHtml(oembed.title || 'YouTube Track'),
      artist: cleanHtml(oembed.author_name || 'YouTube'),
      album: 'YouTube',
      duration: 0,
      image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
      has320: false,
    };

    return res.status(200).json({ success: true, track });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
