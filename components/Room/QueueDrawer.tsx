'use client';

import React from 'react';
import type { Track } from '@/lib/tracks';
import { MessageCircle, Heart, X, Disc3, Search, Sparkles, FastForward } from 'lucide-react';

interface QueueDrawerProps {
  current: Track | null;
  queue: Track[];
  skipVotes?: string[];
  activeUsersCount?: number;
  myUserId?: string;
  isHostOrDj?: boolean;
  mode?: 'collaborative' | 'dj';
  onRemove: (id: string) => void;
  onVoteSkip: () => void;
  onSwitchToChat: () => void;
  onFindSongs: () => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({
  current,
  queue,
  skipVotes = [],
  activeUsersCount = 1,
  myUserId = '',
  isHostOrDj = false,
  mode = 'collaborative',
  onRemove,
  onVoteSkip,
  onSwitchToChat,
  onFindSongs,
}) => {
  const hasVoted = myUserId && skipVotes.includes(myUserId);
  const requiredVotes = activeUsersCount <= 2 ? activeUsersCount : Math.floor(activeUsersCount / 2) + 1;

  return (
    <div className="room-content queue-content">
      <div className="queue-subhead">
        <span>PLAYING NEXT</span>
        <button onClick={onSwitchToChat}>
          Say something <MessageCircle size={13} />
        </button>
      </div>

      {current && (
        <div className="now-playing-card">
          <div className="playing-cover">
            <img src={current.image} alt={current.title} />
            <span className="playing-bars">
              <i />
              <i />
              <i />
            </span>
          </div>
          <div className="playing-info">
            <span className="now-label">NOW PLAYING</span>
            <b>{current.title}</b>
            <span>{current.artist}</span>
          </div>

          <button
            onClick={onVoteSkip}
            title={hasVoted ? 'Retract vote to skip' : 'Vote to skip this track'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '5px',
              fontSize: '8px',
              background: hasVoted ? 'rgba(198, 242, 119, 0.25)' : 'rgba(255, 255, 255, 0.06)',
              color: hasVoted ? 'var(--lime)' : '#aaa',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <FastForward size={12} />
            <span>
              {skipVotes.length > 0 ? `${skipVotes.length}/${requiredVotes}` : 'Skip'}
            </span>
          </button>
        </div>
      )}

      {queue.length > 0 ? (
        queue.map((t, i) => (
          <div className="queue-item" key={`${t.id}-${i}`}>
            <span className="queue-number">{String(i + 1).padStart(2, '0')}</span>
            <img src={t.image} alt="" />
            <div>
              <b>{t.title}</b>
              <span>{t.artist}</span>
              <small>Added by {t.addedBy || 'Friend'}</small>
            </div>
            {(mode === 'collaborative' || isHostOrDj) && (
              <button
                onClick={() => onRemove(t.id)}
                title="Remove from queue"
                aria-label="Remove"
              >
                <X size={15} />
              </button>
            )}
          </div>
        ))
      ) : (
        <div className="empty-queue">
          <div className="empty-disc">
            <Disc3 size={23} />
          </div>
          <b>The queue is yours</b>
          <span>Add a song and set the mood.</span>
          <button onClick={onFindSongs}>
            Find something <Search size={13} />
          </button>
        </div>
      )}

      <div className="add-next">
        <Sparkles size={15} />
        <span>
          {mode === 'dj'
            ? 'DJ mode: DJ controls playback, listeners add to queue'
            : 'Collaborative mode: everyone can add & skip'}
        </span>
      </div>

      <div className="room-mood">
        <div className="mood-head">
          <div>
            <span className="eyebrow">ROOM MOOD</span>
            <b>Harmonic Flow</b>
          </div>
          <span className="mood-badge">✦ Live Sync</span>
        </div>
        <div className="mood-wave">
          {Array.from({ length: 32 }, (_, i) => (
            <i
              key={i}
              style={{
                height: `${12 + Math.sin(i * 0.66) * 12 + ((i * 7) % 10)}px`,
              }}
            />
          ))}
        </div>
        <div className="mood-caption">
          <span>Synced with peers</span>
          <span>Adaptive Bitrate</span>
        </div>
      </div>
    </div>
  );
};
