// Game 4 · Build StyleMod's AI, on a student's phone. Building and fixing are
// self-paced: the phone moves between boxes on its own (Back, Next, or a tap
// on a box number), and nothing the projector does moves it. Picks are kept
// through every step; the projector only decides what is being shown.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Eye, MessageCircle, Users, Zap } from 'lucide-react';
import type { FlowPlayer, FlowSnapshot } from './api';
import {
  BEFORE,
  BOXES,
  ALL_SYSTEMS,
  beatsPercent,
  G4_RERUN_STEPS,
  BOX_IDS,
  CHAOS,
  G4_CHAOS_STEPS,
  G4_CLOSING,
  G4_RUN_STEPS,
  boxLabel,
  debateBox,
  getBox,
  getCard,
  signedPct,
  teamInfo,
  teamOfGroup,
  teamRuns,
  winners,
  type G4Public,
  type RunResult,
} from '../game4';
import './game4.css';

type Act = (body: Record<string, unknown>) => Promise<boolean>;

const NOT_SENT = 'Not sent. Check the Wi-Fi and tap again.';

/** Which box this phone is on: its own, kept through reloads and every projector step. */
function useSticky<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private window */ }
  };
  return [value, set];
}

/** The phone during Game 4, in its team's colour. */
export function G4Phone(props: { snap: FlowSnapshot; p: FlowPlayer; act: Act }) {
  return (
    <div className="fl-fill" data-note={props.p.g1NoteId}>
      <G4Body {...props} />
    </div>
  );
}

