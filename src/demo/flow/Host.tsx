// The projector during the lecturer-led flow (Games 1 and 2, then the class
// scores; Game 3 is <Board/>). It is the stage: big notes, clocks and results
// like a quiz show. Phones only answer. A quiet "For the lecturer" line says
// what to say next, and the gear opens the settings for the day. The first
// projector to press a button owns the room.

import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Lock, QrCode as QrIcon, RotateCcw, Settings, Smartphone, Undo2, X } from 'lucide-react';
import { Board } from '../Board';
import { Brand, QrCode } from '../ui';
import { postFlow, secondsLeft, useFlow, useServerNow, type FlowPlayer, type FlowScore, type FlowSettings, type FlowView } from './api';
import { BUILT_IN_PATIENTS, TEAMS, applyNames } from '../scenarios';
import {
  G1_HINTS,
  G1_NOTES,
  G1_QUOTE,
  G1_STEPS,
  G2_FOOTER,
  G2_HEADER,
  G2_LINES,
  G2_STEPS,
  MISTAKES,
  POLL_WHO,
  PREDICT,
  SCORE_RULES,
  caughtType,
  isSpotted,
  scoreG1,
  type FlowPhase,
} from './content';
import { deriveTeams, g4Steps, isG4 } from '../game4';
import { g4MoveOnQuestion, g4View } from './Game4Host';
import './host.css';

const KEY_STORE = 'dental-ai.demo-host.v1';
const NOTES_STORE = 'dental-ai.demo-host.notes';

function hostKey(room: string): string {
  try {
    const all = JSON.parse(localStorage.getItem(KEY_STORE) || '{}') as Record<string, string>;
    if (all[room]) return all[room];
    const key = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(KEY_STORE, JSON.stringify({ ...all, [room]: key }));
    return key;
  } catch {
    return 'no-storage';
  }
}

function readNotesShown(): boolean {
  try {
    return localStorage.getItem(NOTES_STORE) !== 'hidden';
  } catch {
    return true;
  }
}

type Group = 'join' | 'g1' | 'g2' | 'g3' | 'final' | 'g4';

/** The flow in order. `label` is the button's name (tests click it). */
const STAGES: Array<{ phase: FlowPhase; label: string; group: Group; word?: string; short: string }> = [
  { phase: 'lobby', label: 'Join', group: 'join', word: 'JOIN', short: 'JOIN' },
  { phase: 'g1_play', label: 'Game 1', group: 'g1', word: 'GAME 1', short: 'PLAY' },
  { phase: 'g1_reveal', label: 'Answers 1', group: 'g1', short: 'ANSWERS' },
  { phase: 'g2_ready', label: 'Game 2', group: 'g2', word: 'GAME 2', short: 'READY' },
  { phase: 'g2_play', label: '8 seconds', group: 'g2', short: 'NOTE' },
  { phase: 'g2_reveal', label: 'Answers 2', group: 'g2', short: 'ANSWERS' },
  { phase: 'g3', label: 'Game 3', group: 'g3', word: 'GAME 3', short: 'GAME 3' },
  { phase: 'final', label: 'Class scores', group: 'final', word: 'SCORES', short: 'SCORES' },
  { phase: 'g4_intro', label: 'Game 4', group: 'g4', word: 'GAME 4', short: 'GAME 4' },
  { phase: 'g4_build', label: 'Build', group: 'g4', short: 'BUILD' },
  { phase: 'g4_run', label: 'Six months', group: 'g4', short: 'RUN' },
  { phase: 'g4_chaos', label: 'Chaos', group: 'g4', short: 'CHAOS' },
  { phase: 'g4_fix', label: 'Fix', group: 'g4', short: 'FIX' },
  { phase: 'g4_rerun', label: 'Rerun', group: 'g4', short: 'RERUN' },
];
const GROUPS: Group[] = ['join', 'g1', 'g2', 'g3', 'final', 'g4'];

/** How many reveal steps each phase has (1 for the others). Game 4's run
 *  has a debate step only when teams chose differently, so it needs the players. */
const stepsIn = (phase: FlowPhase, players: FlowPlayer[] = []) =>
  phase === 'g1_reveal' ? G1_STEPS.length
    : phase === 'g2_reveal' ? G2_STEPS.length
      : isG4(phase) ? g4Steps(phase, deriveTeams(players))
        : 1;

/** The class question that should be open on phones at this point. */
const askFor = (phase: FlowPhase, step: number) =>
  phase === 'g1_reveal' && G1_STEPS[step] === 'predict' ? PREDICT.id : phase === 'g2_reveal' && G2_STEPS[step] === 'poll' ? POLL_WHO.id : null;

type Send = (action: string, extra?: Record<string, unknown>) => Promise<FlowView | undefined>;

