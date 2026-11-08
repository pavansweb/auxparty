'use client';

import React from 'react';
import type { Track } from '@/lib/tracks';
import { Play, Pause, Plus } from 'lucide-react';

interface TrackCardProps {
  track: Track;
  index: number;
  isCurrent?: boolean;
  isPlaying?: boolean;
  onPlay: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

export const TrackCard: React.FC<TrackCardProps> = ({
  track,
  index,
  isCurrent = false,
  isPlaying = false,
  onPlay,
  onAddToQueue,
}) => {
  return (
    <article className={`track-card ${isCurrent ? 'ring-1 ring-[var(--lime)]/40 rounded-lg' : ''}`}>
      <div className="cover-wrap">
        <img
          src={track.image}
          alt={track.title}
          loading="lazy"
        />
        <span className="cover-index">{String(index + 1).padStart(2, '0')}</span>

        <button
          className="play-overlay"
          onClick={() => onPlay(track)}
          aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        >
          {isCurrent && isPlaying ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
        </button>

        <button
          className="add-overlay"
          onClick={(e) => {
            e.stopPropagation();
            onAddToQueue(track);
          }}
          aria-label={`Add ${track.title} to queue`}
          title="Add to room queue"
        >
          <Plus size={15} />
        </button>
      </div>

      <div className="track-meta">
        <button onClick={() => onPlay(track)} className="track-title" title={track.title}>
          {track.title}
        </button>
        <span title={track.artist}>{track.artist}</span>
        <small>
          {isCurrent ? (
            <span className="equalizer">▂ ▄ ▆ </span>
          ) : null}
          {track.album || 'Single'}
        </small>
      </div>
    </article>
  );
};