function G4Body({ snap, p, act }: { snap: FlowSnapshot; p: FlowPlayer; act: Act }) {
  const { flow } = snap;
  const team = teamOfGroup(p.g1NoteId);
  const info = teamInfo(team);
  const g4: G4Public | undefined = snap.g4;
  const mine = g4?.teams.find((t) => t.team === team);
  const [boxIdx, setBoxIdx] = useSticky(`dental-ai.g4.box.${p.id}.${p.joinedAt}`, 0);
  const [fixView, setFixView] = useSticky<string | null>(`dental-ai.g4.fix.${p.id}.${p.joinedAt}`, null);

  if (flow.phase === 'g4_intro' || !g4 || !mine) {
    return (
      <Look icon={<Users size={52} strokeWidth={2.5} />} title={`${info.name} · ${info.side}`} line="Your team builds the system on your phones. Starts in a moment.">
        <div className="fl-group-now" data-note={p.g1NoteId}>{info.name.toUpperCase()}</div>
        <p className="fl-small">Group {p.g1NoteId} plays as {info.name}. Sit together on the {info.side.toLowerCase()}.</p>
      </Look>
    );
  }

  if (flow.phase === 'g4_build') {
    return <Builder key="build" p={p} g4={g4} members={mine.members} idx={boxIdx} setIdx={setBoxIdx} act={act} />;
  }

  const runs = teamRuns(mine);

  if (flow.phase === 'g4_run') {
    if (G4_RUN_STEPS[flow.step] === 'systems') {
      return (
        <section key="systems" className="fl-fill g4p sq-enter">
          <div className="fl-head">
            <p className="fl-kicker">YOUR TEAM'S SYSTEM · {info.name.toUpperCase()}</p>
            <h1 className="fl-h1">Explain your system</h1>
          </div>
          <ol className="g4p-system">
            {BOXES.map((b) => (
              <li key={b.id}>
                <span>{b.id} · {b.name}</span>
                <p>{getCard(b.id, mine.system[b.id])?.text ?? 'Not decided'}</p>
              </li>
            ))}
          </ol>
        </section>
      );
    }
    const d = G4_RUN_STEPS[flow.step] === 'debate' ? debateBox(g4.teams) : null;
    if (d) {
      const role = team === d.convince ? 'Your team speaks first: convince them.' : team === d.listen ? 'Your team answers after 30 seconds.' : 'Listen to both teams. Who convinces you?';
      return <Look icon={<MessageCircle size={52} strokeWidth={2.5} />} title={`Debate: ${boxLabel(d.box)}`} line={`Team ${d.convince} has 30 seconds to convince Team ${d.listen}. ${role}`} />;
    }
    return (
      <section key="run" className="fl-fill g4p sq-enter">
        <div className="fl-head">
          <p className="fl-kicker">SIX MONTHS LATER · {info.name.toUpperCase()}</p>
          <h1 className="fl-h1">How your system did</h1>
        </div>
        <Meters before={BEFORE} after={runs.run} />
        <Stories run={runs.run} />
      </section>
    );
  }

  if (flow.phase === 'g4_chaos') {
    if ((G4_CHAOS_STEPS[flow.step] ?? 'hit') === 'cards') {
      return <Look icon={<Zap size={52} strokeWidth={2.5} />} title="Chaos cards!" line="Two things go wrong at StyleMod. Look up: will your system survive?" />;
    }
    const broke = runs.chaos.chaos.filter((h) => h.broke);
    return (
      <section key="chaos" className="fl-fill g4p sq-enter">
        <div className="fl-head">
          <p className="fl-kicker">CHAOS · {info.name.toUpperCase()}</p>
          <h1 className="fl-h1">{broke.length ? `Your system broke at ${broke.map((h) => `Box ${h.broke}`).join(' and ')}` : 'Your system survived both cards'}</h1>
        </div>
        <Hits run={runs.chaos} />
        <Meters before={runs.run} after={runs.chaos} />
      </section>
    );
  }

  if (flow.phase === 'g4_fix') {
    return <Fixer key="fix" p={p} g4={g4} members={mine.members} view={fixView} setView={setFixView} act={act} />;
  }

  // g4_rerun
  const won = winners(g4.teams);
  const win = won.includes(team);
  return (
    <section key="rerun" className="fl-fill g4p sq-enter">
      <div className="fl-head">
        <p className="fl-kicker">VERSION 2 · {info.name.toUpperCase()}</p>
        <h1 className="fl-h1">{win ? (won.length > 1 ? 'A shared win!' : 'Your team wins!') : 'Your system, version 2'}</h1>
        <p className="fl-lead">{mine.fixBox && mine.fixCard ? `You fixed ${boxLabel(mine.fixBox)}.` : 'Your team did not fix a box.'} Both chaos cards hit again: {(() => {
          const broke = runs.rerun.chaos.filter((h) => h.broke).map((h) => boxLabel(h.broke!));
          return broke.length ? `it now breaks at ${broke.join(' and ')}.` : 'it survives both.';
        })()}</p>
      </div>
      <Meters before={runs.chaos} after={runs.rerun} labels={['Version 1', 'Version 2']} />
      <div className="g4p-score">
        <span>SCORE</span>
        <b>{runs.chaos.score} → {runs.rerun.score}</b>
      </div>
      <p className="g4p-say">{G4_RERUN_STEPS[flow.step] === 'close' ? G4_CLOSING : G4_RERUN_STEPS[flow.step] === 'how' ? `Look up: how the simulation scored you. Your system is better than ${beatsPercent(runs.rerun.score)}% of all ${ALL_SYSTEMS.toLocaleString('en-US')} possible systems.` : 'Explain your fix out loud: which box, which card, and why?'}</p>
    </section>
  );
}

// ── Sending choices ──

/**
 * The phone shows a choice the moment it is tapped; the server only needs the
 * latest one. One send at a time, and while it is out, newer taps on the
 * same key replace each other, so fast taps never pile up or arrive out of
 * order. `onFail` gets the key whose latest choice could not be sent.
 */
function useLatestSend(act: Act, onFail: (key: string) => void) {
  const actRef = useRef(act);
  const failRef = useRef(onFail);
  useEffect(() => {
    actRef.current = act;
    failRef.current = onFail;
  });
  const queue = useRef(new Map<string, Record<string, unknown>>());
  const running = useRef(false);
  const flush = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.size) {
      const [key, body] = queue.current.entries().next().value as [string, Record<string, unknown>];
      queue.current.delete(key);
      const ok = await actRef.current(body);
      if (!ok && !queue.current.has(key)) failRef.current(key);
    }
    running.current = false;
  }, []);
  return useCallback((key: string, body: Record<string, unknown>) => {
    queue.current.set(key, body);
    void flush();
  }, [flush]);
}

// ── Building ──

