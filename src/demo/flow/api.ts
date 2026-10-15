// Talks to /api/demo-flow: the lecturer-led part of the class (Games 1 and 2).
import { useRef, useCallback, useEffect, useState } from 'react';
import type { FlowPhase } from './content';
import type { G4Clock, G4PlayerState, G4Public } from '../game4';

/** What the lecturer can change on the day (projector ⚙). */
export interface FlowSettings {
  g1Sec: number;
  g2ShowSec: number;
  g2VoteSec: number;
  chartSec: number;
  /** Game 3 patients dentists may open (scenario ids, at least one). */
  patients: string[];
  /** The lecturer's names for the patients, by scenario id (missing = built-in name). */
  names: Record<string, string>;
  joinOpen: boolean;
  /** Game 4 build and fix clocks. */
  g4BuildSec: number;
  g4FixSec: number;
}

export const DEFAULT_SETTINGS: FlowSettings = { g1Sec: 180, g2ShowSec: 8, g2VoteSec: 10, chartSec: 90, patients: ['c1', 'c2', 'c3'], names: {}, joinOpen: true, g4BuildSec: 480, g4FixSec: 240 };

export interface FlowView {
  phase: FlowPhase;
  /** When answers were last cleared; the projector can undo that once. */
  backupAt?: number | null;
  backupLabel?: string;
  phaseStartedAt: number;
  g1Ms: number;
  hints: number;
  step: number;
  ask: string | null;
  joined: number;
  /** True once a projector has taken charge of the room. */
  hosted: boolean;
  settings: FlowSettings;
  /** Game 4's build and fix clocks. */
  g4: G4Clock;
}

export interface FlowPlayer {
  id: string;
  nickname: string;
  joinedAt: number;
  g1NoteId: string;
  /** Set when moved after Game 1: the note their Game 1 answers belong to. */
  g1Note?: string;
  g1Selected: string[];
  g1Version: number;
  g1SubmittedAt: number | null;
  g2Signed: boolean | null;
  g2Auto: boolean;
  g2SignedAt: number | null;
  g2Spotted: string | null;
  asks: Record<string, string>;
  g3: { team: string; job: string; name: string; follow: string } | null;
  g4?: G4PlayerState | null;
}

/** A player's running score: each game is worth about 300. */
export interface FlowScore {
  id: string;
  nickname: string;
  team: string | null;
  job: string | null;
  g1: number;
  g2: number;
  g3: number;
  total: number;
}

export interface FlowSnapshot {
  flow: FlowView;
  me: FlowPlayer | null;
  myScore: (FlowScore & { rank: number; of: number }) | null;
  players?: FlowPlayer[];
  scores?: FlowScore[];
  counts: { players: number; g1Done: number; notes: Record<string, number> };
  /** Game 4 only: every team's system, and live counts for this phone's team. */
  g4?: G4Public;
  now: number;
}

const url = (room: string, extra = '') => `/api/demo-flow?room=${encodeURIComponent(room)}${extra}`;

export async function getFlow(room: string, me: string, all = false): Promise<FlowSnapshot> {
  const res = await fetch(url(room, `&me=${encodeURIComponent(me)}${all ? '&all=1' : ''}`), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Load failed: ${res.status}`);
  return res.json();
}

export async function postFlow(room: string, body: Record<string, unknown>): Promise<{ me?: FlowPlayer; flow?: FlowView; g4?: G4Public; now: number; error?: string }> {
  const res = await fetch(url(room), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Failed: ${res.status}`), { status: res.status });
  return data;
}

/**
 * How often a phone asks. Every phone's ask is a request on the free plan
 * (100,000 a day), so phones ask once a second only while they are
 * answering against a clock, and slowly on "Look up" screens.
 */
function phoneDelay(flow: FlowView, every: number): number {
  if (flow.phase === 'g1_play' || flow.phase === 'g2_play') return every;
  if (flow.phase === 'lobby' || flow.phase === 'g2_ready' || flow.ask) return every * 2;
  if (flow.phase === 'g3') return every * 5;
  if (flow.phase === 'final') return every * 10;
  return every * 3;
}

/**
 * Polls the room. `offset` turns this device's clock into the server's, so
 * every screen counts down together. `patch` applies a POST's answer at once.
 */
export function useFlow(room: string | null, me: string, { all = false, every = 1000 } = {}) {
  const [snap, setSnap] = useState<FlowSnapshot | null>(null);
  const [offset, setOffset] = useState(0);
  const [ok, setOk] = useState(true);
  const [tick, setTick] = useState(0);
  // When this phone's last answer was applied: a poll that started earlier
  // carries older data and would briefly undo a fast tap.
  const lastPatchAt = useRef(0);

  useEffect(() => {
    if (!room) return;
    let stop = false;
    let timer = 0;
    let delay = every;
    const poll = () => {
      const startedAt = Date.now();
      getFlow(room, me, all)
        .then((s) => {
          if (stop) return;
          delay = all ? every : phoneDelay(s.flow, every);
          if (startedAt >= lastPatchAt.current) setSnap(s);
          // Keep the clock steady: small differences are network noise.
          const measured = s.now - Date.now();
          setOffset((o) => (Math.abs(measured - o) > 1500 ? measured : Math.round(o * 0.8 + measured * 0.2)));
          setOk(true);
        })
        .catch(() => { if (!stop) setOk(false); })
        .finally(() => { if (!stop) timer = window.setTimeout(poll, document.hidden ? delay * 3 : delay); });
    };
    poll();
    return () => { stop = true; window.clearTimeout(timer); };
  }, [room, me, all, every, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const patch = useCallback((r: { me?: FlowPlayer; flow?: FlowView; g4?: G4Public }) => {
    lastPatchAt.current = Date.now();
    setSnap((s) => (s ? { ...s, me: r.me ?? s.me, flow: r.flow ?? s.flow, g4: r.g4 ?? s.g4 } : s));
  }, []);
  return { snap, offset, ok, refresh, patch };
}

/** The server's time, ticking every `ms`. */
export function useServerNow(offset: number, ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now + offset;
}

export const secondsLeft = (endsAt: number, now: number) => Math.max(0, Math.ceil((endsAt - now) / 1000));
