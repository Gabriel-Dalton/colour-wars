'use client';

import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { Player, GameStatus, GameRow, Grid as GridType } from '@/lib/types';
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
const BURST_EMOJIS = ['❤️', '😂', '🔥', '💀', '👍', '🎉', '😭', '🤡', '🎯', '👀'];

interface EmojiBurst {
  id: string;
  emoji: string;
  from: Player;
  jitter: number;
}

const COLOR_HEX = { blue: '#00CFFF', red: '#FF2D55' } as const;
const COLOR_RGB = { blue: '0,207,255', red: '255,45,85' } as const;

const MAX_LEN = 120;
const MAX_HISTORY = 80;

const CHEAT_PASSWORD = '45618';

export default function Chat({
  roomId,
  myColor,
  gameStatus,
  game,
  onDoubleMoveArm,
}: {
  roomId: string;
  myColor: Player | null;
  gameStatus?: GameStatus;
  game?: GameRow | null;
  onDoubleMoveArm?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Record<string, { emoji: string; from: Player }[]>>({});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [incoming, setIncoming] = useState<ChatMessage | null>(null);
  const [unread, setUnread] = useState(0);
  const [wifiBlocked, setWifiBlocked] = useState(false);
  const [cheatToast, setCheatToast] = useState<string | null>(null);

  // ── Cheat unlock ──
  const [cheatsUnlocked, setCheatsUnlocked] = useState(false);
  const [awaitingPassword, setAwaitingPassword] = useState(false);
  const [showCheatsMenu, setShowCheatsMenu] = useState(false);

  // ── Victim-side effect states ──
  const [shaking, setShaking] = useState(false);
  const [disco, setDisco] = useState(false);
  const [colorblind, setColorblind] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [fogOn, setFogOn] = useState(false);
  const [fogPos, setFogPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [ghostCursor, setGhostCursor] = useState(false);
  const [spamActive, setSpamActive] = useState(false);
  const [fakeLeaveMsg, setFakeLeaveMsg] = useState<ChatMessage | null>(null);
  const [fakeMoveFlash, setFakeMoveFlash] = useState(false);
  const [ghostedCells, setGhostedCells] = useState<Set<string>>(new Set());

  // ── Prankster-side state ──
  const [peekActive, setPeekActive] = useState(false);
  const [peekPos, setPeekPos] = useState<{ x: number; y: number } | null>(null);
  // Tracks which toggleable cheats the prankster currently has ON.
  // Keys are fx "kinds" (e.g. 'shake', 'disco', 'wifi', 'peek'). Membership = on.
  const [activeFx, setActiveFx] = useState<Set<string>>(new Set());

  // Transient floating emoji bursts — shown on the side, auto-clear after animation.
  const [emojiBursts, setEmojiBursts] = useState<EmojiBurst[]>([]);

  // Victim's "I'm being peeked" broadcast flag
  const peekVictimRef = useRef(false);
  const peekVictimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wifiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cheatToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorblindTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mirrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ghostCursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fakeMoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ghostCellTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Track grid history for /undo
  const gridHistoryRef = useRef<GridType[]>([]);
  useEffect(() => {
    if (!game?.grid) return;
    const h = gridHistoryRef.current;
    if (h.length === 0 || h[h.length - 1] !== game.grid) {
      h.push(game.grid);
      if (h.length > 8) h.shift();
    }
  }, [game?.grid]);
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
    channel.on('broadcast', { event: 'emoji_burst' }, (payload) => {
      const p = payload.payload as { emoji: string; from: Player };
      if (p.from === myColor) return;
      const burst: EmojiBurst = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        emoji: p.emoji,
        from: p.from,
        jitter: Math.random() * 28 - 14,
      };
      setEmojiBursts((prev) => [...prev.slice(-7), burst]);
      setTimeout(() => {
        setEmojiBursts((prev) => prev.filter((b) => b.id !== burst.id));
      }, 1600);
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
    channel.on('broadcast', { event: 'wifi' }, (payload) => {
      const p = payload.payload as { action: 'block' | 'unblock'; from: Player };
      if (p.from === myColor) return;
      if (wifiTimerRef.current) clearTimeout(wifiTimerRef.current);
      if (p.action === 'block') {
        setWifiBlocked(true);
        // safety: auto-lift after 45s in case prankster forgets
        wifiTimerRef.current = setTimeout(() => setWifiBlocked(false), 45000);
      } else {
        setWifiBlocked(false);
      }
    });

    // Generic victim-side FX dispatcher
    channel.on('broadcast', { event: 'fx' }, (payload) => {
      const p = payload.payload as { kind: string; from: Player; action?: 'on' | 'off' | 'once'; extra?: unknown };
      if (p.from === myColor) return;
      // Safety timer for toggleables: 60s in case the prankster vanishes.
      const SAFETY_MS = 60000;
      const action = p.action ?? 'once';
      // Helper for toggleable on/off state
      const applyToggle = (
        setter: (v: boolean) => void,
        timerRef: { current: ReturnType<typeof setTimeout> | null },
        onceMs: number
      ) => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        if (action === 'off') { setter(false); return; }
        setter(true);
        const dur = action === 'on' ? SAFETY_MS : onceMs;
        timerRef.current = setTimeout(() => setter(false), dur);
      };
      switch (p.kind) {
        case 'shake':       applyToggle(setShaking,     shakeTimerRef,       3000); break;
        case 'disco':       applyToggle(setDisco,       discoTimerRef,       4000); break;
        case 'colorblind':  applyToggle(setColorblind,  colorblindTimerRef,  6000); break;
        case 'mirror':      applyToggle(setMirror,      mirrorTimerRef,      5000); break;
        case 'fog':         applyToggle(setFogOn,       fogTimerRef,         6000); break;
        case 'ghostcursor': applyToggle(setGhostCursor, ghostCursorTimerRef, 5000); break;
        case 'spam':        applyToggle(setSpamActive,  spamTimerRef,        5000); break;
        case 'airhorn': {
          try {
            const Ctx = (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext: typeof AudioContext }).AudioContext
              || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const ctx = new Ctx();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sawtooth';
            o.frequency.value = 180;
            g.gain.value = 0.25;
            o.connect(g).connect(ctx.destination);
            o.start();
            setTimeout(() => o.frequency.setValueAtTime(240, ctx.currentTime), 250);
            setTimeout(() => o.frequency.setValueAtTime(300, ctx.currentTime), 500);
            setTimeout(() => { o.stop(); ctx.close(); }, 1400);
          } catch { /* ignore */ }
          break;
        }
        case 'fakemove': {
          setFakeMoveFlash(true);
          if (fakeMoveTimerRef.current) clearTimeout(fakeMoveTimerRef.current);
          fakeMoveTimerRef.current = setTimeout(() => setFakeMoveFlash(false), 900);
          break;
        }
        case 'fakeleave': {
          const other: Player = myColor === 'blue' ? 'red' : 'blue';
          const fm: ChatMessage = {
            id: `fakesys-${Date.now()}`,
            text: `${other.toUpperCase()} disconnected from chat`,
            from: other,
            ts: Date.now(),
            system: true,
          };
          setFakeLeaveMsg(fm);
          setMessages((prev) => [...prev.slice(-MAX_HISTORY + 1), fm]);
          if (!openRef.current) {
            setIncoming(fm);
            setUnread((u) => u + 1);
            if (incomingTimerRef.current) clearTimeout(incomingTimerRef.current);
            incomingTimerRef.current = setTimeout(() => setIncoming(null), 4200);
          }
          break;
        }
        case 'ghost': {
          const coord = p.extra as string; // "r,c"
          if (typeof coord !== 'string') break;
          setGhostedCells((prev) => {
            const next = new Set(prev);
            next.add(coord);
            return next;
          });
          const prev = ghostCellTimersRef.current.get(coord);
          if (prev) clearTimeout(prev);
          const t = setTimeout(() => {
            setGhostedCells((s) => {
              const n = new Set(s);
              n.delete(coord);
              return n;
            });
            ghostCellTimersRef.current.delete(coord);
          }, 8000);
          ghostCellTimersRef.current.set(coord, t);
          break;
        }
        case 'peek_start':
        case 'peek': {
          // Victim starts (or stops) broadcasting its cursor.
          if (peekVictimTimerRef.current) { clearTimeout(peekVictimTimerRef.current); peekVictimTimerRef.current = null; }
          if (action === 'off') { peekVictimRef.current = false; break; }
          peekVictimRef.current = true;
          const dur = action === 'on' ? SAFETY_MS : 10000;
          peekVictimTimerRef.current = setTimeout(() => { peekVictimRef.current = false; }, dur);
          break;
        }
        default: break;
      }
    });

    // Peek: victim streams cursor, prankster receives it
    channel.on('broadcast', { event: 'peek_cursor' }, (payload) => {
      const p = payload.payload as { x: number; y: number; from: Player };
      if (p.from === myColor) return;
      setPeekPos({ x: p.x, y: p.y });
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
      if (wifiTimerRef.current) clearTimeout(wifiTimerRef.current);
      if (cheatToastTimerRef.current) clearTimeout(cheatToastTimerRef.current);
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      if (discoTimerRef.current) clearTimeout(discoTimerRef.current);
      if (colorblindTimerRef.current) clearTimeout(colorblindTimerRef.current);
      if (mirrorTimerRef.current) clearTimeout(mirrorTimerRef.current);
      if (fogTimerRef.current) clearTimeout(fogTimerRef.current);
      if (ghostCursorTimerRef.current) clearTimeout(ghostCursorTimerRef.current);
      if (spamTimerRef.current) clearTimeout(spamTimerRef.current);
      if (fakeMoveTimerRef.current) clearTimeout(fakeMoveTimerRef.current);
      if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
      if (peekVictimTimerRef.current) clearTimeout(peekVictimTimerRef.current);
      ghostCellTimersRef.current.forEach((t) => clearTimeout(t));
      ghostCellTimersRef.current.clear();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, myColor, gameStatus]);

  // Inject CSS keyframes used by cheat effects (once)
  useEffect(() => {
    if (document.getElementById('cw-cheat-kf')) return;
    const s = document.createElement('style');
    s.id = 'cw-cheat-kf';
    s.innerHTML = `
@keyframes cw-shake { 0%,100%{transform:translate(0,0)} 10%{transform:translate(-6px,3px) rotate(-0.6deg)} 20%{transform:translate(5px,-4px) rotate(0.7deg)} 30%{transform:translate(-4px,5px)} 40%{transform:translate(6px,2px) rotate(-0.4deg)} 50%{transform:translate(-5px,-3px)} 60%{transform:translate(4px,4px) rotate(0.5deg)} 70%{transform:translate(-3px,-5px)} 80%{transform:translate(5px,3px) rotate(-0.3deg)} 90%{transform:translate(-4px,-2px)} }
@keyframes cw-disco { 0%{background:rgba(255,0,0,0.35)} 16%{background:rgba(255,140,0,0.35)} 33%{background:rgba(255,255,0,0.35)} 50%{background:rgba(0,255,0,0.35)} 66%{background:rgba(0,140,255,0.35)} 83%{background:rgba(200,0,255,0.35)} 100%{background:rgba(255,0,0,0.35)} }
@keyframes cw-emoji-fall { 0%{transform:translateY(-8vh) rotate(0deg);opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{transform:translateY(108vh) rotate(520deg);opacity:0.7} }
@keyframes cw-ghost-drift { 0%{transform:translate(8vw,12vh)} 25%{transform:translate(82vw,22vh)} 50%{transform:translate(24vw,78vh)} 75%{transform:translate(78vw,68vh)} 100%{transform:translate(8vw,12vh)} }
@keyframes cw-fake-move-pulse { 0%{box-shadow:0 0 0 0 rgba(255,45,85,0.55)} 100%{box-shadow:0 0 0 40px rgba(255,45,85,0)} }
@keyframes cw-emoji-burst { 0%{transform:translate(var(--cw-jx,0),12px) scale(0.6);opacity:0} 15%{transform:translate(var(--cw-jx,0),0) scale(1.15);opacity:1} 55%{opacity:1} 100%{transform:translate(var(--cw-jx,0),-140px) scale(0.9);opacity:0} }
`;
    document.head.appendChild(s);
  }, []);

  // Shake: apply animation to body
  useEffect(() => {
    if (!shaking) return;
    const prev = document.body.style.animation;
    document.body.style.animation = 'cw-shake 0.18s linear infinite';
    return () => { document.body.style.animation = prev; };
  }, [shaking]);

  // Colorblind: hue-rotate the whole viewport so red↔blue swap visually
  useEffect(() => {
    if (!colorblind) return;
    const prev = document.body.style.filter;
    document.body.style.filter = 'hue-rotate(180deg)';
    return () => { document.body.style.filter = prev; };
  }, [colorblind]);

  // Mirror: flip main content via body transform
  useEffect(() => {
    if (!mirror) return;
    const prev = document.body.style.transform;
    const prevTrans = document.body.style.transition;
    document.body.style.transition = 'transform 0.4s ease';
    document.body.style.transform = 'scaleX(-1)';
    return () => {
      document.body.style.transform = prev;
      document.body.style.transition = prevTrans;
    };
  }, [mirror]);

  // Fog: track victim's own cursor
  useEffect(() => {
    if (!fogOn) return;
    const onMove = (e: MouseEvent) => setFogPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [fogOn]);

  // Peek: victim streams cursor back to prankster
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!peekVictimRef.current || !channelRef.current || !myColor) return;
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      channelRef.current.send({ type: 'broadcast', event: 'peek_cursor', payload: { x, y, from: myColor } });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [myColor]);

  // Ghosted cells: inject CSS rules targeting the wrapper divs rendered by Grid
  useEffect(() => {
    if (ghostedCells.size === 0) return;
    const style = document.createElement('style');
    const rules = Array.from(ghostedCells)
      .map((c) => `[data-cw-cell="${c}"] > * { visibility: hidden !important; }`)
      .join('\n');
    style.innerHTML = rules;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, [ghostedCells]);

  useEffect(() => {
    if (gameStatus !== 'finished') return;
    setMessages([]);
    setReactions({});
    setIncoming(null);
    setUnread(0);
    setOpen(false);
    setPickerFor(null);
    setDraft('');
    setActiveFx(new Set());
    setPeekActive(false);
    setPeekPos(null);
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

  // Sends a floating emoji burst. Sender sees it locally too so it feels responsive.
  const sendEmojiBurst = (emoji: string) => {
    if (!channelRef.current || !myColor) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'emoji_burst',
      payload: { emoji, from: myColor },
    });
    const burst: EmojiBurst = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      emoji,
      from: myColor,
      jitter: Math.random() * 28 - 14,
    };
    setEmojiBursts((prev) => [...prev.slice(-7), burst]);
    setTimeout(() => {
      setEmojiBursts((prev) => prev.filter((b) => b.id !== burst.id));
    }, 1600);
  };

  const showCheatToast = (text: string) => {
    if (cheatToastTimerRef.current) clearTimeout(cheatToastTimerRef.current);
    setCheatToast(text);
    cheatToastTimerRef.current = setTimeout(() => setCheatToast(null), 2200);
  };

  // Fire a broadcast fx event. action defaults to 'once' (existing one-shot behavior).
  const sendFx = (kind: string, extra?: unknown, action: 'on' | 'off' | 'once' = 'once') => {
    if (!channelRef.current || !myColor) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'fx',
      payload: { kind, action, from: myColor, extra },
    });
  };

  // Toggle a sticky cheat: flip prankster-side active state + broadcast on/off.
  // Returns the new state (true = now active). Handles wifi's distinct event too.
  const toggleFx = (kind: string): boolean => {
    const isOn = activeFx.has(kind);
    const next = !isOn;
    setActiveFx((prev) => {
      const s = new Set(prev);
      if (next) s.add(kind); else s.delete(kind);
      return s;
    });
    if (kind === 'wifi') {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'wifi',
        payload: { action: next ? 'block' : 'unblock', from: myColor },
      });
    } else {
      sendFx(kind, undefined, next ? 'on' : 'off');
    }
    return next;
  };

  // Maps slash commands to the fx kind they toggle.
  const TOGGLE_CMDS: Record<string, string> = {
    '/blockwifi': 'wifi',
    '/wifi': 'wifi',
    '/shake': 'shake',
    '/disco': 'disco',
    '/rave': 'disco',
    '/colorblind': 'colorblind',
    '/hue': 'colorblind',
    '/ghostcursor': 'ghostcursor',
    '/spam': 'spam',
    '/mirror': 'mirror',
    '/fog': 'fog',
    '/peek': 'peek',
  };

  // Handle all unlocked slash commands. Returns true if the command was consumed.
  const runCheatCommand = (cmd: string, raw: string): boolean => {
    if (!myColor) return false;

    // Toggleable cheats: a second press turns the effect off.
    const toggleKind = TOGGLE_CMDS[cmd];
    if (toggleKind) {
      const now = toggleFx(toggleKind);
      // Peek also controls prankster-side cursor overlay.
      if (toggleKind === 'peek') {
        if (now) {
          setPeekActive(true);
        } else {
          setPeekActive(false);
          setPeekPos(null);
          if (peekTimerRef.current) { clearTimeout(peekTimerRef.current); peekTimerRef.current = null; }
        }
      }
      const labels: Record<string, [string, string]> = {
        wifi:        ['📶 wifi outage ON',    '📶 wifi restored'],
        shake:       ['🌀 shake ON',          '🌀 shake OFF'],
        disco:       ['🪩 disco ON',          '🪩 disco OFF'],
        colorblind:  ['🎨 hue swap ON',       '🎨 hue swap OFF'],
        ghostcursor: ['👻 ghost cursor ON',   '👻 ghost cursor OFF'],
        spam:        ['🌧️ emoji rain ON',    '🌧️ emoji rain OFF'],
        mirror:      ['🪞 mirror ON',         '🪞 mirror OFF'],
        fog:         ['🌫️ fog ON',           '🌫️ fog OFF'],
        peek:        ['👁️ peek ON',          '👁️ peek OFF'],
      };
      const [onMsg, offMsg] = labels[toggleKind] ?? ['ON', 'OFF'];
      showCheatToast(now ? onMsg : offMsg);
      return true;
    }

    switch (cmd) {
      case '/airhorn':
        sendFx('airhorn');
        showCheatToast('📯 airhorn!');
        return true;
      case '/fakemove':
        sendFx('fakemove');
        showCheatToast('🎭 fake move ping');
        return true;
      case '/fakeleave':
        sendFx('fakeleave');
        showCheatToast('🎭 fake leave sent');
        return true;
      case '/doublemove':
        onDoubleMoveArm?.();
        showCheatToast('🔁 doublemove armed');
        return true;
      case '/flip': {
        if (!game) return true;
        const newGrid: GridType = game.grid.map((row) =>
          row.map((c) => ({
            ...c,
            owner: c.owner === 'blue' ? 'red' : c.owner === 'red' ? 'blue' : null,
          }))
        );
        void supabase.from('games').update({ grid: newGrid }).eq('id', roomId).then(() => {});
        showCheatToast('☢️ board flipped');
        return true;
      }
      case '/steal': {
        if (!game) return true;
        const enemy: Player = myColor === 'blue' ? 'red' : 'blue';
        const enemyCells: [number, number][] = [];
        game.grid.forEach((row, r) =>
          row.forEach((c, ci) => { if (c.owner === enemy) enemyCells.push([r, ci]); })
        );
        if (enemyCells.length === 0) { showCheatToast('no enemy cells to steal'); return true; }
        const [sr, sc] = enemyCells[Math.floor(Math.random() * enemyCells.length)];
        const newGrid: GridType = game.grid.map((row, r) =>
          row.map((c, ci) => (r === sr && ci === sc ? { ...c, owner: myColor } : c))
        );
        void supabase.from('games').update({ grid: newGrid }).eq('id', roomId).then(() => {});
        showCheatToast(`🫳 stole cell ${sr},${sc}`);
        return true;
      }
      case '/undo': {
        const hist = gridHistoryRef.current;
        if (hist.length < 2) { showCheatToast('nothing to undo'); return true; }
        // pop current, write previous
        hist.pop();
        const prev = hist[hist.length - 1];
        void supabase.from('games').update({ grid: prev }).eq('id', roomId).then(() => {});
        showCheatToast('⏪ undo');
        return true;
      }
      default: {
        // /ghost r,c    or   /ghost r c
        if (cmd.startsWith('/ghost')) {
          const rest = raw.slice('/ghost'.length).trim();
          const match = rest.match(/(\d+)[\s,]+(\d+)/);
          if (match) {
            sendFx('ghost', `${match[1]},${match[2]}`);
            showCheatToast(`👻 ghosted ${match[1]},${match[2]}`);
            return true;
          }
          showCheatToast('usage: /ghost <row> <col>');
          return true;
        }
        return false;
      }
    }
  };

  const send = (raw: string) => {
    const trimmed = raw.trim().slice(0, MAX_LEN);
    if (!trimmed || cooldownRef.current || !channelRef.current) return;

    // ── Cheat password flow ──
    if (awaitingPassword) {
      setAwaitingPassword(false);
      setDraft('');
      if (trimmed === CHEAT_PASSWORD) {
        setCheatsUnlocked(true);
        setShowCheatsMenu(true);
        showCheatToast('🔓 cheats unlocked');
      } else {
        showCheatToast('❌ wrong password');
      }
      return;
    }

    const cmd = trimmed.toLowerCase();

    // ── /cheats — password prompt or menu toggle ──
    if (cmd === '/cheats') {
      setDraft('');
      if (!cheatsUnlocked) {
        setAwaitingPassword(true);
        showCheatToast('🔒 enter password');
      } else {
        setShowCheatsMenu((s) => !s);
      }
      return;
    }

    // All other slash commands require unlock
    if (cmd.startsWith('/')) {
      if (!cheatsUnlocked) {
        // Pretend it's a normal message — don't leak the cheat surface
        // fall through to normal send
      } else {
        const handled = runCheatCommand(cmd, trimmed);
        if (handled) {
          setDraft('');
          cooldownRef.current = true;
          setTimeout(() => { cooldownRef.current = false; }, 250);
          return;
        }
      }
    }

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
      {/* ── Floating emoji bursts (side of screen, above COMMS button) ── */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          right: '36px',
          bottom: '78px',
          zIndex: 58,
          pointerEvents: 'none',
          width: '0',
          height: '0',
        }}
      >
        {emojiBursts.map((b) => (
          <span
            key={b.id}
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              fontSize: '34px',
              lineHeight: 1,
              filter: `drop-shadow(0 2px 6px rgba(${b.from === 'blue' ? '0,207,255' : '255,45,85'},0.55))`,
              animation: 'cw-emoji-burst 1.6s cubic-bezier(0.22, 0.9, 0.36, 1) forwards',
              ['--cw-jx' as string]: `${b.jitter}px`,
              willChange: 'transform, opacity',
            } as React.CSSProperties}
          >
            {b.emoji}
          </span>
        ))}
      </div>

      {/* ── Fake "Wi-Fi disconnected" overlay — triggered by opponent's /blockwifi ── */}
      {wifiBlocked && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(6,6,15,0.88)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            cursor: 'default',
          }}
        >
          <div
            className="anim-slide-up-fast"
            style={{
              width: '100%',
              maxWidth: '340px',
              background: '#1F1F1F',
              border: '1px solid #3A3A3A',
              borderRadius: '6px',
              boxShadow: '0 18px 40px rgba(0,0,0,0.7)',
              color: '#E6E6E6',
              fontFamily: "'Segoe UI', system-ui, sans-serif",
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                background: '#2B2B2B',
                borderBottom: '1px solid #3A3A3A',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Network</span>
              <span style={{ color: '#888', cursor: 'not-allowed' }}>×</span>
            </div>
            <div style={{ padding: '20px 18px 18px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              {/* Wi-Fi icon with X */}
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ flexShrink: 0, marginTop: '2px' }}>
                <path d="M20 30 l3 -3 a4 4 0 0 0 -6 0 z" fill="#E6E6E6" />
                <path d="M10 22 a14 14 0 0 1 20 0" stroke="#E6E6E6" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.6" />
                <path d="M14 26 a8 8 0 0 1 12 0" stroke="#E6E6E6" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.8" />
                <circle cx="32" cy="10" r="7" fill="#E53E3E" />
                <path d="M29 7 l6 6 M35 7 l-6 6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                  No Internet connection
                </div>
                <div style={{ fontSize: '12px', lineHeight: 1.45, color: '#B8B8B8' }}>
                  Windows can&apos;t connect to this network. Please check your Wi-Fi connection and try again.
                </div>
              </div>
            </div>
            <div
              style={{
                padding: '10px 14px 14px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                borderTop: '1px solid #2A2A2A',
                background: '#1A1A1A',
              }}
            >
              <button
                disabled
                style={{
                  background: '#2D2D2D',
                  border: '1px solid #3A3A3A',
                  color: '#777',
                  padding: '6px 14px',
                  fontSize: '12px',
                  borderRadius: '3px',
                  cursor: 'not-allowed',
                  fontFamily: 'inherit',
                }}
              >
                Troubleshoot
              </button>
              <button
                disabled
                style={{
                  background: '#0E639C',
                  border: '1px solid #1177BB',
                  color: '#D0D0D0',
                  padding: '6px 14px',
                  fontSize: '12px',
                  borderRadius: '3px',
                  cursor: 'not-allowed',
                  fontFamily: 'inherit',
                  opacity: 0.7,
                }}
              >
                Reconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Disco strobe overlay ─────────────────────────── */}
      {disco && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 190,
            pointerEvents: 'none',
            animation: 'cw-disco 0.38s steps(6) infinite',
            mixBlendMode: 'screen',
          }}
        />
      )}

      {/* ── Fog overlay ──────────────────────────────────── */}
      {fogOn && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 185,
            pointerEvents: 'none',
            background: `radial-gradient(circle 140px at ${fogPos.x}px ${fogPos.y}px, transparent 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.96) 100%)`,
          }}
        />
      )}

      {/* ── Ghost cursor (decoy) ─────────────────────────── */}
      {ghostCursor && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            zIndex: 195,
            pointerEvents: 'none',
            animation: 'cw-ghost-drift 5s ease-in-out',
            color: '#fff',
            filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.7))',
          }}
        >
          <svg width="24" height="28" viewBox="0 0 24 28" fill="currentColor" opacity="0.85">
            <path d="M2 2 L2 22 L8 17 L11 26 L14 25 L11 16 L20 16 Z" />
          </svg>
        </div>
      )}

      {/* ── Emoji spam rain ──────────────────────────────── */}
      {spamActive && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 188, pointerEvents: 'none', overflow: 'hidden' }}>
          {Array.from({ length: 36 }).map((_, i) => {
            const emojis = ['💀', '🤡', '🎉', '🔥', '🤖', '🥔', '🍕', '👀', '💩', '🦄', '⚡', '🫠'];
            const left = Math.random() * 100;
            const duration = 2.2 + Math.random() * 2.4;
            const delay = Math.random() * 1.5;
            const size = 18 + Math.random() * 26;
            return (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: `${left}vw`,
                  top: 0,
                  fontSize: `${size}px`,
                  animation: `cw-emoji-fall ${duration}s linear ${delay}s forwards`,
                }}
              >
                {emojis[i % emojis.length]}
              </span>
            );
          })}
        </div>
      )}

      {/* ── Fake "opponent just moved" ping ──────────────── */}
      {fakeMoveFlash && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            zIndex: 186,
            pointerEvents: 'none',
            padding: '18px 28px',
            background: 'rgba(6,6,15,0.85)',
            border: `2px solid ${myColor === 'blue' ? '#FF2D55' : '#00CFFF'}`,
            borderRadius: '6px',
            color: myColor === 'blue' ? '#FF2D55' : '#00CFFF',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '28px',
            letterSpacing: '0.2em',
            animation: 'cw-fake-move-pulse 0.9s ease-out forwards',
          }}
        >
          OPPONENT MOVED
        </div>
      )}

      {/* ── Peek: prankster sees victim's cursor ─────────── */}
      {peekActive && peekPos && (
        <div
          style={{
            position: 'fixed',
            left: `${peekPos.x * 100}vw`,
            top: `${peekPos.y * 100}vh`,
            zIndex: 195,
            pointerEvents: 'none',
            transform: 'translate(-50%,-50%)',
          }}
        >
          <div style={{
            width: '18px', height: '18px', borderRadius: '50%',
            background: 'rgba(0,207,255,0.4)',
            border: '2px solid #00CFFF',
            boxShadow: '0 0 16px rgba(0,207,255,0.8)',
          }} />
          <div className="ff-space" style={{
            position: 'absolute', top: '22px', left: '14px',
            color: '#00CFFF', fontSize: '8px', letterSpacing: '0.2em', whiteSpace: 'nowrap',
          }}>
            👁 OPPONENT
          </div>
        </div>
      )}

      {/* ── Persistent CHEAT TASKBAR — appears once unlocked ─────────── */}
      {cheatsUnlocked && showCheatsMenu && (() => {
        const buttons: { label: string; emoji: string; cmd: string; group: 'vis' | 'perc' | 'game'; title: string }[] = [
          { group: 'vis',  emoji: '📶', label: 'WIFI',     cmd: '/blockwifi',   title: 'Fake Wi-Fi popup — toggle on/off' },
          { group: 'vis',  emoji: '🌀', label: 'SHAKE',    cmd: '/shake',       title: 'Shake their screen — toggle on/off' },
          { group: 'vis',  emoji: '🪩', label: 'DISCO',    cmd: '/disco',       title: 'Rainbow strobe — toggle on/off' },
          { group: 'vis',  emoji: '🎨', label: 'HUE',      cmd: '/colorblind',  title: 'Swap red↔blue hues — toggle on/off' },
          { group: 'vis',  emoji: '👻', label: 'CURSOR',   cmd: '/ghostcursor', title: 'Fake drifting cursor — toggle on/off' },
          { group: 'vis',  emoji: '🌧️', label: 'SPAM',     cmd: '/spam',        title: 'Emoji rain — toggle on/off' },
          { group: 'vis',  emoji: '📯', label: 'HORN',     cmd: '/airhorn',     title: 'Loud buzz on their side (one-shot)' },
          { group: 'vis',  emoji: '🎭', label: 'FAKEMOVE', cmd: '/fakemove',    title: 'Fake "opponent moved" ping (one-shot)' },
          { group: 'vis',  emoji: '🚪', label: 'FAKELEAVE',cmd: '/fakeleave',   title: 'Fake disconnect message (one-shot)' },
          { group: 'perc', emoji: '🪞', label: 'MIRROR',   cmd: '/mirror',      title: 'Flip their view horizontally — toggle' },
          { group: 'perc', emoji: '🌫️', label: 'FOG',      cmd: '/fog',         title: 'Fog around their cursor — toggle' },
          { group: 'perc', emoji: '👁️', label: 'PEEK',     cmd: '/peek',        title: 'See their cursor — toggle' },
          { group: 'perc', emoji: '🫥', label: 'GHOST',    cmd: '/ghost-random', title: 'Hide one random enemy cell from them (8s)' },
          { group: 'game', emoji: '⏪', label: 'UNDO',     cmd: '/undo',        title: 'Revert the board one snapshot' },
          { group: 'game', emoji: '🫳', label: 'STEAL',    cmd: '/steal',       title: 'Convert a random enemy circle to yours' },
          { group: 'game', emoji: '☢️', label: 'FLIP',     cmd: '/flip',        title: 'Swap every cell\'s owner — nuclear' },
          { group: 'game', emoji: '🔁', label: '2XMOVE',   cmd: '/doublemove',  title: 'Arm: next move won\'t pass the turn' },
        ];
        const groupColor = { vis: '#00CFFF', perc: '#B388FF', game: '#FF2D55' };
        const groupLabel = { vis: 'VISUAL', perc: 'PERCEPTION', game: 'STATE' };

        const onBtn = (cmd: string) => {
          if (cmd === '/ghost-random') {
            // Pick a random enemy cell and fire /ghost r c
            if (!game || !myColor) return;
            const enemy: Player = myColor === 'blue' ? 'red' : 'blue';
            const cells: [number, number][] = [];
            game.grid.forEach((row, r) => row.forEach((c, ci) => { if (c.owner === enemy) cells.push([r, ci]); }));
            if (cells.length === 0) { showCheatToast('no enemy cells'); return; }
            const [r, c] = cells[Math.floor(Math.random() * cells.length)];
            runCheatCommand('/ghost', `/ghost ${r} ${c}`);
            return;
          }
          runCheatCommand(cmd, cmd);
        };

        const groups: Array<'vis' | 'perc' | 'game'> = ['vis', 'perc', 'game'];
        return (
          <div
            style={{
              position: 'fixed',
              top: '10px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 90,
              maxWidth: 'calc(100vw - 20px)',
              background: 'rgba(8,8,18,0.92)',
              border: '1px solid rgba(255,45,85,0.5)',
              borderTop: '2px solid #FF2D55',
              borderRadius: '6px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.6), 0 0 22px rgba(255,45,85,0.18)',
              backdropFilter: 'blur(6px)',
              padding: '6px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              overflowX: 'auto',
            }}
          >
            <div
              className="ff-bebas"
              style={{
                color: '#FF2D55',
                fontSize: '13px',
                letterSpacing: '0.22em',
                padding: '0 8px 0 4px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                flexShrink: 0,
              }}
            >
              ☠ CHEATS
            </div>

            {groups.map((g, gi) => (
              <div
                key={g}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
              >
                {gi > 0 && (
                  <div style={{ width: '1px', height: '22px', background: 'rgba(170,170,255,0.15)', margin: '0 4px' }} />
                )}
                <span
                  className="ff-space"
                  style={{
                    fontSize: '7px',
                    letterSpacing: '0.22em',
                    color: groupColor[g],
                    opacity: 0.6,
                    padding: '0 2px',
                    textTransform: 'uppercase',
                  }}
                >
                  {groupLabel[g]}
                </span>
                {buttons.filter((b) => b.group === g).map((b) => {
                  const toggleKind = TOGGLE_CMDS[b.cmd];
                  const isActive = toggleKind ? activeFx.has(toggleKind) : false;
                  const c = groupColor[g];
                  return (
                    <button
                      key={b.cmd}
                      onClick={() => onBtn(b.cmd)}
                      title={`${b.cmd} — ${b.title}${isActive ? ' (ON — click to stop)' : ''}`}
                      className="ff-space"
                      aria-pressed={isActive}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '5px 8px',
                        background: isActive ? `${c}2E` : 'rgba(13,13,34,0.9)',
                        border: `1px solid ${isActive ? c : `${c}55`}`,
                        borderRadius: '3px',
                        color: isActive ? c : 'rgba(240,240,255,0.88)',
                        fontSize: '9px',
                        letterSpacing: '0.12em',
                        cursor: 'pointer',
                        flexShrink: 0,
                        transition: 'all 0.12s ease',
                        boxShadow: isActive ? `0 0 12px ${c}80, inset 0 0 8px ${c}33` : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = `${c}22`;
                          e.currentTarget.style.borderColor = c;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'rgba(13,13,34,0.9)';
                          e.currentTarget.style.borderColor = `${c}55`;
                        }
                      }}
                    >
                      {isActive && (
                        <span
                          aria-hidden
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: c,
                            boxShadow: `0 0 6px ${c}`,
                            animation: 'pip-alert 0.9s ease-in-out infinite',
                          }}
                        />
                      )}
                      <span style={{ fontSize: '12px', lineHeight: 1 }}>{b.emoji}</span>
                      <span>{b.label}</span>
                      {isActive && (
                        <span style={{ fontSize: '7px', letterSpacing: '0.2em', opacity: 0.85 }}>ON</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

            <button
              onClick={() => setShowCheatsMenu(false)}
              title="Hide taskbar (/cheats to restore)"
              style={{
                marginLeft: '4px',
                background: 'transparent',
                border: '1px solid rgba(170,170,255,0.2)',
                color: 'rgba(170,170,255,0.6)',
                fontSize: '14px',
                lineHeight: 1,
                cursor: 'pointer',
                padding: '3px 8px',
                borderRadius: '3px',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        );
      })()}

      {/* When hidden, show a tiny re-open tab */}
      {cheatsUnlocked && !showCheatsMenu && (
        <button
          onClick={() => setShowCheatsMenu(true)}
          title="Show cheats taskbar"
          className="ff-space"
          style={{
            position: 'fixed',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 90,
            padding: '4px 10px',
            background: 'rgba(8,8,18,0.88)',
            border: '1px solid rgba(255,45,85,0.4)',
            borderTop: '2px solid #FF2D55',
            borderRadius: '0 0 4px 4px',
            color: '#FF2D55',
            fontSize: '9px',
            letterSpacing: '0.2em',
            cursor: 'pointer',
          }}
        >
          ☠ CHEATS
        </button>
      )}

      {/* Cheat-command confirmation toast (only visible to the prankster) */}
      {cheatToast && (
        <div
          className="anim-slide-up-fast"
          style={{
            position: 'fixed',
            bottom: '76px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 210,
            background: '#0A0A1A',
            border: `1px solid rgba(${myRgb},0.55)`,
            borderLeft: `3px solid ${myHex}`,
            color: myHex,
            padding: '8px 14px',
            fontSize: '11px',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            fontFamily: "'Space Mono', monospace",
            boxShadow: `0 6px 20px rgba(0,0,0,0.55), 0 0 22px rgba(${myRgb},0.25)`,
          }}
        >
          {cheatToast}
        </div>
      )}

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

          {/* Emoji burst picker — one-tap floating emoji send */}
          <div
            style={{
              padding: '8px 10px',
              borderTop: '1px solid rgba(170,170,255,0.07)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
            }}
          >
            <span
              className="ff-space"
              style={{
                color: `rgba(${myRgb},0.45)`,
                fontSize: '7px',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                marginRight: '2px',
                flexShrink: 0,
              }}
            >
              Send
            </span>
            {BURST_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => sendEmojiBurst(e)}
                title={`Send ${e}`}
                aria-label={`Send ${e}`}
                style={{
                  background: 'transparent',
                  border: `1px solid rgba(${myRgb},0.2)`,
                  borderRadius: '3px',
                  padding: '3px 6px',
                  fontSize: '16px',
                  lineHeight: 1,
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
                onMouseEnter={(ev) => {
                  ev.currentTarget.style.background = `rgba(${myRgb},0.12)`;
                  ev.currentTarget.style.borderColor = `rgba(${myRgb},0.6)`;
                  ev.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(ev) => {
                  ev.currentTarget.style.background = 'transparent';
                  ev.currentTarget.style.borderColor = `rgba(${myRgb},0.2)`;
                  ev.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {e}
              </button>
            ))}
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