function Builder({ p, g4, members, idx, setIdx, act }: {
  p: FlowPlayer;
  g4: G4Public;
  members: number;
  idx: number;
  setIdx: (i: number) => void;
  act: Act;
}) {
  // Taps shown at once; the server gets the latest per box.
  const [local, setLocal] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const send = useLatestSend(act, (box) => {
    setLocal((l) => {
      const next = { ...l };
      delete next[box];
      return next;
    });
    setError(NOT_SENT);
  });
  const at = Math.max(0, Math.min(BOXES.length, Number.isFinite(idx) ? idx : 0));
  const go = (i: number) => {
    setError('');
    setIdx(i);
    window.scrollTo({ top: 0 });
  };
  const system = g4.teams.find((t) => t.team === teamOfGroup(p.g1NoteId))?.system ?? {};
  const decided = BOX_IDS.filter((id) => system[id]).length;

  const pick = (box: string, card: string) => {
    setLocal((l) => ({ ...l, [box]: card }));
    setError('');
    send(box, { type: 'g4pick', box, card });
  };

  if (at === BOXES.length) {
    return (
      <section key="summary" className="fl-fill g4p sq-enter">
        <div className="fl-head">
          <p className="fl-kicker">YOUR TEAM'S SYSTEM</p>
          <h1 className="fl-h1">{decided} of 7 boxes decided</h1>
          <p className="fl-lead">Tap a box to see it or change your pick.</p>
        </div>
        <ul className="g4p-list">
          {BOXES.map((b, i) => {
            const card = getCard(b.id, system[b.id]);
            return (
              <li key={b.id}>
                <button type="button" className={`g4p-row${card ? '' : ' open'}`} onClick={() => go(i)}>
                  <span className="g4p-row-num">{b.id}</span>
                  <span className="g4p-row-text"><b>{b.name}</b>{card ? card.text : 'Not decided yet'}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="fl-actions">
          <button type="button" className="fl-btn" onClick={() => go(BOXES.length - 1)}>◀ BACK TO BOX 7</button>
        </div>
      </section>
    );
  }

  const box = BOXES[at];
  const myCard = local[box.id] ?? p.g4?.picks?.[box.id]?.card;
  const counts = g4.mine?.counts[box.id] ?? {};
  return (
    <section key={`box${box.id}`} className="fl-fill g4p sq-enter">
      <div className="fl-head">
        <p className="fl-kicker">BOX {box.id} OF 7 · {box.name.toUpperCase()}</p>
        <h1 className="g4p-q">{box.question}</h1>
      </div>
      <TeamLine counts={counts} members={members} mine={myCard ?? null} />
      <div className="g4p-cards" role="radiogroup" aria-label={box.name}>
        {box.cards.map((c) => (
          <CardButton
            key={c.id}
            text={c.text}
            on={myCard === c.id}
            busy={false}
            onPick={() => pick(box.id, c.id)}
          />
        ))}
      </div>
      {error && <p className="fl-error" role="alert">{error}</p>}
      <div className="fl-actions g4p-actions">
        <button type="button" className="fl-btn" disabled={at === 0} onClick={() => go(at - 1)}>◀ BACK</button>
        <button type="button" className={`fl-btn${myCard ? ' fl-btn--go' : ''}`} onClick={() => go(at + 1)}>
          {at === BOXES.length - 1 ? 'ALL BOXES ▶' : 'NEXT ▶'}
        </button>
      </div>
    </section>
  );
}

function CardButton({ text, on, busy, disabled = false, note, onPick }: {
  text: string;
  on: boolean;
  busy: boolean;
  disabled?: boolean;
  /** The fix step's "Your team's card now". */
  note?: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      className={`g4p-card${on ? ' on' : ''}${disabled ? ' locked' : ''}`}
      disabled={disabled || busy}
      onClick={onPick}
    >
      <span className="g4p-card-text">{text}</span>
      {note && <span className="g4p-card-count">{note}</span>}
    </button>
  );
}

/**
 * The one line above the cards: talk first, then how the team stands.
 * "Your team is split: 2 picked your card, 1 picked another. Talk it over."
 */
function TeamLine({ counts, members, mine, fixing = false }: { counts: Record<string, number>; members: number; mine: string | null; fixing?: boolean }) {
  const picks = Object.entries(counts).filter(([, n]) => n > 0);
  const total = picks.reduce((a, [, n]) => a + n, 0);
  let text = fixing ? 'Talk with your team first, then tap the new card.' : 'Talk with your team first, then tap.';
  let tone = 'talk';
  if (picks.length === 1 && total >= members) {
    text = 'Your team agrees.';
    tone = 'agree';
  } else if (picks.length === 1) {
    text = `${total} of ${members} picked so far, all the same card. Talk with the others, then tap.`;
  } else if (picks.length > 1) {
    const ordered = [...picks].sort((a, b) => (a[0] === mine ? -1 : b[0] === mine ? 1 : b[1] - a[1]));
    const words = mine && counts[mine] ? ['your card', 'another', 'a third'] : ['one card', 'another', 'a third'];
    text = `Your team is split: ${ordered.map(([, n], i) => `${n} picked ${words[i]}`).join(', ')}. Talk it over.`;
    tone = 'split';
  }
  return <p className={`g4p-line g4p-line--${tone}`} role="status">{text}</p>;
}

// ── Fixing one box ──

function Fixer({ p, g4, members, view, setView, act }: {
  p: FlowPlayer;
  g4: G4Public;
  members: number;
  view: string | null;
  setView: (v: string | null) => void;
  act: Act;
}) {
  const [error, setError] = useState('');
  const team = g4.teams.find((t) => t.team === teamOfGroup(p.g1NoteId))!;
  const broke = teamRuns(team).chaos.chaos.filter((h) => h.broke).map((h) => h.broke!);
  // This phone's fix as tapped, shown at once; the server gets the latest.
  const [localFix, setLocalFix] = useState<{ box: string; card: string | null } | null>(null);
  const myFix = localFix ?? p.g4?.fix ?? null;
  const queue = useLatestSend(act, () => {
    setLocalFix(null);
    setError(NOT_SENT);
  });
  const send = (body: { box: string; card?: string }) => {
    setLocalFix({ box: body.box, card: body.card ?? null });
    setError('');
    queue('fix', { type: 'g4fix', ...body });
  };
  // Opening a box proposes it; the phone shows it at once.
  const open = (box: string) => {
    setView(box);
    window.scrollTo({ top: 0 });
    if (myFix?.box !== box) send({ box });
  };
  const box = getBox(view);

  // If the room has been reset, the remembered box no longer means anything.
  useEffect(() => {
    if (view && !getBox(view)) setView(null);
  }, [view, setView]);

  const status = team.fixBox ? (
    <p className={`g4p-status${team.fixCard ? ' done' : ''}`}>
      {team.fixCard ? '✓ ' : ''}Your team {team.fixCard ? 'fixed' : 'is fixing'} <b>{boxLabel(team.fixBox)}</b>{team.fixCard ? '.' : ` (${g4.mine?.fixBoxCounts[team.fixBox] ?? 0} of ${members} chose it).`}
    </p>
  ) : (
    <p className="g4p-status">Your team has not chosen a box yet.</p>
  );

  if (!box) {
    const order = [...broke, ...BOX_IDS.filter((id) => !broke.includes(id))];
    return (
      <section key="list" className="fl-fill g4p sq-enter">
        <div className="fl-head">
          <p className="fl-kicker">FIX ONE BOX</p>
          <h1 className="fl-h1">{broke.length ? `Your system broke at ${broke.map((b) => `Box ${b}`).join(' and ')}.` : 'Your system survived both chaos cards.'}</h1>
          <p className="fl-lead">{broke.length ? 'Fix that box, or pick any other box. Your team changes only one.' : 'Your team may still improve one box.'}</p>
        </div>
        {status}
        <ul className="g4p-list">
          {order.map((id) => {
            const b = getBox(id)!;
            const n = g4.mine?.fixBoxCounts[id] ?? 0;
            const card = getCard(id, team.system[id]);
            return (
              <li key={id}>
                <button type="button" className={`g4p-row${broke.includes(id) ? ' broke' : ''}${myFix?.box === id ? ' mine' : ''}`} onClick={() => open(id)}>
                  <span className="g4p-row-num">{id}</span>
                  <span className="g4p-row-text">
                    <b>{b.name}{broke.includes(id) ? ' · BROKE' : ''}</b>
                    {card ? card.text : 'Not decided'}
                    {n > 0 && <em>{n} of {members} want to fix this box</em>}
                  </span>
                  <span className="g4p-row-go">Change ›</span>
                </button>
              </li>
            );
          })}
        </ul>
        {error && <p className="fl-error" role="alert">{error}</p>}
      </section>
    );
  }

  const counts = team.fixBox === box.id ? g4.mine?.fixCardCounts ?? {} : {};
  const myCard = myFix?.box === box.id ? myFix.card : null;
  return (
    <section key={`fix${box.id}`} className="fl-fill g4p sq-enter">
      <div className="fl-head">
        <p className="fl-kicker">FIX · BOX {box.id} · {box.name.toUpperCase()}{broke.includes(box.id) ? ' · BROKE' : ''}</p>
        <h1 className="g4p-q">{box.question}</h1>
      </div>
      {team.fixBox === box.id && Object.keys(counts).length > 1 ? <TeamLine counts={counts} members={members} mine={myCard} fixing /> : status}
      <div className="g4p-replace">
        <p className="g4p-replace-label">Current card</p>
        <div className={`g4p-current${myCard ? ' replaced' : ''}`}>
          <span className="g4p-current-tag">NOW</span>
          <p>{getCard(box.id, team.system[box.id])?.text ?? 'Not decided yet'}</p>
        </div>
        <p className="g4p-replace-label g4p-replace-with">↓ Replace with one of these</p>
        <div className="g4p-options" role="radiogroup" aria-label={`New card for ${box.name}`}>
          {box.cards.filter((c) => c.id !== team.system[box.id]).map((c) => {
            const n = counts[c.id] ?? 0;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={myCard === c.id}
                className={`g4p-option${myCard === c.id ? ' on' : ''}`}
                onClick={() => send({ box: box.id, card: c.id })}
              >
                <span className="g4p-radio" aria-hidden="true" />
                <span className="g4p-option-text">
                  {c.text}
                  {n > 0 && <em>{n} of {members} picked this</em>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="fl-error" role="alert">{error}</p>}
      <div className="fl-actions">
        <button type="button" className="fl-btn" onClick={() => { setError(''); setView(null); window.scrollTo({ top: 0 }); }}>◀ ALL BOXES</button>
      </div>
    </section>
  );
}

// ── Results ──

const FORMAT = { m: String, e: String, b: signedPct };

function Meters({ before, after, labels }: { before: { m: number; e: number; b: number }; after: RunResult; labels?: [string, string] }) {
  const rows = [
    { key: 'm' as const, label: 'Marketer work', unit: 'hours per campaign' },
    { key: 'e' as const, label: 'Harmful emails sent', unit: 'per 100,000' },
    { key: 'b' as const, label: 'Unsubscribes', unit: '' },
  ];
  return (
    <div className="fl-card g4p-meters">
      {labels && <p className="g4p-meter-labels">{labels[0].toUpperCase()} → {labels[1].toUpperCase()}</p>}
      {rows.map((r) => {
        const a = after[r.key];
        const b = before[r.key];
        return (
          <div key={r.key} className={`g4p-meter g4p-meter--${a < b ? 'good' : a > b ? 'bad' : 'same'}`}>
            <span className="g4p-meter-label">{r.label}</span>
            <b>{FORMAT[r.key](b)} → {FORMAT[r.key](a)}</b>
            {r.unit && <small>{r.unit}</small>}
          </div>
        );
      })}
      <p className="g4p-meter-note">Lower is better for all three.</p>
    </div>
  );
}

function Stories({ run }: { run: RunResult }) {
  if (!run.stories.length) return <p className="g4p-story good">Every box held. Marketers save time, customers stay, and no harmful email goes out.</p>;
  return (
    <div className="g4p-stories">
      <p className="fl-label">WHAT HAPPENED</p>
      <ul>
        {run.stories.map((s) => <li key={s.box} className="g4p-story"><b>Box {s.box}:</b> {s.text}</li>)}
      </ul>
    </div>
  );
}

function Hits({ run }: { run: RunResult }) {
  return (
    <div className="g4p-hits">
      {run.chaos.map((h) => {
        const card = CHAOS.find((c) => c.id === h.id)!;
        return (
          <div key={h.id} className={`g4p-hit ${h.broke ? 'broke' : 'ok'}`}>
            <span className="g4p-hit-card">CARD {h.id} · {card.name.toUpperCase()}</span>
            <b>{h.broke ? `Broke at ${boxLabel(h.broke)}` : 'Survived'}</b>
            <small>{h.line}</small>
          </div>
        );
      })}
    </div>
  );
}

/** The quiet screen (the same look as the other games' "Look up"). */
function Look({ title, line, icon, children }: { title: string; line?: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <section className="fl-look">
      <span className="fl-look-icon" aria-hidden="true">{icon ?? <Eye size={56} strokeWidth={2.5} />}</span>
      <h1 className="fl-h1">{title}</h1>
      {line && <p className="fl-lead">{line}</p>}
      {children}
    </section>
  );
}
