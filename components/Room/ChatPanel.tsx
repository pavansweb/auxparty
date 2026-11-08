'use client';

import React, { useRef, useEffect } from 'react';
import type { Message } from '@/lib/store';
import { Send, MessageCircle } from 'lucide-react';

interface ChatPanelProps {
  messages: Message[];
  messageText: string;
  onMessageChange: (text: string) => void;
  onSendMessage: () => void;
  onSendReaction: (emoji: string) => void;
}

const REACTIONS = ['💚', '✨', '🔥', '🎧', '🪩'];

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  messageText,
  onMessageChange,
  onSendMessage,
  onSendReaction,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="room-content chat-content">
      <div className="chat-date">TODAY · LIVE ROOM CHAT</div>

      {messages.map((m) => (
        <div
          className={`chat-message ${m.system ? 'system-message' : ''}`}
          key={m.id}
        >
          {!m.system && (
            <div className="chat-avatar">{m.user.slice(0, 1).toUpperCase()}</div>
          )}
          <div className="message-content">
            <div className="message-byline">
              <b>{m.user}</b>
              <time>
                {new Date(m.time).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </time>
            </div>
            <p>{m.text}</p>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />

      {messages.length === 0 && (
        <div className="empty-chat">
          <MessageCircle size={24} />
          <b>It’s quiet in here</b>
          <span>Say hi to everyone in the room.</span>
        </div>
      )}

      <div className="chat-reactions">
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSendReaction(emoji)}
            title={`Send ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSendMessage();
        }}
      >
        <input
          value={messageText}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder="Say something nice..."
        />
        <button disabled={!messageText.trim()} aria-label="Send message">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};
