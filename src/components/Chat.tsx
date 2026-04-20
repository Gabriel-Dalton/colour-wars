'use client';

import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { Player, GameStatus } from '@/lib/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface ChatMessage {
  id: string;
  text: string;
  from: Player;
  ts: number;
  system?: boolean;
}

interface ReactionPayload {
  messageId: string;
  emoji: string;
  from: Player;
}

const QUICK_MESSAGES = ['HURRY UP', 'LOVE YOU', 'GG', 'OOPS', 'NICE MOVE', "YOU'RE COOKED", 'OOF', 'NOOO'];
const EMOJIS = ['👍', '😂', '🔥', '💀', '😭', '❤️'];

const COLOR_HEX = { blue: '#00CFFF', red: '#FF2D55' } as const;
const COLOR_RGB = { blue: '0,207,255', red: '255,45,85' } as const;

const MAX_LEN = 120;
const MAX_HISTORY = 80;

export default function Chat({
  roomId,
  myColor,
  gameStatus,
}: {
  roomId: string;
  myColor: Player | null;
  gameStatus?: GameStatus;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Record<string, { emoji: string; from: Player }[]>>({});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [incoming, setIncoming] = useState<ChatMessage | null>(null);
  const [unread, setUnread] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const cooldownRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(false);
  const disconnectNotedRef = useRef(false);
  useEffect(() => { openRef.current = open; }, [open]);

  useEffect(() => {
    if (!myColor || gameStatus === 'finished') return;
    const channel = supabase.channel(`chat:${roomId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: myColor },
      },
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
    channel.on('broadcast', { event: 'reaction' }, (payload) => {
      const r = payload.payload as ReactionPayload;
      setReactions((prev) => {
        const existing = prev[r.messageId] || [];
        const idx = existing.findIndex((x) => x.from === r.from && x.emoji === r.emoji);
        const next = idx >= 0
          ? existing.filter((_, i) => i !== idx)
          : [...existing, { emoji: r.emoji, from: r.from }];
        return { ...prev, [r.messageId]: next };
      });
    });
    channel.on('presence', { event: 'leave' }, ({ key }) => {
      if (key === myColor || disconnectNotedRef.current) return;
      disconnectNotedRef.current = true;
      const other = (key === 'blue' ? 'blue' : 'red') as Player;
      const sys: ChatMessage = {
        id: `sys-leave-${Date.now()}`,
        text: `${other.toUpperCase()} disconnected from chat`,
        from: other,
        ts: Date.now(),
        system: true,
      };
      setMessages((prev) => [...prev.slice(-MAX_HISTORY + 1), sys]);
      if (!openRef.current) {
        setIncoming(sys);
        setUnread((u) => u + 1);
        if (incomingTimerRef.current) clearTimeout(incomingTimerRef.current);
        incomingTimerRef.current = setTimeout(() => setIncoming(null), 4200);
      }
    });
    channel.on('presence', { event: 'join' }, ({ key }) => {
      if (key !== myColor) disconnectNotedRef.current = false;
    });
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ color: myColor, at: Date.now() });
      }
    });
    channelRef.current = channel;
    return () => {
      if (incomingTimerRef.current) clearTimeout(incomingTimerRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, myColor, gameStatus]);

  useEffect(() => {
    if (gameStatus !== 'finished') return;
    setMessages([]);
    setReactions({});
    setIncoming(null);
    setUnread(0);
    setOpen(false);
    setPickerFor(null);
    setDraft('');
  }, [gameStatus]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
    setUnread(0);
    setIncoming(null);
    // Focus input when opening
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, messages.length]);

  if (!myColor || gameStatus === 'finished') return null;

  const myHex = COLOR_HEX[myColor];
  const myRgb = COLOR_RGB[myColor];

  const sendReaction = (messageId: string, emoji: string) => {
    if (!channelRef.current) return;
    const payload: ReactionPayload = { messageId, emoji, from: myColor };
    channelRef.current.send({ type: 'broadcast', event: 'reaction', payload });
    setReactions((prev) => {
      const existing = prev[messageId] || [];
      const idx = existing.findIndex((x) => x.from === myColor && x.emoji === emoji);
      const next = idx >= 0
        ? existing.filter((_, i) => i !== idx)
        : [...existing, { emoji, from: myColor }];
      return { ...prev, [messageId]: next };
    });
    setPickerFor(null);
  };

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
      {/* Incoming transmission toast — only when panel is closed */}
      {incoming && !open && (() => {
        const senderHex = COLOR_HEX[incoming.from];
        const senderRgb = COLOR_RGB[incoming.from];
        return (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
            className="anim-toast-deploy"
            style={{
              position: 'fixed',
              top: '18px',
              left: '50%',
              zIndex: 60,
              width: 'min(340px, calc(100vw - 28px))',
              background: '#0A0A1A',
              border: `1px solid rgba(${senderRgb},0.38)`,
              borderTop: `2px solid ${senderHex}`,
              boxShadow: `0 8px 28px rgba(0,0,0,0.6), 0 0 28px rgba(${senderRgb},0.22)`,
              cursor: 'pointer',
              overflow: 'hidden',
            }}
          >
            {/* Scan-line sweep across the top edge */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '2px',
                width: '40%',
                background: `linear-gradient(90deg, transparent 0%, ${senderHex} 50%, transparent 100%)`,
                filter: `drop-shadow(0 0 6px ${senderHex})`,
                animation: 'toast-scan 2.4s linear infinite',
              }}
            />

            {/* Header row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px 4px',
                gap: '8px',
              }}
            >
              <span
                className="ff-space"
                style={{
                  color: `rgba(${senderRgb},0.62)`,
                  fontSize: '9px',
                  letterSpacing: '0.24em',
                  textTransform: 'uppercase',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span style={{ color: senderHex, fontSize: '11px', lineHeight: 1 }}>▸</span>
                INCOMING
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ color: senderHex }}>{incoming.from === 'blue' ? 'BLUE' : 'RED'}</span>
              </span>

              {/* Signal dot */}
              <span
                aria-hidden
                style={{
                  width: '6px',
                  height: '6px',
                  background: senderHex,
                  boxShadow: `0 0 8px 1px ${senderHex}`,
                  animation: 'pip-alert 1.1s ease-in-out infinite',
                }}
              />
            </div>

            {/* Message body */}
            <div
              style={{
                padding: '2px 14px 10px',
                color: 'rgba(240,240,255,0.95)',
                fontSize: '14px',
                lineHeight: 1.35,
                letterSpacing: '0.01em',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}
            >
              {incoming.text}
            </div>

            {/* Footer hint */}
            <div
              style={{
                padding: '6px 14px 8px',
                borderTop: `1px solid rgba(${senderRgb},0.12)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span
                className="ff-space"
                style={{
                  color: 'rgba(170,170,255,0.35)',
                  fontSize: '8px',
                  letterSpacing: '0.26em',
                  textTransform: 'uppercase',
                }}
              >
                Tap to open
              </span>
              <span
                className="ff-space"
                style={{
                  color: `rgba(${senderRgb},0.5)`,
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                }}
              >
                ▸
              </span>
            </div>
          </div>
        );
      })()}

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
              if (m.system) {
                return (
                  <div
                    key={m.id}
                    className="ff-space"
                    style={{
                      alignSelf: 'center',
                      color: 'rgba(170,170,255,0.55)',
                      fontSize: '9px',
                      letterSpacing: '0.22em',
                      textTransform: 'uppercase',
                      padding: '4px 10px',
                      border: '1px dashed rgba(170,170,255,0.22)',
                      borderRadius: '3px',
                    }}
                  >
                    ▸ {m.text}
                  </div>
                );
              }
              const mine = m.from === myColor;
              const hex = COLOR_HEX[m.from];
              const rgb = COLOR_RGB[m.from];
              const msgReactions = reactions[m.id] || [];
              const grouped = msgReactions.reduce<Record<string, Player[]>>((acc, r) => {
                (acc[r.emoji] ||= []).push(r.from);
                return acc;
              }, {});
              const showPicker = pickerFor === m.id;
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: mine ? 'flex-end' : 'flex-start',
                    gap: '3px',
                    position: 'relative',
                  }}
                >
                  <div
                    onClick={() => setPickerFor((p) => (p === m.id ? null : m.id))}
                    style={{
                      background: `rgba(${rgb},0.08)`,
                      border: `1px solid rgba(${rgb},0.32)`,
                      borderLeft: mine ? 'none' : `3px solid ${hex}`,
                      borderRight: mine ? `3px solid ${hex}` : 'none',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      cursor: 'pointer',
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

                  {showPicker && (
                    <div
                      style={{
                        display: 'flex',
                        gap: '2px',
                        background: '#06060F',
                        border: `1px solid rgba(${myRgb},0.35)`,
                        borderRadius: '3px',
                        padding: '3px',
                      }}
                    >
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          onClick={(ev) => { ev.stopPropagation(); sendReaction(m.id, e); }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            padding: '2px 4px',
                            fontSize: '15px',
                            cursor: 'pointer',
                            lineHeight: 1,
                          }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}

                  {Object.keys(grouped).length > 0 && (
                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                      {Object.entries(grouped).map(([emoji, froms]) => {
                        const mineReacted = froms.includes(myColor);
                        return (
                          <button
                            key={emoji}
                            onClick={() => sendReaction(m.id, emoji)}
                            style={{
                              background: mineReacted ? `rgba(${myRgb},0.18)` : 'rgba(255,255,255,0.04)',
                              border: `1px solid rgba(${myRgb},${mineReacted ? '0.55' : '0.18'})`,
                              color: 'rgba(240,240,255,0.9)',
                              fontSize: '11px',
                              padding: '1px 6px',
                              borderRadius: '10px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              lineHeight: 1.4,
                            }}
                          >
                            <span>{emoji}</span>
                            <span style={{ fontSize: '10px', opacity: 0.75 }}>{froms.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
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

      {/* ── COMMS terminal plate ─────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close comms' : 'Open comms'}
        aria-expanded={open}
        style={{
          position: 'fixed',
          bottom: '18px',
          right: '18px',
          zIndex: 56,
          height: '44px',
          padding: '0 14px 0 12px',
          background: open ? `rgba(${myRgb},0.12)` : '#0A0A1A',
          border: `1px solid rgba(${myRgb},${open ? '0.7' : '0.42'})`,
          borderTop: `3px solid ${myHex}`,
          borderRadius: 0,
          color: myHex,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: open
            ? `0 4px 14px rgba(0,0,0,0.55), 0 0 22px rgba(${myRgb},0.24), inset 0 0 0 1px rgba(${myRgb},0.05)`
            : `0 4px 14px rgba(0,0,0,0.55), 0 0 14px rgba(${myRgb},0.14)`,
          transition: 'background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.12s ease',
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = open ? `rgba(${myRgb},0.18)` : `rgba(${myRgb},0.08)`;
          e.currentTarget.style.borderColor = `rgba(${myRgb},0.75)`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = open ? `rgba(${myRgb},0.12)` : '#0A0A1A';
          e.currentTarget.style.borderColor = `rgba(${myRgb},${open ? '0.7' : '0.42'})`;
        }}
        onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(1px)'; }}
        onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        onFocus={(e) => { e.currentTarget.style.boxShadow = `0 4px 14px rgba(0,0,0,0.55), 0 0 0 2px rgba(${myRgb},0.5), 0 0 22px rgba(${myRgb},0.28)`; }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = open
            ? `0 4px 14px rgba(0,0,0,0.55), 0 0 22px rgba(${myRgb},0.24), inset 0 0 0 1px rgba(${myRgb},0.05)`
            : `0 4px 14px rgba(0,0,0,0.55), 0 0 14px rgba(${myRgb},0.14)`;
        }}
      >
        {/* Status LED pip */}
        <span
          aria-hidden
          style={{
            width: '7px',
            height: '7px',
            background: myHex,
            boxShadow: `0 0 8px 1px ${myHex}`,
            animation: unread > 0 && !open
              ? 'pip-alert 0.9s ease-in-out infinite'
              : 'pip-idle 2.4s ease-in-out infinite',
            flexShrink: 0,
          }}
        />

        {/* Label stack: primary label + tiny subtitle */}
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1, gap: '2px' }}>
          <span
            className="ff-bebas"
            style={{
              color: myHex,
              fontSize: '17px',
              letterSpacing: '0.22em',
              lineHeight: 1,
            }}
          >
            {open ? 'CLOSE' : 'COMMS'}
          </span>
          <span
            className="ff-space"
            style={{
              color: `rgba(${myRgb},0.45)`,
              fontSize: '7px',
              letterSpacing: '0.28em',
              lineHeight: 1,
              textTransform: 'uppercase',
            }}
          >
            {open ? 'esc' : 'ch·01'}
          </span>
        </span>

        {/* Right-edge glyph: chevron when closed, × when open */}
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '14px',
            height: '14px',
            marginLeft: '2px',
            color: `rgba(${myRgb},0.8)`,
          }}
        >
          {open ? (
            <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square">
              <path d="M 3 3 L 11 11 M 11 3 L 3 11" />
            </svg>
          ) : (
            <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" strokeLinejoin="miter">
              <path d="M 5 3 L 9 7 L 5 11" />
            </svg>
          )}
        </span>

        {/* Unread count chip — angular, sharp-cornered */}
        {!open && unread > 0 && (
          <span
            className="ff-orbit anim-badge-pop"
            key={unread}
            style={{
              position: 'absolute',
              top: '-9px',
              right: '-9px',
              minWidth: '22px',
              height: '20px',
              padding: '0 6px',
              background: myHex,
              color: '#06060F',
              fontSize: '11px',
              fontWeight: 900,
              letterSpacing: '0.04em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 14px rgba(${myRgb},0.85), 0 2px 6px rgba(0,0,0,0.5)`,
              clipPath: 'polygon(0 0, 100% 0, 100% 70%, 86% 100%, 0 100%)',
              lineHeight: 1,
              userSelect: 'none',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </>
  );
}
