'use client';

import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { Player } from '@/lib/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface ChatMessage {
  id: string;
  text: string;
  from: Player;
  ts: number;
}

const QUICK_MESSAGES = ['HURRY UP', 'LOVE YOU', 'GG', 'OOPS', 'NICE MOVE', "YOU'RE COOKED", 'OOF', 'NOOO'];

const COLOR_HEX = { blue: '#00CFFF', red: '#FF2D55' } as const;
const COLOR_RGB = { blue: '0,207,255', red: '255,45,85' } as const;

const MAX_LEN = 120;
const MAX_HISTORY = 80;

export default function Chat({ roomId, myColor }: { roomId: string; myColor: Player | null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [incoming, setIncoming] = useState<ChatMessage | null>(null);
  const [unread, setUnread] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const cooldownRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(false);
  useEffect(() => { openRef.current = open; }, [open]);

  useEffect(() => {
    const channel = supabase.channel(`chat:${roomId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on('broadcast', { event: 'msg' }, (payload) => {
      const m = payload.payload as ChatMessage;
      if (m.from === myColor) return;
      setMessages((prev) => [...prev.slice(-MAX_HISTORY + 1), m]);
      if (!openRef.current) {
        setIncoming(m);
        setUnread((u) => u + 1);
        if (incomingTimerRef.current) clearTimeout(incomingTimerRef.current);
        incomingTimerRef.current = setTimeout(() => setIncoming(null), 3400);
      }
    });
    channel.subscribe();
    channelRef.current = channel;
    return () => {
      if (incomingTimerRef.current) clearTimeout(incomingTimerRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, myColor]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
    setUnread(0);
    setIncoming(null);
    // Focus input when opening
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, messages.length]);

  if (!myColor) return null;

  const myHex = COLOR_HEX[myColor];
  const myRgb = COLOR_RGB[myColor];

  const send = (raw: string) => {
    const trimmed = raw.trim().slice(0, MAX_LEN);
    if (!trimmed || cooldownRef.current || !channelRef.current) return;
    const m: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      from: myColor,
      ts: Date.now(),
    };
    channelRef.current.send({ type: 'broadcast', event: 'msg', payload: m });
    setMessages((prev) => [...prev.slice(-MAX_HISTORY + 1), m]);
    setDraft('');
    cooldownRef.current = true;
    setTimeout(() => { cooldownRef.current = false; }, 350);
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      send(draft);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <>
      {/* Incoming toast — only when panel is closed */}
      {incoming && !open && (
        <div
          className="anim-slide-up-fast"
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            top: '18px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            padding: '10px 18px',
            background: '#0D0D22',
            border: `1px solid rgba(${COLOR_RGB[incoming.from]},0.55)`,
            borderTop: `3px solid ${COLOR_HEX[incoming.from]}`,
            borderRadius: '4px',
            boxShadow: `0 0 24px rgba(${COLOR_RGB[incoming.from]},0.28)`,
            cursor: 'pointer',
            maxWidth: '320px',
          }}
        >
          <div
            className="ff-space"
            style={{
              color: `rgba(${COLOR_RGB[incoming.from]},0.55)`,
              fontSize: '8px',
              letterSpacing: '0.22em',
              marginBottom: '4px',
            }}
          >
            {incoming.from === 'blue' ? 'BLUE' : 'RED'} SAYS
          </div>
          <div
            className="ff-bebas"
            style={{
              color: COLOR_HEX[incoming.from],
              fontSize: '18px',
              letterSpacing: '0.05em',
              lineHeight: 1.15,
              wordBreak: 'break-word',
            }}
          >
            {incoming.text}
          </div>
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="anim-slide-up-fast"
          style={{
            position: 'fixed',
            bottom: '76px',
            right: '18px',
            zIndex: 56,
            width: 'min(320px, calc(100vw - 36px))',
            height: '420px',
            background: '#0D0D22',
            border: `1px solid rgba(${myRgb},0.45)`,
            borderTop: `3px solid ${myHex}`,
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 28px rgba(${myRgb},0.12)`,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid rgba(170,170,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              className="ff-bebas"
              style={{ color: myHex, fontSize: '16px', letterSpacing: '0.2em' }}
            >
              CHAT
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(170,170,255,0.5)',
                fontSize: '22px',
                lineHeight: 1,
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >
              ×
            </button>
          </div>

          {/* Message list */}
          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {messages.length === 0 && (
              <div
                className="ff-space"
                style={{
                  color: 'rgba(170,170,255,0.25)',
                  fontSize: '9px',
                  letterSpacing: '0.16em',
                  textAlign: 'center',
                  marginTop: '24px',
                  textTransform: 'uppercase',
                }}
              >
                no messages yet — say hi 👋
              </div>
            )}
            {messages.map((m) => {
              const mine = m.from === myColor;
              const hex = COLOR_HEX[m.from];
              const rgb = COLOR_RGB[m.from];
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    background: `rgba(${rgb},0.08)`,
                    border: `1px solid rgba(${rgb},0.32)`,
                    borderLeft: mine ? 'none' : `3px solid ${hex}`,
                    borderRight: mine ? `3px solid ${hex}` : 'none',
                    padding: '6px 10px',
                    borderRadius: '4px',
                  }}
                >
                  <div
                    className="ff-space"
                    style={{
                      color: `rgba(${rgb},0.55)`,
                      fontSize: '7px',
                      letterSpacing: '0.2em',
                      marginBottom: '2px',
                    }}
                  >
                    {mine ? 'YOU' : m.from === 'blue' ? 'BLUE' : 'RED'}
                  </div>
                  <div
                    style={{
                      color: 'rgba(240,240,255,0.92)',
                      fontSize: '13px',
                      lineHeight: 1.3,
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick taunts */}
          <div
            style={{
              padding: '8px 10px',
              borderTop: '1px solid rgba(170,170,255,0.07)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
            }}
          >
            {QUICK_MESSAGES.map((m) => (
              <button
                key={m}
                onClick={() => send(m)}
                className="ff-space"
                style={{
                  background: 'transparent',
                  border: `1px solid rgba(${myRgb},0.3)`,
                  color: `rgba(${myRgb},0.85)`,
                  padding: '4px 8px',
                  fontSize: '9px',
                  letterSpacing: '0.12em',
                  cursor: 'pointer',
                  borderRadius: '3px',
                  textTransform: 'uppercase',
                  transition: 'background 0.12s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${myRgb},0.12)`; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Input */}
          <div
            style={{
              padding: '8px 10px 10px',
              borderTop: '1px solid rgba(170,170,255,0.07)',
              display: 'flex',
              gap: '6px',
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
              onKeyDown={onInputKey}
              placeholder="type a message..."
              maxLength={MAX_LEN}
              style={{
                flex: 1,
                background: '#06060F',
                border: '1px solid rgba(170,170,255,0.12)',
                color: 'rgba(240,240,255,0.95)',
                padding: '8px 10px',
                fontSize: '13px',
                fontFamily: 'inherit',
                borderRadius: '3px',
                outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = `rgba(${myRgb},0.55)`; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(170,170,255,0.12)'; }}
            />
            <button
              onClick={() => send(draft)}
              disabled={!draft.trim()}
              className="ff-bebas"
              style={{
                background: draft.trim() ? `rgba(${myRgb},0.15)` : 'transparent',
                border: `1px solid rgba(${myRgb},${draft.trim() ? '0.55' : '0.2'})`,
                color: draft.trim() ? myHex : `rgba(${myRgb},0.4)`,
                padding: '0 14px',
                fontSize: '15px',
                letterSpacing: '0.14em',
                cursor: draft.trim() ? 'pointer' : 'not-allowed',
                borderRadius: '3px',
              }}
            >
              SEND
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        style={{
          position: 'fixed',
          bottom: '18px',
          right: '18px',
          zIndex: 56,
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: open ? `rgba(${myRgb},0.18)` : '#0D0D22',
          border: `1px solid rgba(${myRgb},0.55)`,
          color: myHex,
          fontSize: '22px',
          cursor: 'pointer',
          boxShadow: `0 4px 14px rgba(0,0,0,0.55), 0 0 18px rgba(${myRgb},0.18)`,
          transition: 'background 0.15s ease, transform 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {open ? '×' : '💬'}
        {!open && unread > 0 && (
          <span
            className="ff-orbit"
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              minWidth: '20px',
              height: '20px',
              padding: '0 5px',
              borderRadius: '10px',
              background: myHex,
              color: '#06060F',
              fontSize: '11px',
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 10px rgba(${myRgb},0.8)`,
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </>
  );
}
