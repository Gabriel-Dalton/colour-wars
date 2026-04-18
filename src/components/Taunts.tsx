'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Player } from '@/lib/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface Taunt {
  id: string;
  text: string;
  from: Player;
}

const MESSAGES: string[] = [
  'HURRY UP',
  'LOVE YOU',
  'GG',
  'OOPS',
  'NICE MOVE',
  "YOU'RE COOKED",
  'TOO EASY',
  'OOF',
  'WATCH THIS',
  'NOOO',
];

const COLOR_HEX = { blue: '#00CFFF', red: '#FF2D55' } as const;
const COLOR_RGB = { blue: '0,207,255', red: '255,45,85' } as const;

export default function Taunts({ roomId, myColor }: { roomId: string; myColor: Player | null }) {
  const [open, setOpen] = useState(false);
  const [incoming, setIncoming] = useState<Taunt | null>(null);
  const [justSent, setJustSent] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const cooldownRef = useRef(false);
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const channel = supabase.channel(`taunts:${roomId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on('broadcast', { event: 'taunt' }, (payload) => {
      const t = payload.payload as Taunt;
      if (t.from === myColor) return;
      setIncoming(t);
      if (incomingTimerRef.current) clearTimeout(incomingTimerRef.current);
      incomingTimerRef.current = setTimeout(() => setIncoming(null), 3400);
    });
    channel.subscribe();
    channelRef.current = channel;
    return () => {
      if (incomingTimerRef.current) clearTimeout(incomingTimerRef.current);
      if (sentTimerRef.current) clearTimeout(sentTimerRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, myColor]);

  if (!myColor) return null;

  const myHex = COLOR_HEX[myColor];
  const myRgb = COLOR_RGB[myColor];

  const send = (text: string) => {
    if (cooldownRef.current || !channelRef.current) return;
    const t: Taunt = { id: `${Date.now()}`, text, from: myColor };
    channelRef.current.send({ type: 'broadcast', event: 'taunt', payload: t });
    cooldownRef.current = true;
    setOpen(false);
    setJustSent(text);
    if (sentTimerRef.current) clearTimeout(sentTimerRef.current);
    sentTimerRef.current = setTimeout(() => setJustSent(null), 1400);
    setTimeout(() => { cooldownRef.current = false; }, 1400);
  };

  return (
    <>
      {/* Incoming toast */}
      {incoming && (
        <div
          className="anim-slide-up-fast"
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
            pointerEvents: 'none',
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
              fontSize: '22px',
              letterSpacing: '0.08em',
              lineHeight: 1,
            }}
          >
            {incoming.text}
          </div>
        </div>
      )}

      {/* "Sent" confirmation for the sender */}
      {justSent && (
        <div
          className="anim-slide-up-fast"
          style={{
            position: 'fixed',
            bottom: '88px',
            right: '18px',
            zIndex: 55,
            padding: '6px 12px',
            background: 'rgba(0,0,0,0.65)',
            border: `1px solid rgba(${myRgb},0.4)`,
            borderRadius: '3px',
            pointerEvents: 'none',
          }}
        >
          <span
            className="ff-space"
            style={{ color: `rgba(${myRgb},0.85)`, fontSize: '9px', letterSpacing: '0.18em' }}
          >
            ✓ {justSent}
          </span>
        </div>
      )}

      {/* Popover */}
      {open && (
        <div
          className="anim-slide-up-fast"
          style={{
            position: 'fixed',
            bottom: '76px',
            right: '18px',
            zIndex: 56,
            width: '172px',
            background: '#0D0D22',
            border: `1px solid rgba(${myRgb},0.45)`,
            borderTop: `3px solid ${myHex}`,
            borderRadius: '5px',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 28px rgba(${myRgb},0.12)`,
          }}
        >
          {MESSAGES.map((m) => (
            <button
              key={m}
              onClick={() => send(m)}
              className="ff-bebas"
              style={{
                background: 'transparent',
                border: '1px solid rgba(170,170,255,0.08)',
                color: myHex,
                padding: '8px 10px',
                fontSize: '15px',
                letterSpacing: '0.1em',
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: '3px',
                transition: 'background 0.12s ease, border-color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `rgba(${myRgb},0.1)`;
                e.currentTarget.style.borderColor = `rgba(${myRgb},0.45)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(170,170,255,0.08)';
              }}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Send a quick message"
        className="ff-bebas"
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
      </button>
    </>
  );
}
