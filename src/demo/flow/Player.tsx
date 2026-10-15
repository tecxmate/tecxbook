// A student's phone during the lecturer-led flow. The projector is the stage:
// the phone is an answer pad and goes quiet ("Look up") whenever the lecturer
// is talking. Order: join → Game 1 (in letter groups) → answers → Game 2 (the
// note is on the projector only) → answers → Scribe Quest → class scores.
//
// Foolproof by design: one thing to press per screen, every answer locks after
// one tap, handing in asks first, and no screen is a dead end.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Eye, Lock, Smartphone, Trophy, WifiOff } from 'lucide-react';
import { Station } from '../Station';
import { phoneId } from '../identity';
import { postFlow, secondsLeft, useFlow, useServerNow, type FlowPlayer, type FlowSnapshot } from './api';
import { TEAMS } from '../scenarios';
import {
  G1_FOOTER,
  G1_HINTS,
  G1_NOTES,
  G1_STEPS,
  G2_LINES,
  G2_STEPS,
  MISTAKES,
  POLL_WHO,
  PREDICT,
  caughtType,
  getNote,
  isSpotted,
  markLine,
  scoreG1,
} from './content';
import { isG4, teamInfo, teamOfGroup } from '../game4';
import { G4Phone } from './Game4Player';
import './player.css';

const SAVE_KEY = 'dental-ai.demo-flow.v1';
const CLOSED = 'This game is closed to new players. Ask the lecturer.';

/** Sends an answer; true when the server took it. */
type Act = (body: Record<string, unknown>) => Promise<boolean>;