export function Host({ room, fresh = false }: { room: string; fresh?: boolean }) {
  const [key] = useState(() => hostKey(room));
  const { snap, offset, ok, patch } = useFlow(room, 'projector', { all: true, every: 1000 });
  const now = useServerNow(offset);
  const [locked, setLocked] = useState(false);
  const [panel, setPanel] = useState(false);
  const [qr, setQr] = useState(false);
  const [notesShown, setNotesShown] = useState(readNotesShown);
  const busy = useRef(false);

  // Take charge of the room as soon as it loads, so nobody else can. A brand
  // new code that turns out to be in use already gets a new code instead.
  const claimed = useRef(false);
  useEffect(() => {
    if (!snap || claimed.current) return;
    claimed.current = true;
    if (fresh && (snap.flow.hosted || snap.flow.joined > 0)) {
      const url = new URL(window.location.href);
      url.searchParams.set('room', String(1000 + Math.floor(Math.random() * 9000)));
      window.location.replace(url);
      return;
    }
    postFlow(room, { type: 'host', key, action: 'claim' })
      .then(patch)
      .catch((e: { status?: number }) => { if (e.status === 403) setLocked(true); });
  }, [snap, fresh, room, key, patch]);

  const joinUrl = useMemo(() => {
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set('room', room);
    return url.toString();
  }, [room]);

  const send: Send = async (action, extra = {}) => {
    try {
      const r = await postFlow(room, { type: 'host', key, action, ...extra });
      patch(r);
      return r.flow;
    } catch (e) {
      if ((e as { status?: number }).status === 403) setLocked(true);
      return undefined;
    }
  };

  /** One move at a time: a double click or a held key never skips a step. */
  const once = async (fn: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    try { await fn(); } finally { busy.current = false; }
  };

  const go = (target: FlowPhase, targetStep = 0, replay = false) => once(async () => {
    if (!snap) return;
    let phase = target;
    let step = targetStep;
    if (snap.flow.phase === 'g3' && phase !== 'g3' && !window.confirm('Leave Game 3? Any chart a dentist has not signed yet is lost.')) return;
    // Starting a game again wipes its answers, so moving around never does it:
    // NEXT goes on to a played game's results, BACK goes to the screen before it.
    // Playing it again is its own button in ⚙ (and the server keeps a copy to undo).
    const ps = snap.players ?? [];
    const answered =
      phase === 'g1_play' ? ps.filter((p) => p.g1SubmittedAt !== null || p.g1Selected.length > 0).length
        : phase === 'g2_play' ? ps.filter((p) => p.g2Signed !== null).length
          : 0;
    const game = phase === 'g1_play' ? 'Game 1' : 'Game 2';
    if (answered && !replay) {
      const forward = STAGES.findIndex((s) => s.phase === phase) > STAGES.findIndex((s) => s.phase === snap.flow.phase);
      phase = forward ? (phase === 'g1_play' ? 'g1_reveal' : 'g2_reveal') : (phase === 'g1_play' ? 'lobby' : 'g2_ready');
      step = forward ? 0 : Math.max(0, stepsIn(phase, ps) - 1);
    } else if (answered && !window.confirm(`Play ${game} again? This clears the answers ${answered} player${answered === 1 ? ' has' : 's have'} given. (You can undo it once in ⚙.)`)) return;
    // Game 4: moving on while a team is still building or fixing asks first (nothing is lost either way).
    const unfinished = g4MoveOnQuestion(snap.flow.phase, phase, ps);
    if (unfinished && !window.confirm(unfinished)) return;
    await send('phase', { phase });
    if (step) await send('step', { step });
    const ask = askFor(phase, step);
    if (ask) await send('ask', { ask });
  });
  const goStep = (step: number) => once(async () => {
    if (!snap) return;
    await send('step', { step });
    await send('ask', { ask: askFor(snap.flow.phase, step) ?? '' });
  });

  const flow = snap?.flow;
  // The lecturer's patient names, for every screen this projector draws.
  if (flow) applyNames(flow.settings.names);
  const stageIdx = flow ? STAGES.findIndex((s) => s.phase === flow.phase) : 0;
  const noteShowing = !!flow && flow.phase === 'g2_play' && now - flow.phaseStartedAt < flow.settings.g2ShowSec * 1000;
  const atEnd = stageIdx === STAGES.length - 1 && (flow?.step ?? 0) >= stepsIn(flow?.phase ?? 'lobby', snap?.players) - 1;
  const atStart = stageIdx === 0 && (flow?.step ?? 0) === 0;

  const next = () => {
    if (!flow || busy.current) return;
    // The note runs its course; the vote follows by itself.
    if (noteShowing) return;
    if (flow.step < stepsIn(flow.phase, snap?.players) - 1) return goStep(flow.step + 1);
    const to = STAGES[stageIdx + 1];
    if (to) return go(to.phase);
  };
  const back = () => {
    if (!flow || busy.current) return;
    if (flow.step > 0) return goStep(flow.step - 1);
    const to = STAGES[stageIdx - 1];
    if (to) return go(to.phase, stepsIn(to.phase, snap?.players) - 1);
  };
  const toggleNotes = () => {
    setNotesShown((shown) => {
      try { localStorage.setItem(NOTES_STORE, shown ? 'hidden' : 'shown'); } catch { /* private window */ }
      return !shown;
    });
  };

  // Presentation clickers send PageUp / PageDown; keyboards use arrows, Space, Enter.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (panel) {
      if (e.key === 'Escape') setPanel(false);
      return;
    }
    if (qr && (e.key === 'Escape' || e.key === 'q' || e.key === 'Q')) {
      setQr(false);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || !flow) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const k = e.key;
    if (k === 'n' || k === 'N') {
      if (!e.repeat && flow.phase !== 'g3') toggleNotes();
      return;
    }
    if (k === 'q' || k === 'Q') {
      if (!e.repeat) setQr(true);
      return;
    }
    const forward = k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter';
    const backward = k === 'ArrowLeft' || k === 'PageUp';
    if (!forward && !backward) return;
    // Game 3's board has its own buttons; only the arrows and the clicker move on from it.
    if (flow.phase === 'g3' && (k === ' ' || k === 'Enter')) return;
    e.preventDefault();
    if (e.repeat) return;
    // Space or Enter must not also press whatever button has focus.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    void (forward ? next() : back());
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!snap || !flow) {
    return (
      <div className="fh fh-screen">
        <p className="fh-wait">{ok ? 'Connecting…' : 'Cannot reach the server. Check the Wi-Fi.'}</p>
      </div>
    );
  }

  const players = snap.players ?? [];
  const reset = () => {
    if (window.confirm(`Start room ${room.toUpperCase()} again? Every player and answer is deleted. Settings stay.`)) {
      void send('reset');
      setPanel(false);
    }
  };
  const move = (p: FlowPlayer, note: string) => void send('move', { id: p.id, note });
  const restore = () => {
    if (window.confirm(`Undo "${flow.backupLabel ?? 'the last clear'}"? Every player's answers and scores go back to how they were just before it.`)) {
      void send('restore');
      setPanel(false);
    }
  };
  const replay = (phase: FlowPhase) => {
    setPanel(false);
    void go(phase, 0, true);
  };
  // The join QR over any screen, so nobody has to go back to the lobby for late joiners.
  const qrLayer = qr && (
    <div className="fh fh-layer fh-qr-layer" onClick={() => setQr(false)}>
      <section className="fh-card fh-join fh-qr-big" onClick={(e) => e.stopPropagation()}>
        <span className="fh-join-kicker">JOIN ON YOUR PHONE</span>
        <QrCode text={joinUrl} />
        <span className="fh-join-url">{joinUrl.replace(/^https?:\/\//, '').replace(/\?room=.*$/, '')}</span>
        <span className="fh-join-code">ROOM <b>{room.toUpperCase()}</b></span>
        <span className="fh-qr-hint">Back with a new phone? Type the same name to get your score back.</span>
        <button className="fh-next" onClick={() => setQr(false)}>CLOSE</button>
      </section>
    </div>
  );
  const kick = (p: FlowPlayer) => {
    if (window.confirm(`Remove ${p.nickname}? Their phone goes back to the join screen.`)) void send('kick', { id: p.id });
  };
  const settingsPanel = panel && (
    <div className="fh fh-layer">
      <SettingsPanel
        room={room}
        settings={flow.settings}
        players={players}
        onSave={(s) => { void send('settings', { settings: s }); setPanel(false); }}
        onKick={kick}
        onMove={move}
        onRestore={flow.backupAt ? restore : undefined}
        backupLabel={flow.backupLabel}
        onReplay={replay}
        onReset={reset}
        onClose={() => setPanel(false)}
      />
    </div>
  );

  if (flow.phase === 'g3') {
    return (
      <>
        <Board
          room={room}
          hostKey={key}
          openPatients={flow.settings.patients}
          onBack={() => void go('g2_reveal', G2_STEPS.length - 1)}
          onNext={() => void go('final')}
          onSettings={() => setPanel(true)}
        />
        {settingsPanel}
        {qrLayer}
      </>
    );
  }

  const ctx: Ctx = { flow, players, now, joinUrl, room, send };
  const view = flow.phase === 'final' ? finalView(snap.scores ?? []) : isG4(flow.phase) ? g4View(ctx) : stageView(ctx);
  // Where the class should look right now. Phones show the same cue.
  const elapsedNow = now - flow.phaseStartedAt;
  const showMsNow = flow.settings.g2ShowSec * 1000;
  const votingNow = elapsedNow >= showMsNow && elapsedNow < showMsNow + flow.settings.g2VoteSec * 2000;
  const cue: { kind: 'phone' | 'screen'; text: string } | null =
    flow.phase === 'lobby' ? { kind: 'phone', text: 'JOIN ON YOUR PHONE' }
      : flow.phase === 'g1_play' ? (now < flow.phaseStartedAt + flow.g1Ms ? { kind: 'phone', text: 'ON YOUR PHONE: FIND THE 3 MISTAKES' } : { kind: 'screen', text: 'EYES ON THIS SCREEN' })
        : flow.phase === 'g2_play' ? (elapsedNow < showMsNow ? null : votingNow ? { kind: 'phone', text: 'VOTE ON YOUR PHONE' } : { kind: 'screen', text: 'EYES ON THIS SCREEN' })
          : flow.phase === 'g4_build' ? { kind: 'phone', text: 'BUILD ON YOUR PHONE' }
            : flow.phase === 'g4_fix' ? { kind: 'phone', text: 'FIX ONE BOX ON YOUR PHONE' }
          : flow.ask ? { kind: 'phone', text: 'ANSWER ON YOUR PHONE' }
            : flow.phase === 'g2_ready' ? { kind: 'screen', text: 'EYES ON THIS SCREEN' }
              : { kind: 'screen', text: 'EYES ON THIS SCREEN' };
  const cur = STAGES[stageIdx];
  const steps = stepsIn(flow.phase, players);
  const nowLabel = `${cur.short}${steps > 1 ? ` ${flow.step + 1}/${steps}` : ''}`;

  return (
    <div className={`fh fh-screen${view.alert ? ' fh--alert' : ''}`}>
      <header className="fh-top">
        <Brand room={room} />
        <nav className="fh-trail" aria-label="Jump to">
          {GROUPS.map((g) => {
            const mine = STAGES.map((s, i) => ({ s, i })).filter(({ s }) => s.group === g);
            const first = mine[0].i;
            const last = mine[mine.length - 1].i;
            const state = stageIdx > last ? 'done' : stageIdx >= first ? 'in' : '';
            return (
              <span key={g} className={`fh-trail-group ${state}`}>
                {mine.map(({ s, i }) => {
                  const on = i === stageIdx;
                  const cls = s.word ? 'fh-trail-word' : 'fh-trail-pip';
                  return (
                    <button
                      key={s.phase}
                      className={`${cls}${on ? ' on' : i < stageIdx ? ' done' : ''}`}
                      onClick={() => void go(s.phase)}
                      aria-label={s.label}
                      aria-current={on ? 'step' : undefined}
                      title={s.label}
                    >
                      {s.word ?? (on ? nowLabel : <i />)}
                    </button>
                  );
                })}
              </span>
            );
          })}
        </nav>
        <div className="fh-controls">
          {!ok && <span className="fh-offline">OFFLINE</span>}
          <button className="fh-icon" onClick={() => void back()} disabled={atStart} aria-label="Back" title="Back (←)"><ChevronLeft size="1.4em" /></button>
          <button className="fh-next" onClick={() => void next()} disabled={noteShowing || atEnd}>
            {view.nextLabel} {!noteShowing && !atEnd && <ChevronRight size="1.3em" />}
          </button>
          <button className="fh-icon fh-icon--quiet" onClick={() => setQr(true)} aria-label="Show join QR" title="Show join QR (Q)"><QrIcon size="1.25em" /></button>
          <button className="fh-icon fh-icon--quiet" onClick={() => setPanel(true)} aria-label="Settings" title="Settings"><Settings size="1.25em" /></button>
        </div>
      </header>
      {locked && (
        <p className="fh-locked">
          This room is run from another screen. <a href={`${window.location.pathname}#board`}>Open a new room</a>
        </p>
      )}
      <main className="fh-stage">
        {cue && (
          <p className={`fh-cue fh-cue--${cue.kind}`} role="status">
            {cue.kind === 'phone' ? <Smartphone size="1.1em" aria-hidden="true" /> : <Eye size="1.1em" aria-hidden="true" />} {cue.text}
          </p>
        )}
        <div key={view.key} className="fh-body sq-enter">{view.body}</div>
      </main>
      <footer className={`fh-say${notesShown ? '' : ' is-hidden'}`}>
        {notesShown && (
          <>
            <b>FOR THE LECTURER</b>
            <span>{view.say}</span>
          </>
        )}
        <button className="fh-say-toggle" onClick={toggleNotes} title="Show or hide (N)">
          {notesShown ? <EyeOff size="1.1em" /> : <Eye size="1.1em" />}
          {notesShown ? 'HIDE · N' : 'LECTURER NOTES · N'}
        </button>
      </footer>
      {settingsPanel}
      {qrLayer}
    </div>
  );
}

// ── Settings for the day: a plain form ──

const CLOCKS: Array<{ key: 'g1Sec' | 'g2ShowSec' | 'g2VoteSec' | 'chartSec' | 'g4BuildSec' | 'g4FixSec'; label: string; min: number; max: number }> = [
  { key: 'g1Sec', label: 'Game 1: time to find the mistakes', min: 30, max: 300 },
  { key: 'g2ShowSec', label: 'Game 2: note on screen', min: 3, max: 30 },
  { key: 'g2VoteSec', label: 'Game 2: time for each vote', min: 5, max: 30 },
  { key: 'chartSec', label: 'Game 3: chart clock', min: 30, max: 300 },
  { key: 'g4BuildSec', label: 'Game 4: time to build', min: 60, max: 1800 },
  { key: 'g4FixSec', label: 'Game 4: time to fix', min: 60, max: 900 },
];

function SettingsPanel({ room, settings, players, onSave, onKick, onMove, onRestore, backupLabel, onReplay, onReset, onClose }: {
  room: string;
  settings: FlowSettings;
  players: FlowPlayer[];
  onSave: (s: Partial<FlowSettings>) => void;
  onKick: (p: FlowPlayer) => void;
  onMove: (p: FlowPlayer, note: string) => void;
  /** Present only when the server holds a copy from before the last clear. */
  onRestore?: () => void;
  backupLabel?: string;
  onReplay: (phase: FlowPhase) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  // Clocks are kept as typed text; the server clamps them to their range.
  const [clocks, setClocks] = useState(() => Object.fromEntries(CLOCKS.map((c) => [c.key, String(settings[c.key])])));
  const [patients, setPatients] = useState(() => (settings.patients.length ? settings.patients : ['c1', 'c2', 'c3']));
  const [names, setNames] = useState<Record<string, string>>(() => ({ ...settings.names }));
  const [joinOpen, setJoinOpen] = useState(settings.joinOpen);
  const save = () => {
    const cleanNames = Object.fromEntries(Object.entries(names).map(([k, v]) => [k, v.replace(/\s+/g, ' ').trim()]).filter(([, v]) => v));
    const out: Partial<FlowSettings> = { joinOpen, patients, names: cleanNames };
    for (const c of CLOCKS) {
      const v = Number(clocks[c.key]);
      if (clocks[c.key].trim() !== '' && Number.isFinite(v)) out[c.key] = Math.max(c.min, Math.min(c.max, Math.round(v)));
    }
    onSave(out);
  };

  return (
    <section className="fh-panel" role="dialog" aria-modal="true" aria-labelledby="fh-panel-title">
      <header className="fh-panel-head">
        <h2 id="fh-panel-title">SETTINGS</h2>
        <span className="fh-panel-room">ROOM {room.toUpperCase()}</span>
        <button className="fh-icon" onClick={onClose} aria-label="Close" title="Close (Esc)" autoFocus><X size="1.3em" /></button>
      </header>
      <div className="fh-panel-body">
        <div className="fh-panel-col">
          <h3>CLOCKS (SECONDS)</h3>
          {CLOCKS.map((c) => (
            <label key={c.key} className="fh-num">
              <span>{c.label} <small>{c.min} to {c.max}</small></span>
              <input type="number" min={c.min} max={c.max} value={clocks[c.key]} onChange={(e) => setClocks((v) => ({ ...v, [c.key]: e.target.value }))} />
            </label>
          ))}
          <p className="fh-panel-hint">A new time counts from the next start of that game.</p>
          <h3>GAME 3 PATIENTS</h3>
          {BUILT_IN_PATIENTS.map((p) => {
            const on = patients.includes(p.id);
            return (
              <div key={p.id} className="fh-patient">
                <label className="fh-check">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={on && patients.length === 1}
                    aria-label={`Open patient ${p.number}`}
                    onChange={() => setPatients((ps) => (on ? ps.filter((x) => x !== p.id) : BUILT_IN_PATIENTS.map((q) => q.id).filter((x) => x === p.id || ps.includes(x))))}
                  />
                  <b>{p.number}</b>
                </label>
                <input
                  className="fh-name"
                  value={names[p.id] ?? ''}
                  placeholder={p.name}
                  maxLength={24}
                  aria-label={`Name for patient ${p.number}`}
                  onChange={(e) => setNames((n) => ({ ...n, [p.id]: e.target.value }))}
                />
                <small>{p.backup ? 'BACKUP · ' : ''}{p.reason}</small>
              </div>
            );
          })}
          <p className="fh-panel-hint">Tick the patients dentists can open. Type a new name to rename one (first and last name; keep him/her the same). Empty keeps the name shown.</p>
          <h3>JOINING</h3>
          <label className="fh-check">
            <input type="checkbox" checked={joinOpen} onChange={(e) => setJoinOpen(e.target.checked)} />
            Let new players join
          </label>
        </div>
        <div className="fh-panel-col">
          <h3>PLAYERS <b>{players.length}</b></h3>
          {players.length ? (
            <ul className="fh-roster">
              {[...players].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => (
                <li key={p.id}>
                  <span>{p.nickname} <small>GROUP {p.g1NoteId}</small></span>
                  <span className="fh-move" role="group" aria-label={`Move ${p.nickname} to a group`}>
                    {G1_NOTES.map((n) => (
                      <button key={n.id} className={`fh-ghost${n.id === p.g1NoteId ? ' on' : ''}`} data-note={n.id} disabled={n.id === p.g1NoteId}
                        onClick={() => onMove(p, n.id)} aria-label={`Move ${p.nickname} to group ${n.id}`} title={`Move to group ${n.id}`}>{n.id}</button>
                    ))}
                  </span>
                  <button className="fh-ghost" onClick={() => onKick(p)} aria-label={`Remove ${p.nickname}`}>Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fh-panel-hint">Nobody has joined yet.</p>
          )}
          <h3>ROOM</h3>
          {onRestore && (
            <>
              <button className="fh-icon fh-icon--wide" onClick={onRestore} aria-label="Undo the last clear" title="Undo the last clear">
                <Undo2 size="1.1em" /> UNDO: {(backupLabel ?? 'last clear').toUpperCase()}
              </button>
              <p className="fh-panel-hint">Puts every player's answers and scores back as they were just before it. Works once.</p>
            </>
          )}
          <div className="fh-replay">
            <button className="fh-ghost" onClick={() => onReplay('g1_play')}>Play Game 1 again</button>
            <button className="fh-ghost" onClick={() => onReplay('g2_play')}>Play Game 2 again</button>
          </div>
          <p className="fh-panel-hint">NEXT and BACK never restart a game that was played. These do, and clear its answers (undo once above).</p>
          <button className="fh-icon fh-icon--wide fh-danger" onClick={onReset} aria-label="Start again" title="Start again">
            <RotateCcw size="1.1em" /> START AGAIN
          </button>
          <p className="fh-panel-hint">Deletes every player and answer. Settings stay.</p>
        </div>
      </div>
      <footer className="fh-panel-foot">
        <button className="fh-ghost" onClick={onClose}>Cancel</button>
        <button className="fh-next" onClick={save}>SAVE</button>
      </footer>
    </section>
  );
}

// ── Stages ──

interface Ctx {
  flow: FlowView;
  players: FlowPlayer[];
  now: number;
  joinUrl: string;
  room: string;
  send: Send;
}

interface StageView {
  body: ReactNode;
  say: string;
  nextLabel: string;
  /** Changes when the screen changes, so the content animates in. */
  key: string;
  alert?: boolean;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function stageView({ flow, players, now, joinUrl, room, send }: Ctx): StageView {
  const elapsed = now - flow.phaseStartedAt;
  const { settings } = flow;

  if (flow.phase === 'lobby') {
    const many = players.length > 45 ? ' fh-names--tiny' : players.length > 24 ? ' fh-names--small' : '';
    return {
      key: 'lobby',
      nextLabel: 'START GAME 1',
      say: `Sit with your group letter: same letter, same note. You may talk inside your group. Each note has 3 hidden mistakes, and you have ${settings.g1Sec} seconds.`,
      body: (
        <div className="fh-lobby">
          <section className="fh-card fh-join">
            <span className="fh-join-kicker">JOIN ON YOUR PHONE</span>
            <QrCode text={joinUrl} />
            <span className="fh-join-url">{joinUrl.replace(/^https?:\/\//, '').replace(/\?room=.*$/, '')}</span>
            <span className="fh-join-code">ROOM <b>{room.toUpperCase()}</b></span>
            {!settings.joinOpen && <span className="fh-join-closed"><Lock size="1em" /> Joining is closed</span>}
          </section>
          <section className="fh-lobby-main">
            <p className="fh-kicker">GAME 1</p>
            <h1 className="fh-h1 fh-title">Spot the error</h1>
            <p className="fh-lead">An AI wrote these notes. Each one hides 3 mistakes. Find them with your group.</p>
            <p className="fh-count"><b>{players.length}</b> {players.length === 1 ? 'player' : 'players'}</p>
            <div className="fh-groups">
              {G1_NOTES.map((n) => {
                const mine = players.filter((p) => p.g1NoteId === n.id);
                return (
                  <div key={n.id} className="fh-group" data-note={n.id}>
                    <h2>GROUP {n.id} <small>{mine.length}</small></h2>
                    <div className={`fh-names${many}`}>
                      {mine.map((p) => <span key={p.id}>{p.nickname}</span>)}
                      {!mine.length && <em className="fh-names-empty">Waiting…</em>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ),
    };
  }

  if (flow.phase === 'g1_play') {
    const endsAt = flow.phaseStartedAt + flow.g1Ms;
    const left = secondsLeft(endsAt, now);
    const done = players.filter((p) => p.g1SubmittedAt !== null).length;
    const circled = players.filter((p) => p.g1Selected.length > 0 || p.g1SubmittedAt !== null).length;
    const quiet = elapsed > 45_000 && players.length > 0 && circled / players.length < 0.2;
    return {
      key: 'g1_play',
      nextLabel: 'SHOW ANSWERS',
      say: left === 0
        ? "Time's up. Ask one group: which line was hardest to decide?"
        : quiet
          ? `Only ${Math.round((circled / players.length) * 100)}% have circled anything. Send a hint?`
          : 'Walk around and listen to the groups. Do not give answers.',
      body: (
        <div className="fh-g1">
          <p className="fh-kicker">GAME 1 · SPOT THE ERROR</p>
          <div className={`fh-big-clock${left <= 10 ? ' low' : ''}`} role="timer">{left === 0 ? "TIME'S UP" : clock(left)}</div>
          <div className="fh-meter" aria-label={`${done} of ${players.length} done`}>
            <div style={{ width: `${players.length ? (done / players.length) * 100 : 0}%` }} />
          </div>
          <p className="fh-lead"><b>{done}</b> of <b>{players.length}</b> players done</p>
          <div className="fh-groups fh-groups--small">
            {G1_NOTES.map((n) => {
              const mine = players.filter((p) => p.g1NoteId === n.id);
              const fin = mine.filter((p) => p.g1SubmittedAt !== null).length;
              return (
                <div key={n.id} className="fh-group" data-note={n.id}>
                  <h2>GROUP {n.id} <small>{n.topic}</small></h2>
                  <p><b>{fin}</b> of {mine.length} done</p>
                  <div className="fh-meter fh-meter--thin"><div style={{ width: `${mine.length ? (fin / mine.length) * 100 : 0}%` }} /></div>
                </div>
              );
            })}
          </div>
          <div className="fh-tools">
            <button className="fh-tool" onClick={() => void send('hint')} disabled={flow.hints >= 3 || left === 0}>
              {flow.hints >= 3 ? 'All 3 hints sent' : `Send hint ${flow.hints + 1}: "${G1_HINTS[flow.hints]}"`}
            </button>
            <button className="fh-tool" onClick={() => void send('extend')}>+30 seconds</button>
          </div>
        </div>
      ),
    };
  }

  if (flow.phase === 'g1_reveal') return g1Reveal(flow, players);

  if (flow.phase === 'g2_ready') {
    return {
      key: 'g2_ready',
      nextLabel: `START (${settings.g2ShowSec} SECONDS)`,
      say: 'Do not warn them about anything. Just say: you are a busy doctor with 20 patients today. Phones down, eyes on this screen.',
      body: (
        <div className="fh-center">
          <p className="fh-kicker">GAME 2</p>
          <h1 className="fh-h1 fh-title fh-title--huge">The {settings.g2ShowSec}-second test</h1>
          <p className="fh-lead">One AI note appears here for {settings.g2ShowSec} seconds. Then, on your phone: would you sign it?</p>
          <p className="fh-callout"><Eye size="1.2em" /> PHONES DOWN · EYES ON THIS SCREEN</p>
        </div>
      ),
    };
  }

  if (flow.phase === 'g2_play') {
    const showMs = settings.g2ShowSec * 1000;
    if (elapsed < showMs) {
      return {
        key: 'g2_note',
        alert: true,
        nextLabel: 'WAIT',
        say: 'Stay quiet.',
        body: (
          <div className="fh-g2">
            <G2Note />
            <div className="fh-g2-count" role="timer">
              <b>{Math.max(1, Math.ceil((showMs - elapsed) / 1000))}</b>
              <span>SECONDS</span>
            </div>
          </div>
        ),
      };
    }
    const voted = players.filter((p) => p.g2Signed !== null).length;
    const both = players.filter((p) => p.g2Spotted !== null).length;
    const left = secondsLeft(flow.phaseStartedAt + (settings.g2ShowSec + settings.g2VoteSec * 2) * 1000, now);
    return {
      key: 'g2_vote',
      nextLabel: 'SHOW ANSWERS',
      say: `Vote on your phones now. ${settings.g2VoteSec} seconds per question.`,
      body: (
        <div className="fh-center">
          <p className="fh-kicker">THE NOTE IS GONE</p>
          <h1 className="fh-h1 fh-title fh-title--huge">Vote on your phone</h1>
          <div className="fh-tiles">
            <div className="fh-card fh-tile"><b>{voted}<small>/{players.length}</small></b><span>Would you sign?</span></div>
            <div className="fh-card fh-tile"><b>{both}<small>/{players.length}</small></b><span>Did you see a problem?</span></div>
          </div>
          <div className={`fh-big-clock fh-big-clock--small${left > 0 && left <= 5 ? ' low' : ''}`} role="timer">{left > 0 ? left : 'CLOSED'}</div>
        </div>
      ),
    };
  }

  if (flow.phase === 'g2_reveal') return g2Reveal(flow, players);

  return { key: 'none', nextLabel: 'NEXT', say: '', body: null };
}

// ── Class scores, after Game 3 ──

function finalView(scores: FlowScore[]): StageView {
  const top = scores.slice(0, 10);
  const rankOf = (s: FlowScore) => 1 + scores.filter((x) => x.total > s.total).length;
  const teams = TEAMS.map((t) => {
    const members = scores.filter((s) => s.team === t.id);
    const avg = members.length ? Math.round(members.reduce((a, s) => a + s.total, 0) / members.length) : 0;
    return { team: t, members: members.length, avg };
  }).sort((a, b) => b.avg - a.avg);
  return {
    key: 'final',
    nextLabel: 'GAME 4',
    say: top[0]
      ? `Congratulate ${top.slice(0, 3).map((s) => s.nickname).join(', ')}. Then ask: in Game 3, was the winning team better, or did its tool help more? At 60:00, press GAME 4.`
      : 'Nobody has played yet. At 60:00, press GAME 4.',
    body: (
      <div className="fh-final">
        <section className="fh-card fh-final-main">
          <h1 className="fh-h1 fh-title">Class scores</h1>
          <table className="fh-score-table">
            <thead><tr><th>#</th><th>Player</th><th>Team</th><th>Game 1</th><th>Game 2</th><th>Game 3</th><th>Total</th></tr></thead>
            <tbody>
              {top.map((s) => {
                const team = TEAMS.find((t) => t.id === s.team);
                return (
                  <tr key={s.id} className={rankOf(s) === 1 ? 'first' : ''}>
                    <td className="fh-rank">{rankOf(s)}</td>
                    <td className="fh-leader-name">{s.nickname}</td>
                    <td className={team ? `fh-team-cell fh-team-cell--${team.mode}` : undefined}>{team ? team.name : '-'}</td>
                    <td>{s.g1}</td><td>{s.g2}</td><td>{s.g3}</td>
                    <td className="fh-total">{s.total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!top.length && <p className="fh-empty">Nobody has played yet.</p>}
          <ul className="fh-rules">{SCORE_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>
        <aside className="fh-card fh-teams">
          <h2>TEAM AVERAGES</h2>
          {teams.map(({ team, members, avg }, i) => (
            <div key={team.id} className={`fh-team-row fh-team-row--${team.mode}${i === 0 && members ? ' first' : ''}`}>
              <span className="fh-team-name">{team.name}<small>{team.label} · {members} player{members === 1 ? '' : 's'}</small></span>
              <b>{members ? avg : '-'}</b>
            </div>
          ))}
          <p className="fh-small">For fun: the average of each member's total over all 3 games. Teams formed only in Game 3.</p>
        </aside>
      </div>
    ),
  };
}

// ── Game 1 reveal ──

function g1Reveal(flow: FlowView, players: FlowPlayer[]): StageView {
  const step = G1_STEPS[flow.step] ?? 'leaders';
  const played = players.filter((p) => p.g1SubmittedAt !== null || p.g1Selected.length > 0);
  const n = played.length;
  const rate = (t: (typeof MISTAKES)[number]['type']) => (n ? played.filter((p) => caughtType(p.g1Note ?? p.g1NoteId, p.g1Selected, t)).length / n : 0);
  const found = n ? played.reduce((a, p) => a + scoreG1(p.g1Note ?? p.g1NoteId, p.g1Selected).caught, 0) / (n * 3) : 0;
  const byRate = [...MISTAKES].sort((a, b) => rate(a.type) - rate(b.type));
  const guesses = players.filter((p) => p.asks[PREDICT.id]);
  const guessCount = (t: string) => guesses.filter((p) => p.asks[PREDICT.id] === t).length;
  const topGuess = [...MISTAKES].sort((a, b) => guessCount(b.type) - guessCount(a.type))[0];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const nextLabel = flow.step < G1_STEPS.length - 1 ? 'NEXT' : 'GAME 2';

  if (step === 'predict') {
    return {
      key: 'g1:predict',
      nextLabel: 'SHOW RESULTS',
      say: 'Groups, agree on one guess and vote on your phones. Then ask one group why they picked it.',
      body: (
        <div className="fh-center">
          <p className="fh-kicker">GUESS FIRST</p>
          <h1 className="fh-h1">{PREDICT.question}</h1>
          <div className="fh-options">
            {PREDICT.options.map((o, i) => <div key={o.id} className="fh-card fh-option"><b>{i + 1}</b><span>{o.label}</span></div>)}
          </div>
          <p className="fh-lead"><b>{guesses.length}</b> of {players.length} guesses in</p>
        </div>
      ),
    };
  }

  if (step === 'stats') {
    return {
      key: 'g1:stats',
      nextLabel,
      say: (() => {
        const guessed = guesses.length ? `Most of you guessed "${topGuess.short}" would be missed most. ` : '';
        if (n && rate(byRate[0].type) === 1) return `${guessed}Everyone found every mistake! Ask: would you catch them as fast on your 20th note of the day?`;
        return `${guessed}The class missed "${byRate[0].short}" most. Why is that one hard to see?`;
      })(),
      body: (
        <div className="fh-stats">
          <h1 className="fh-h1">The class found <b className="fh-accent">{pct(found)}</b> of all mistakes</h1>
          <div className="fh-card fh-bars fh-bars--guess">
            <div className="fh-bar-row fh-bar-head" aria-hidden="true">
              <span />
              <span>FOUND BY THE CLASS</span>
              <span />
              {guesses.length > 0 && <span>YOUR GUESS: MISSED MOST</span>}
            </div>
            {byRate.map((m) => (
              <div key={m.type} className="fh-bar-row">
                <span className="fh-bar-label">{m.short}</span>
                <div className="fh-bar"><div style={{ width: pct(rate(m.type)) }} /></div>
                <span className="fh-bar-num">{pct(rate(m.type))}</span>
                {guesses.length > 0 && (
                  <span className="fh-bar-guess">
                    <span className="fh-guess-bar"><span style={{ width: `${(guessCount(m.type) / guesses.length) * 100}%` }} /></span>
                    {guessCount(m.type)} of {guesses.length}
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="fh-small">{n} player{n === 1 ? '' : 's'} · least found at the top</p>
        </div>
      ),
    };
  }

  if (step === 'card1' || step === 'card2' || step === 'card3') {
    const shown = Number(step.slice(-1));
    const current = MISTAKES[shown - 1];
    return {
      key: 'g1:cards',
      nextLabel,
      say: current.ask,
      body: (
        <div className="fh-cards">
          {MISTAKES.map((m, i) => (i < shown ? (
            <article key={m.type} className={`fh-card fh-mistake${i === shown - 1 ? ' now sq-enter' : ''}`}>
              <p className="fh-mistake-num">MISTAKE {i + 1}</p>
              <h2>{m.title}</h2>
              <p>{m.why}</p>
              <p className="fh-found"><b>{pct(rate(m.type))}</b> of the class found it</p>
            </article>
          ) : (
            <article key={m.type} className="fh-card fh-mistake hidden" aria-label={`Mistake ${i + 1}, not shown yet`}>
              <span className="fh-card-back">?</span>
            </article>
          )))}
        </div>
      ),
    };
  }

  if (step === 'quote') {
    return {
      key: 'g1:quote',
      nextLabel,
      say: 'The notes are made up, but all three mistakes really happened with the AI scribe in the case.',
      body: (
        <figure className="fh-quote">
          <blockquote>“{G1_QUOTE.text}”</blockquote>
          <figcaption>{G1_QUOTE.who}</figcaption>
          <p>{G1_QUOTE.note}</p>
        </figure>
      ),
    };
  }

  const leaders = [...played]
    .map((p) => ({ p, s: scoreG1(p.g1Note ?? p.g1NoteId, p.g1Selected) }))
    .sort((a, b) => b.s.score - a.s.score || (a.p.g1SubmittedAt ?? Infinity) - (b.p.g1SubmittedAt ?? Infinity))
    .slice(0, 5);
  return {
    key: 'g1:leaders',
    nextLabel: 'GAME 2',
    say: leaders[0] ? `Ask ${leaders[0].p.nickname}: what helped you spot the mistakes? How did your group decide?` : 'Nobody has played yet.',
    body: (
      <div className="fh-stats">
        <h1 className="fh-h1 fh-title">Top 5 checkers</h1>
        <ol className="fh-leaders">
          {leaders.map(({ p, s }, i) => (
            <li key={p.id} data-note={p.g1NoteId} className={i === 0 ? 'first' : ''}>
              <span className="fh-rank">{i + 1}</span>
              <span className="fh-leader-name">{p.nickname}</span>
              <span className="fh-chip">GROUP {p.g1NoteId}</span>
              <span className="fh-leader-score">{s.score * 100}<small> pts{s.perfect ? ' · perfect' : ''}</small></span>
            </li>
          ))}
        </ol>
        {!leaders.length && <p className="fh-empty">Nobody has played yet.</p>}
        <p className="fh-small">Score: 100 per mistake found, minus 100 per correct line circled. Ties go to whoever submitted first.</p>
      </div>
    ),
  };
}

// ── Game 2 ──

function G2Note({ marked = false }: { marked?: boolean }) {
  return (
    <div className={`fh-note${marked ? ' marked' : ''}`}>
      <div className="fh-note-head">{G2_HEADER}</div>
      <div className="fh-note-grid">
        {G2_LINES.map((l, i) => (
          <p key={l.id} className={`fh-note-line${marked && l.bad ? ' bad' : ''}`} style={{ gridRow: i + 1 }}>{l.text}</p>
        ))}
        {marked && <span className="fh-link" aria-hidden="true" style={{ gridRow: '2 / 6' }} />}
      </div>
      <p className="fh-note-sign">Signature: ____</p>
      <p className="fh-note-foot">{G2_FOOTER}</p>
    </div>
  );
}

function g2Reveal(flow: FlowView, players: FlowPlayer[]): StageView {
  const step = G2_STEPS[flow.step] ?? 'poll';
  const voters = players.filter((p) => p.g2Signed !== null);
  const signed = voters.filter((p) => p.g2Signed).length;
  const spotted = voters.filter((p) => isSpotted(p.g2Spotted)).length;
  const pct = (x: number) => (voters.length ? `${Math.round((x / voters.length) * 100)}%` : '0%');
  const nextLabel = flow.step < G2_STEPS.length - 1 ? 'NEXT' : 'GAME 3';

  if (step === 'tally') {
    return {
      key: 'g2:tally',
      nextLabel,
      say: 'Hands up if you signed it. Keep your hand up if you also saw the problem.',
      body: (
        <div className="fh-stats">
          <h1 className="fh-h1">What the class did</h1>
          <div className="fh-card fh-bars fh-bars--big">
            <div className="fh-bar-row"><span className="fh-bar-label">Signed</span><div className="fh-bar fh-bar--red"><div style={{ width: pct(signed) }} /></div><span className="fh-bar-num">{signed} · {pct(signed)}</span></div>
            <div className="fh-bar-row"><span className="fh-bar-label">Spotted the problem</span><div className="fh-bar fh-bar--green"><div style={{ width: pct(spotted) }} /></div><span className="fh-bar-num">{spotted} · {pct(spotted)}</span></div>
          </div>
          <p className="fh-small">{voters.length} voted</p>
        </div>
      ),
    };
  }

  if (step === 'note' || step === 'stats') {
    return {
      key: `g2:${step}`,
      nextLabel,
      say: step === 'note' ? 'Who saw it? What made the rest of us miss it?' : 'Where else do we sign things a confident system wrote, without reading?',
      body: (
        <div className="fh-g2-reveal">
          <G2Note marked />
          <div className="fh-g2-side">
            <h1 className="fh-h1">The AI gave aspirin to a patient who is allergic to aspirin.</h1>
            {step === 'stats' && (
              <>
                <p className="fh-big-stat"><b>{pct(signed)}</b> signed. Only <b>{pct(spotted)}</b> saw the problem.</p>
                <p className="fh-key">When a system looks confident, people stop checking. This is called <b>automation bias</b>.</p>
              </>
            )}
          </div>
        </div>
      ),
    };
  }

  const answers = players.filter((p) => p.asks[POLL_WHO.id]);
  const count = (id: string) => answers.filter((p) => p.asks[POLL_WHO.id] === id).length;
  return {
    key: 'g2:poll',
    nextLabel: 'GAME 3',
    say: 'Ask someone who picked D: who checks the software? Then: in Game 3 you will try this with a full chart.',
    body: (
      <div className="fh-stats">
        <h1 className="fh-h1">{POLL_WHO.question}</h1>
        <div className="fh-card fh-bars fh-bars--big fh-bars--poll">
          {POLL_WHO.options.map((o) => (
            <div key={o.id} className="fh-bar-row">
              <span className="fh-bar-label"><b>{o.id}</b> {o.label}</span>
              <div className="fh-bar"><div style={{ width: answers.length ? `${(count(o.id) / answers.length) * 100}%` : '0%' }} /></div>
              <span className="fh-bar-num">{count(o.id)}</span>
            </div>
          ))}
        </div>
        <p className="fh-small">{answers.length} of {players.length} voted</p>
      </div>
    ),
  };
}
