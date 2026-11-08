import { NextResponse } from 'next/server';
import { fallbackTracks, normalizeSong } from '@/lib/tracks';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('query')?.trim();
  if (!q) return NextResponse.json({ tracks: fallbackTracks, source: 'demo' });

  const endpoints = [
    `https://saavn.me/search/songs?query=${encodeURIComponent(q)}&page=1&limit=20`,
    `https://saavn.dev/api/search/songs?query=${encodeURIComponent(q)}&page=1&limit=20`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        signal: AbortSignal.timeout(6500),
        headers: { 'user-agent': 'AuxParty/2.0' },
      });
      if (res.ok) {
        const d = await res.json();
        const rows = d?.data?.results || d?.results || (Array.isArray(d?.data) ? d.data : []);
        if (Array.isArray(rows) && rows.length > 0) {
          const tracks = rows.map(normalizeSong).filter((t: any) => t?.streamUrl);
          if (tracks.length > 0) return NextResponse.json({ tracks, source: 'saavn' });
        }
      }
    } catch {
      // Try next endpoint or fall through
    }
  }

  const terms = q.toLowerCase().split(/\s+/);
  const tracks = fallbackTracks.filter((t) =>
    terms.some((w) => `${t.title} ${t.artist}`.toLowerCase().includes(w))
  );
  return NextResponse.json({ tracks: tracks.length ? tracks : fallbackTracks, source: 'demo' });
}