function loadName(room: string): string {
  try {
    return (JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') as Record<string, string>)[room] ?? '';
  } catch {
    return '';
  }
}

function saveName(room: string, nickname: string) {
  try {
    const all = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') as Record<string, string>;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...all, [room]: nickname }));
  } catch {
    // Private mode: the phone asks for the nickname again after a reload.
  }
}

/** A short buzz when something new to answer appears. */
function useBuzz(key: string | null) {
  useEffect(() => {
    if (!key) return;
    try {
      navigator.vibrate?.(40);
    } catch {
      // Not every phone can buzz.
    }
  }, [key]);
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function Player({ room: roomParam }: { room: string | null }) {
  const [me] = useState(phoneId);
  const [room, setRoom] = useState(roomParam);
  // Only a code typed on this phone can be wrong; a scanned QR is always right.
  const [typed, setTyped] = useState(false);
  const { snap, offset, ok, patch } = useFlow(room, me, { every: 1000 });
  const actSeq = useRef(0);

  const goRoom = (code: string | null) => {
    const u = new URL(window.location.href);
    if (code) u.searchParams.set('room', code);
    else u.searchParams.delete('room');
    window.history.replaceState(null, '', u);
    setTyped(!!code);
    setRoom(code);
  };

  if (!room) {
    return <Shell screen="code"><CodeEntry onCode={goRoom} /></Shell>;
  }

  if (!snap) {
    return (
      <Shell screen={ok ? 'connecting' : 'offline'}>
        {ok ? <LookUp title="Connecting…" /> : <NoConnection />}
      </Shell>
    );
  }

  if (!snap.me) {
    return (
      <Shell screen="join" offline={!ok}>
        <Join room={room} me={me} snap={snap} onJoined={patch} onChangeRoom={typed ? () => goRoom(null) : undefined} />
      </Shell>
    );
  }

  const p = snap.me;
  // Only the newest answer is applied: on fast taps an older reply can arrive last.
  const act: Act = (body) => {
    const n = ++actSeq.current;
    return postFlow(room, { id: me, ...body }).then((r) => { if (n === actSeq.current) patch(r); return true; }, () => false);
  };

  if (snap.flow.phase === 'g3') return <Station room={room} suggestedName={p.nickname} settings={snap.flow.settings} />;

  return <PhaseView snap={snap} p={p} offset={offset} ok={ok} act={act} />;
}

function PhaseView({ snap, p, offset, ok, act }: {
  snap: FlowSnapshot;
  p: FlowPlayer;
  offset: number;
  ok: boolean;
  act: Act;
}) {
  // Ticks 4 times a second; kept here so Scribe Quest is not re-rendered by it.
  const now = useServerNow(offset);
  const { flow } = snap;
  const elapsed = now - flow.phaseStartedAt;
  const showMs = flow.settings.g2ShowSec * 1000;
  const voteMs = flow.settings.g2VoteSec * 1000;
  const voteStart = flow.phaseStartedAt + showMs;
  const q1End = voteStart + voteMs;
  const q2End = (p.g2SignedAt ?? q1End) + voteMs;
  // Game answers name their run, so the server can drop one from before a restart.
  const play: Act = (body) => act({ ...body, round: flow.phaseStartedAt });
  const offline = !ok;
  const askOpen = (id: string) => flow.ask === id && !p.asks[id];

  // Buzz when a new question appears.
  let ping: string | null = null;
  if (flow.phase === 'g1_play' && p.g1SubmittedAt === null) ping = `g1:${flow.phaseStartedAt}`;
  if (flow.phase === 'g1_reveal' && askOpen(PREDICT.id)) ping = PREDICT.id;
  if (flow.phase === 'g2_play' && elapsed >= showMs && now < q1End && p.g2Signed === null) ping = `g2-vote:${flow.phaseStartedAt}`;
  if (flow.phase === 'g2_reveal' && askOpen(POLL_WHO.id)) ping = POLL_WHO.id;
  useBuzz(ping);

  if (flow.phase === 'lobby') {
    return (
      <Shell screen="lobby" cue="screen" offline={offline} hud={<Hud game="GAME 1" group={p.g1NoteId} name={p.nickname} />}>
        <Lobby p={p} counts={snap.counts.notes} act={act} />
      </Shell>
    );
  }

  if (flow.phase === 'g1_play') {
    const left = secondsLeft(flow.phaseStartedAt + flow.g1Ms, now);
    return (
      <Shell screen={`g1:${flow.phaseStartedAt}`} cue={p.g1SubmittedAt === null && left > 0 ? 'phone' : 'screen'} offline={offline} hud={<Hud game="GAME 1" group={p.g1NoteId} clock={left} lowAt={10} />}>
        <G1Play key={flow.phaseStartedAt} p={p} left={left} hints={flow.hints} done={snap.counts.g1Done} total={snap.counts.players} act={play} />
      </Shell>
    );
  }

  if (flow.phase === 'g1_reveal') {
    const step = G1_STEPS[flow.step] ?? 'leaders';
    return (
      <Shell screen={`g1r:${step}:${askOpen(PREDICT.id)}`} cue={askOpen(PREDICT.id) ? 'phone' : 'screen'} offline={offline} hud={<Hud game="GAME 1" group={p.g1NoteId} name={p.nickname} />}>
        <G1Reveal step={step} p={p} ask={flow.ask} act={act} total={snap.myScore} />
      </Shell>
    );
  }

  if (flow.phase === 'g2_ready') {
    return (
      <Shell screen="g2-ready" cue="screen" offline={offline} hud={<Hud game="GAME 2" name={p.nickname} />}>
        <LookUp title="Game 2: The 8-second test" line={`The note shows on the big screen only, for ${flow.settings.g2ShowSec} seconds.`} />
      </Shell>
    );
  }

  if (flow.phase === 'g2_play') {
    if (elapsed < showMs) {
      return (
        <Shell screen={`g2-look:${flow.phaseStartedAt}`} tone="alert" offline={offline} hud={<Hud game="GAME 2" name={p.nickname} />}>
          <div className="fl-alert" aria-live="assertive">
            <Eye className="fl-alert-eye" size={64} strokeWidth={2.5} aria-hidden="true" />
            <strong className="fl-alert-title">LOOK UP</strong>
            <span className="fl-alert-count">{Math.max(1, Math.ceil((showMs - elapsed) / 1000))}</span>
            <p>Read the note on the big screen.</p>
          </div>
        </Shell>
      );
    }
    let left: number | null = null;
    if (p.g2Signed === null) left = now < q1End ? secondsLeft(q1End, now) : null;
    else if (p.g2Spotted === null) left = secondsLeft(q2End, now);
    return (
      <Shell screen={`g2-vote:${flow.phaseStartedAt}`} cue={(p.g2Signed === null && now < q1End) || (p.g2Signed !== null && p.g2Spotted === null && now < q2End) ? 'phone' : 'screen'} offline={offline} hud={<Hud game="GAME 2" name={p.nickname} clock={left} lowAt={3} />}>
        <G2Vote key={flow.phaseStartedAt} p={p} now={now} q1End={q1End} q2End={q2End} act={play} />
      </Shell>
    );
  }

  if (flow.phase === 'g2_reveal') {
    const step = G2_STEPS[flow.step] ?? 'poll';
    return (
      <Shell screen={`g2r:${step}:${askOpen(POLL_WHO.id)}`} cue={askOpen(POLL_WHO.id) ? 'phone' : 'screen'} offline={offline} hud={<Hud game="GAME 2" name={p.nickname} />}>
        <G2Reveal step={step} p={p} ask={flow.ask} act={act} total={snap.myScore} />
      </Shell>
    );
  }

  if (isG4(flow.phase)) {
    // Game 4: building and fixing are self-paced. The phone keeps its own box
    // whatever the projector does; the clock is the projector's, for info.
    const g4 = flow.g4;
    const endsAt = flow.phase === 'g4_build' ? (g4?.buildAt ?? flow.phaseStartedAt) + flow.settings.g4BuildSec * 1000 + (g4?.buildExtraMs ?? 0)
      : flow.phase === 'g4_fix' ? (g4?.fixAt ?? flow.phaseStartedAt) + flow.settings.g4FixSec * 1000 + (g4?.fixExtraMs ?? 0)
        : null;
    const left = endsAt === null ? 0 : secondsLeft(endsAt, now);
    const working = flow.phase === 'g4_build' || flow.phase === 'g4_fix';
    return (
      <Shell screen="g4" cue={working ? 'phone' : 'screen'} offline={offline} hud={<Hud game="GAME 4" group={p.g1NoteId} label={teamInfo(teamOfGroup(p.g1NoteId)).name.toUpperCase()} clock={left > 0 ? left : null} lowAt={30} name={p.nickname} />}>
        <G4Phone snap={snap} p={p} act={act} />
      </Shell>
    );
  }

  if (flow.phase === 'final') {
    return (
      <Shell screen="final" cue="screen" offline={offline} hud={<Hud game="CLASS SCORES" name={p.nickname} />}>
        <Final s={snap.myScore} />
      </Shell>
    );
  }

  return <Shell screen="wait" cue="screen" offline={offline}><LookUp title="Look up" line="The lecturer will start the next game." /></Shell>;
}

// ── Frame ──

function Shell({ children, screen, hud, offline = false, tone, cue }: {
  children: ReactNode;
  /** Changing it replays the screen's fade-in. */
  screen: string;
  hud?: ReactNode;
  offline?: boolean;
  tone?: 'alert';
  /** Where to look now: this phone, or the big screen. */
  cue?: 'phone' | 'screen';
}) {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('fl-page');
    return () => html.classList.remove('fl-page');
  }, []);
  return (
    <div className={`fl${tone === 'alert' ? ' fl--alert' : ''}`}>
      {offline && <p className="fl-offline" role="status"><WifiOff size={16} aria-hidden="true" /> RECONNECTING…</p>}
      <div className="fl-wrap">
        {hud}
        {cue === 'phone' && <p className="fl-cue fl-cue--phone" role="status"><Smartphone size={18} aria-hidden="true" /> ANSWER ON YOUR PHONE</p>}
        {cue === 'screen' && <p className="fl-cue fl-cue--screen" role="status"><Eye size={18} aria-hidden="true" /> LOOK AT THE BIG SCREEN</p>}
        <div key={screen} className="fl-screen sq-enter">{children}</div>
      </div>
    </div>
  );
}

