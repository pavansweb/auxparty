'use client';

import React from 'react';
import type { RoomUser, RoomMode } from '@/lib/store';
import { Share2, X, Plus, ShieldCheck, Users } from 'lucide-react';

interface RoomHeaderProps {
  roomCode: string;
  listeners: RoomUser[];
  tab: 'queue' | 'chat';
  queueCount: number;
  isHost?: boolean;
  mode?: RoomMode;
  onCloseMobile: () => void;
  onShare: () => void;
  onTabChange: (tab: 'queue' | 'chat') => void;
  onToggleMode?: () => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  roomCode,
  listeners,
  tab,
  queueCount,
  isHost = false,
  mode = 'collaborative',
  onCloseMobile,
  onShare,
  onTabChange,
  onToggleMode,
}) => {
  return (
    <>
      <div className="room-heading">
        <div>
          <div className="eyebrow">LISTENING ROOM</div>
          <h2>
            <span className="live-dot" />
            The living room
          </h2>
        </div>
        <button className="room-close" onClick={onCloseMobile} aria-label="Close drawer">
          <X size={18} />
        </button>
        <button className="tiny-icon share-btn" onClick={onShare} aria-label="Share room">
          <Share2 size={17} />
        </button>
      </div>

      <div className="room-code-row">
        <div>
          <span className="code-label">ROOM CODE</span>
          <b>{roomCode}</b>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {isHost && (
            <button
              onClick={onToggleMode}
              title={mode === 'dj' ? 'Switch to Collaborative' : 'Switch to DJ Mode'}
              style={{
                fontSize: '8px',
                padding: '5px 7px',
                background: mode === 'dj' ? 'rgba(198, 242, 119, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                color: mode === 'dj' ? 'var(--lime)' : '#aaa',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {mode === 'dj' ? <ShieldCheck size={11} /> : <Users size={11} />}
              {mode === 'dj' ? 'DJ Mode' : 'Collab'}
            </button>
          )}
          <button onClick={onShare}>
            Share <Share2 size={13} />
          </button>
        </div>
      </div>

      <div className="listeners-row">
        <div className="avatar-stack">
          {listeners.slice(0, 4).map((u, i) => (
            <img key={u.id || i} src={u.avatar} alt={u.name} title={u.name} />
          ))}
        </div>
        <div className="listener-text">
          <b>{listeners.length || 1} listening</b>
          <span>{mode === 'dj' ? 'Host/DJ controlling vibe' : 'All together, right now'}</span>
        </div>
        <button className="invite-icon" onClick={onShare} title="Invite friends">
          <Plus size={17} />
        </button>
      </div>

      <div className="room-tabs">
        <button
          onClick={() => onTabChange('queue')}
          className={tab === 'queue' ? 'selected' : ''}
        >
          Up next <span>{queueCount}</span>
        </button>
        <button
          onClick={() => onTabChange('chat')}
          className={tab === 'chat' ? 'selected' : ''}
        >
          Room chat <span className="chat-live">●</span>
        </button>
      </div>
    </>
  );
};
