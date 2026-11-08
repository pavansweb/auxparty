'use client';

import React from 'react';
import type { Track } from '@/lib/tracks';
import { Volume2, Sparkles, Play } from 'lucide-react';

interface AutoplayBannerProps {
  currentTrack: Track | null;
  onUnlock: () => void;
}

export const AutoplayBanner: React.FC<AutoplayBannerProps> = ({
  currentTrack,
  onUnlock,
}) => {
  if (!currentTrack) return null;

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 50,
        top: '18px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(92vw, 480px)',
        background: 'linear-gradient(135deg, rgba(27, 32, 21, 0.95), rgba(18, 22, 14, 0.98))',
        border: '1px solid var(--lime)',
        boxShadow: '0 12px 35px rgba(0, 0, 0, 0.6), 0 0 25px rgba(198, 242, 119, 0.25)',
        borderRadius: '12px',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px',
        backdropFilter: 'blur(16px)',
        animation: 'pulseGlow 2.5s ease-in-out infinite',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            overflow: 'hidden',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <img
            src={currentTrack.image}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        <div style={{ display: 'grid', gap: '2px', minWidth: 0 }}>
          <div
            style={{
              fontSize: '9px',
              letterSpacing: '0.12em',
              fontWeight: 700,
              color: 'var(--lime)',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <Sparkles size={11} /> MUSIC IS PLAYING IN THIS ROOM
          </div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#fff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {currentTrack.title}
          </div>
          <div
            style={{
              fontSize: '9px',
              color: '#9ba091',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {currentTrack.artist}
          </div>
        </div>
      </div>

      <button
        onClick={onUnlock}
        style={{
          border: 0,
          background: 'var(--lime)',
          color: '#151b0d',
          fontWeight: 750,
          fontSize: '10px',
          padding: '8px 14px',
          borderRadius: '7px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          boxShadow: '0 4px 12px rgba(198, 242, 119, 0.4)',
        }}
      >
        <Volume2 size={14} /> Click to Sync & Listen
      </button>
    </div>
  );
};