/** The top bar on every playing screen: game, group, then the clock or your name. */
function Hud({ game, group, label, clock: left = null, lowAt = 10, name }: {
  game: string;
  group?: string;
  /** Shown in the group chip instead of "GROUP A" (Game 4: "TEAM 1"). */
  label?: string;
  clock?: number | null;
  lowAt?: number;
  name?: string;
}) {
  return (
    <header className="fl-hud">
      <span className="fl-chip fl-chip--game">{game}</span>
      {group && <span className="fl-chip" data-note={group}>{label ?? `GROUP ${group}`}</span>}
      {left !== null ? (
        <span className={`fl-chip fl-clock${left <= lowAt ? ' low' : ''}`} role="timer">{clock(left)}</span>
      ) : name ? (
        <span className="fl-chip fl-chip--name">{name.toUpperCase()}</span>
      ) : null}
    </header>
  );
}

/** The quiet screen: one icon, one headline, at most one line. */
function LookUp({ title, line, icon, children }: { title: string; line?: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <section className="fl-look">
      <span className="fl-look-icon" aria-hidden="true">{icon ?? <Eye size={56} strokeWidth={2.5} />}</span>
      <h1 className="fl-h1">{title}</h1>
      {line && <p className="fl-lead">{line}</p>}
      {children}
    </section>
  );
}

function NoConnection() {
  return (
    <>
      <LookUp icon={<WifiOff size={52} strokeWidth={2.5} />} title="Can't reach the class" line="Check the Wi-Fi. We keep trying." />
      <div className="fl-actions">
        <button type="button" className="fl-btn fl-btn--go" onClick={() => window.location.reload()}>TRY AGAIN</button>
      </div>
    </>
  );
}

/** An in-page "are you sure?" panel. A double tap cannot confirm it by accident. */
function Confirm({ title, line, yes, busy, error, onYes, onNo }: {
  title: string;
  line: string;
  yes: string;
  busy: boolean;
  error?: string;
  onYes: () => void;
  onNo: () => void;
}) {
  // Taps in the first 400 ms are the second half of a double tap on SUBMIT.
  const openedAt = useRef(0);
  useEffect(() => { openedAt.current = Date.now(); }, []);
  return (
    <div className="fl-scrim" onClick={() => { if (!busy) onNo(); }}>
      <div className="fl-sheet sq-enter" role="alertdialog" aria-modal="true" aria-labelledby="fl-confirm-title" aria-describedby="fl-confirm-line" onClick={(e) => e.stopPropagation()}>
        <h2 id="fl-confirm-title">{title}</h2>
        <p id="fl-confirm-line">{line}</p>
        {error && <p className="fl-error" role="alert">{error}</p>}
        <div className="fl-sheet-row">
          <button type="button" className="fl-btn" disabled={busy} onClick={onNo}>CANCEL</button>
          <button type="button" className="fl-btn fl-btn--go" disabled={busy} onClick={() => { if (Date.now() - openedAt.current > 400) onYes(); }}>
            {busy ? 'SENDING…' : yes}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Joining ──

function Logo() {
  return <h1 className="fl-logo">SCRIBE <b>QUEST</b></h1>;
}

function CodeEntry({ onCode }: { onCode: (code: string) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const clean = code.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  return (
    <form className="fl-form" onSubmit={(e) => {
      e.preventDefault();
      if (clean) onCode(clean);
      else { setError('Type the room code first.'); input.current?.focus(); }
    }}>
      <Logo />
      <label className="fl-label" htmlFor="fl-code">ROOM CODE</label>
      <input ref={input} id="fl-code" className="fl-input fl-input--code" inputMode="numeric" autoComplete="off" maxLength={12} value={code}
        onChange={(e) => { setCode(e.target.value); setError(''); }} placeholder="4821" />
      <p className="fl-small">It is on the big screen.</p>
      {error && <p className="fl-error" role="alert">{error}</p>}
      <div className="fl-actions">
        <button className="fl-btn fl-btn--go" aria-disabled={!clean}>NEXT ▶</button>
      </div>
    </form>
  );
}

function Join({ room, me, snap, onJoined, onChangeRoom }: {
  room: string;
  me: string;
  snap: FlowSnapshot;
  onJoined: (r: { me?: FlowPlayer }) => void;
  onChangeRoom?: () => void;
}) {
  const [name, setName] = useState(() => loadName(room));
  const [pick, setPick] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const counts = snap.counts.notes;
  const late = snap.flow.phase !== 'lobby';

  if (snap.flow.settings?.joinOpen === false) {
    return <LookUp icon={<Lock size={52} strokeWidth={2.5} />} title="This game is closed" line={CLOSED} />;
  }

  const submit = async () => {
    const nickname = name.trim();
    if (!nickname) {
      setError('Type your name first.');
      input.current?.focus();
      return;
    }
    // Joining late, the group is where the player sits: they say it (a returning
    // player typing the same name keeps their old group anyway).
    if (late && !pick) {
      setError('Tap your group first: where you sit.');
      return;
    }
    if (busy) return;
    setBusy(true);
    setError('');
    saveName(room, nickname);
    try {
      // No pick in the lobby: the server puts the player in the smallest group.
      onJoined(await postFlow(room, { type: 'join', id: me, nickname, note: pick ?? '' }));
    } catch (e) {
      const { status, message } = e as Error & { status?: number };
      setError(status === 423 ? CLOSED : status === 409 || /full/i.test(message) ? 'This room is full. Ask the lecturer.' : 'Could not join. Check the Wi-Fi and try again.');
      setBusy(false);
    }
  };

  return (
    <form className="fl-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <Logo />
      <p className="fl-kicker">ROOM {room.toUpperCase()}</p>
      <label className="fl-label" htmlFor="fl-name">1 · YOUR NAME</label>
      <input ref={input} id="fl-name" className="fl-input" maxLength={16} autoComplete="off" autoCapitalize="words" enterKeyHint="go" value={name}
        onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="e.g. Mai" />
      {late && <p className="fl-small">Back with a new phone? Type the same name as before to get your team and score back.</p>}
      <>
        <span className="fl-label" id="fl-group-label">{late ? '2 · YOUR GROUP: WHERE YOU SIT' : '2 · YOUR GROUP (OPTIONAL)'}</span>
        <div className="fl-groups" role="radiogroup" aria-labelledby="fl-group-label">
          {G1_NOTES.map((n) => (
            <button type="button" key={n.id} role="radio" aria-checked={pick === n.id} className={pick === n.id ? 'on' : ''} data-note={n.id} onClick={() => setPick(pick === n.id ? null : n.id)}>
              {n.id}<small>{counts[n.id] ?? 0} in</small>
            </button>
          ))}
        </div>
        <p className="fl-small">{pick ? `You sit with Group ${pick}.` : late ? 'A on the left, B in the middle, C on the right.' : 'No pick? We put you in a group.'}</p>
      </>
      {error && <p className="fl-error" role="alert">{error}</p>}
      <div className="fl-actions">
        <button className="fl-btn fl-btn--go" aria-disabled={!name.trim() || busy}>{busy ? 'JOINING…' : 'JOIN'}</button>
        {onChangeRoom && <button type="button" className="fl-btn fl-btn--ghost fl-btn--small" onClick={onChangeRoom}>WRONG ROOM? CHANGE CODE</button>}
      </div>
    </form>
  );
}

function Lobby({ p, counts, act }: { p: FlowPlayer; counts: Record<string, number>; act: Act }) {
  const note = getNote(p.g1NoteId);
  // The server keeps the group once Game 1 was played; so does the screen.
  const played = p.g1Version > 0 || p.g1SubmittedAt !== null;
  const [busy, setBusy] = useState(false);
  const move = async (id: string) => {
    if (busy || id === note.id) return;
    setBusy(true);
    await act({ type: 'join', nickname: p.nickname, note: id });
    setBusy(false);
  };
  return (
    <LookUp title={`You're in, ${p.nickname}!`} line="Sit with your group. Game 1 starts soon.">
      <div className="fl-group-now" data-note={note.id}>GROUP {note.id}</div>
      {!played && (
        <div className="fl-change">
          <span className="fl-label" id="fl-change-label">CHANGE GROUP</span>
          <div className="fl-groups" role="radiogroup" aria-labelledby="fl-change-label">
            {G1_NOTES.map((n) => (
              <button key={n.id} role="radio" aria-checked={n.id === note.id} className={n.id === note.id ? 'on' : ''} data-note={n.id} disabled={busy}
                onClick={() => void move(n.id)}>
                {n.id}<small>{counts[n.id] ?? 0} in</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </LookUp>
  );
}

// ── Game 1: Spot the error ──

function G1Play({ p, left, hints, done, total, act }: {
  p: FlowPlayer;
  left: number;
  hints: number;
  done: number;
  total: number;
  act: Act;
}) {
  const note = getNote(p.g1NoteId);
  const [sel, setSel] = useState<string[]>(p.g1Selected);
  const version = useRef(p.g1Version);
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const locked = p.g1SubmittedAt !== null || left === 0;

  const send = (selected: string[], submit: boolean) => {
    version.current += 1;
    return act({ type: 'g1', selected, submit, version: version.current });
  };

  // Out of time: whatever is circled is handed in.
  const sentAtZero = useRef(false);
  useEffect(() => {
    if (left > 0) sentAtZero.current = false;
    if (left === 0 && p.g1SubmittedAt === null && !sentAtZero.current) {
      sentAtZero.current = true;
      void send(sel, true);
    }
    // send and sel are read at the moment time runs out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, p.g1SubmittedAt]);

  const toggle = (id: string) => {
    if (locked || sending) return;
    const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
    setSel(next);
    void send(next, false);
  };

  const handIn = async () => {
    if (sending) return;
    setSending(true);
    setError('');
    const ok = await send(sel, true);
    setSending(false);
    if (ok) setAsking(false);
    else setError('Not sent. Check the Wi-Fi and try again.');
  };

  if (locked) {
    const n = p.g1Selected.length;
    return (
      <div key="locked" className="fl-fill sq-enter">
        <LookUp title={left === 0 ? "Time's up!" : 'Locked in!'} line={`${done} of ${total} players done. Look up.`}>
          <span className="fl-pill">{plural(n, 'LINE').toUpperCase()} HANDED IN</span>
        </LookUp>
      </div>
    );
  }

  return (
    <section key="play" className="fl-fill fl-g1 sq-enter">
      <div className="fl-head">
        <h1 className="fl-h1">Find the 3 mistakes</h1>
        <p className="fl-lead">Tap each wrong line.</p>
      </div>
      {hints > 0 && (
        <div className="fl-hints" role="status">
          {G1_HINTS.slice(0, hints).map((h, i) => <p key={h}><b>HINT {i + 1}</b>{h}</p>)}
        </div>
      )}
      <div className="fl-card fl-note">
        <div className="fl-note-head">AI DRAFT NOTE · {note.topic.toUpperCase()}</div>
        <ul className="fl-lines">
          {note.lines.map((l) => {
            const on = sel.includes(l.id);
            return (
              <li key={l.id}>
                <button type="button" className={`fl-line${on ? ' circled' : ''}`} aria-pressed={on} onClick={() => toggle(l.id)}>
                  <span className="fl-box" aria-hidden="true">{on ? '✓' : ''}</span>
                  <span>{l.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="fl-note-foot">{G1_FOOTER}</p>
      </div>
      <div className="fl-actions">
        <button type="button" className="fl-btn fl-btn--go" disabled={sending} onClick={() => { setError(''); setAsking(true); }}>
          SUBMIT {sel.length} LINE{sel.length === 1 ? '' : 'S'}
        </button>
      </div>
      {asking && (
        <Confirm
          title={sel.length ? `Hand in ${plural(sel.length, 'line')}?` : 'Nothing circled yet'}
          line={sel.length ? "You can't change them after." : "Hand in anyway? You can't change it after."}
          yes="HAND IN"
          busy={sending}
          error={error}
          onYes={() => void handIn()}
          onNo={() => setAsking(false)}
        />
      )}
    </section>
  );
}

function G1Reveal({ step, p, ask, act, total }: {
  step: (typeof G1_STEPS)[number];
  p: FlowPlayer;
  ask: string | null;
  act: Act;
  total: FlowSnapshot['myScore'];
}) {
  const [open, setOpen] = useState(false);
  const s = scoreG1(p.g1Note ?? p.g1NoteId, p.g1Selected);

  if (step === 'predict' && ask === PREDICT.id && !p.asks[PREDICT.id]) {
    return <Choice kicker="QUICK GUESS" question={PREDICT.question} options={PREDICT.options} onPick={(id) => act({ type: 'ask', ask: PREDICT.id, answer: id })} />;
  }

  let title = 'Look up';
  let line = 'The answers are on the big screen.';
  if (step === 'predict') line = p.asks[PREDICT.id] ? "Thanks! Let's see who was right." : 'Guess with your group first.';
  if (step === 'stats') {
    title = `You found ${s.caught} of 3`;
    line = s.perfect ? 'Perfect! 300 points.' : s.falseAlarms ? `${plural(s.falseAlarms, 'false alarm')}. ${s.score * 100} points.` : `${s.score * 100} points.`;
  }
  if (step === 'card1' || step === 'card2' || step === 'card3') {
    const m = MISTAKES[Number(step.slice(-1)) - 1];
    title = caughtType(p.g1Note ?? p.g1NoteId, p.g1Selected, m.type) ? '✓ You caught this one' : '✗ You missed this one';
    line = m.title;
  }
  if (step === 'quote') line = 'This happened in the real case too.';
  if (step === 'leaders') { title = `Game 1: ${s.score * 100} points`; line = 'Are you on the board?'; }

  return (
    <LookUp title={title} line={line}>
      {step === 'leaders' && <RunningTotal s={total} />}
      <button type="button" className="fl-btn fl-btn--ghost fl-btn--small fl-link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'Hide my note' : 'See my note'}
      </button>
      {open && <MarkedNote noteId={p.g1Note ?? p.g1NoteId} selected={p.g1Selected} />}
    </LookUp>
  );
}

function MarkedNote({ noteId, selected }: { noteId: string; selected: string[] }) {
  const note = getNote(noteId);
  const icon = { caught: '✓', missed: '!', false: '✗', plain: '' };
  return (
    <div className="fl-card fl-note fl-note--marked sq-enter">
      <div className="fl-note-head">AI DRAFT NOTE · {note.topic.toUpperCase()}</div>
      <ul className="fl-lines">
        {note.lines.map((l) => {
          const m = markLine(l, selected);
          return <li key={l.id} className={`fl-mark fl-mark--${m}`}><span aria-hidden="true">{icon[m]}</span>{l.text}</li>;
        })}
      </ul>
      <p className="fl-legend">
        <span className="fl-mark--caught">✓ caught</span>
        <span className="fl-mark--missed">! missed</span>
        <span className="fl-mark--false">✗ false alarm</span>
      </p>
    </div>
  );
}

// ── Game 2: The 8-second test ──

function G2Vote({ p, now, q1End, q2End, act }: {
  p: FlowPlayer;
  now: number;
  q1End: number;
  q2End: number;
  act: Act;
}) {
  const sent = useRef({ sign: false, spot: false });
  // What this phone tapped, shown at once and locked: one vote per question.
  const [signed, setSigned] = useState<boolean | null>(null);
  const [spot, setSpot] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Only a phone that saw the question can be counted as a rubber stamp; one
  // that joins or wakes up after the vote closed just missed it.
  const [sawQuestion] = useState(() => now < q1End);

  // A vote nobody made counts as "Sign": the rubber stamp.
  useEffect(() => {
    if (p.g2Signed === null && now >= q1End && sawQuestion && !sent.current.sign) {
      sent.current.sign = true;
      void act({ type: 'g2sign', signed: true, auto: true });
    }
    if (p.g2Signed !== null && p.g2Spotted === null && now >= q2End && !sent.current.spot) {
      sent.current.spot = true;
      void act({ type: 'g2spot', line: 'none' });
    }
  }, [now, p.g2Signed, p.g2Spotted, q1End, q2End, act, sawQuestion]);

  const vote = async (value: boolean) => {
    if (sent.current.sign) return;
    sent.current.sign = true;
    setSigned(value);
    setError('');
    if (!(await act({ type: 'g2sign', signed: value }))) {
      sent.current.sign = false;
      setSigned(null);
      setError('Not sent. Tap again.');
    }
  };

  const tapLine = async (line: string) => {
    if (sent.current.spot) return;
    sent.current.spot = true;
    setSpot(line);
    setError('');
    if (!(await act({ type: 'g2spot', line }))) {
      sent.current.spot = false;
      setSpot(null);
      setError('Not sent. Tap again.');
    }
  };

  if (p.g2Signed === null && !sawQuestion) {
    return <LookUp title="Voting has closed" line="You missed this vote. Look up for the results." />;
  }

  if (p.g2Signed === null) {
    const choice = (value: boolean, label: string, mark: string) => (
      <button type="button" className={`fl-btn fl-btn--vote${signed === value ? ' on' : ''}`} disabled={signed !== null} onClick={() => void vote(value)}>
        <span className="fl-vote-mark" aria-hidden="true">{mark}</span>{label}
      </button>
    );
    return (
      <section key="q1" className="fl-fill fl-vote sq-enter">
        <div className="fl-head">
          <p className="fl-kicker">QUESTION 1 OF 2</p>
          <h1 className="fl-h1">Would you sign this note?</h1>
        </div>
        <div className="fl-vote-big">
          {choice(true, 'Sign', '✓')}
          {choice(false, 'Do not sign', '✗')}
        </div>
        {error && <p className="fl-error" role="alert">{error}</p>}
      </section>
    );
  }

  if (p.g2Spotted === null) {
    return (
      <section key="q2" className="fl-fill fl-vote sq-enter">
        <div className="fl-head">
          <p className="fl-kicker">QUESTION 2 OF 2</p>
          <h1 className="fl-h1">Did you see a problem?</h1>
          <p className="fl-lead">Tap the line.</p>
        </div>
        <div className="fl-vote-lines">
          {G2_LINES.map((l) => (
            <button type="button" key={l.id} className={`fl-btn fl-btn--line${spot === l.id ? ' on' : ''}`} disabled={spot !== null} onClick={() => void tapLine(l.id)}>{l.label}</button>
          ))}
          <button type="button" className={`fl-btn fl-btn--line fl-btn--none${spot === 'none' ? ' on' : ''}`} disabled={spot !== null} onClick={() => void tapLine('none')}>I did not see a problem</button>
        </div>
        {error && <p className="fl-error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <div key="thanks" className="fl-fill sq-enter">
      <LookUp title="Thanks!" line="Look up for the results." />
    </div>
  );
}

function G2Reveal({ step, p, ask, act, total }: {
  step: (typeof G2_STEPS)[number];
  p: FlowPlayer;
  ask: string | null;
  act: Act;
  total: FlowSnapshot['myScore'];
}) {
  if (step === 'poll' && ask === POLL_WHO.id && !p.asks[POLL_WHO.id]) {
    return <Choice kicker="QUICK QUESTION" question={POLL_WHO.question} options={POLL_WHO.options} letters onPick={(id) => act({ type: 'ask', ask: POLL_WHO.id, answer: id })} />;
  }
  const signed = p.g2Signed === null ? 'You did not vote.' : p.g2Signed ? (p.g2Auto ? 'Time ran out, so it counted as signed.' : 'You signed it.') : 'You did not sign it.';
  const tapped = G2_LINES.find((l) => l.id === p.g2Spotted);
  const spot = isSpotted(p.g2Spotted) ? `You tapped ${tapped?.label}. Good catch!` : tapped ? `You tapped ${tapped.label}. The problem was in the Allergy and Medicine lines.` : 'The problem was in the Allergy and Medicine lines.';
  if (step === 'tally') return <LookUp title="Look up" line="Hands up if you signed it." />;
  if (step === 'poll') {
    const picked = POLL_WHO.options.find((o) => o.id === p.asks[POLL_WHO.id]);
    return <LookUp title="Thanks for voting" line={picked ? `You picked: ${picked.label.split(':')[0]}.` : 'Look up to see how the class voted.'} />;
  }
  return (
    <LookUp title={step === 'note' ? 'Aspirin, for a patient allergic to aspirin' : 'Look up'} line={`${signed} ${spot}`}>
      {step === 'stats' && <RunningTotal s={total} />}
    </LookUp>
  );
}

// ── Scores ──

function RunningTotal({ s }: { s: FlowSnapshot['myScore'] }) {
  if (!s) return null;
  return (
    <div className="fl-total">
      <span>SCORE SO FAR</span>
      <b>{s.total}</b>
      <small>#{s.rank} of {s.of}</small>
    </div>
  );
}

function Final({ s }: { s: FlowSnapshot['myScore'] }) {
  if (!s) return <LookUp title="Look up" line="The class scores are on the big screen." />;
  const team = TEAMS.find((t) => t.id === s.team);
  return (
    <LookUp icon={<Trophy size={56} strokeWidth={2.5} />} title={`#${s.rank} of ${s.of}`} line={team ? `${team.name} · ${team.label}` : 'Look up for the class scores.'}>
      <div className="fl-total fl-total--big"><span>YOUR TOTAL</span><b>{s.total}</b></div>
      <div className="fl-card fl-scores-card">
        <table className="fl-scores">
          <tbody>
            <tr><th scope="row">GAME 1 · Spot the error</th><td>{s.g1}</td></tr>
            <tr><th scope="row">GAME 2 · The 8-second test</th><td>{s.g2}</td></tr>
            <tr><th scope="row">GAME 3 · The clinic</th><td>{s.g3}</td></tr>
          </tbody>
        </table>
      </div>
    </LookUp>
  );
}

/** A one-tap question. The first tap locks it, so nobody votes twice. */
function Choice({ kicker, question, options, letters = false, onPick }: {
  kicker: string;
  question: string;
  options: Array<{ id: string; label: string }>;
  letters?: boolean;
  onPick: (id: string) => Promise<boolean>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState('');
  const pick = async (id: string) => {
    if (picked) return;
    setPicked(id);
    setError('');
    if (!(await onPick(id))) {
      setPicked(null);
      setError('Not sent. Tap again.');
    }
  };
  return (
    <section className="fl-fill fl-vote">
      <div className="fl-head">
        <p className="fl-kicker">{kicker}</p>
        <h1 className="fl-h1">{question}</h1>
      </div>
      <div className="fl-opts">
        {options.map((o) => (
          <button type="button" key={o.id} className={`fl-btn fl-opt${picked === o.id ? ' on' : ''}`} disabled={picked !== null} onClick={() => void pick(o.id)}>
            {letters && <span className="fl-opt-letter" aria-hidden="true">{o.id}</span>}
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      {error && <p className="fl-error" role="alert">{error}</p>}
    </section>
  );
}
