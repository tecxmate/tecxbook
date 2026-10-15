// Pieces of the Game 4 projector screens (see Game4Host.tsx): team headers,
// the three meters, story lines, chaos results and the six-months strip.

import { useEffect, useState, type ReactNode } from 'react';
import { Crown } from 'lucide-react';
import { ALL_SYSTEMS, CHAOS, G4_TEAMS, boxLabel, scoreHistogram, signedPct, type G4TeamState, type RunResult } from '../game4';

const groupOf = (team: string) => G4_TEAMS.find((t) => t.id === team)!.group;

// ── Pieces ──

export function TeamHead({ team, extra, win = false }: { team: string; extra?: string; win?: boolean }) {
  const t = G4_TEAMS.find((x) => x.id === team)!;
  return (
    <header className="g4-team-head">
      <h2>{win && <Crown size="0.9em" aria-hidden="true" />} {t.name}</h2>
      <span>{win ? 'WINNER' : `${t.side.toUpperCase()}${extra ? ` · ${extra}` : ''}`}</span>
    </header>
  );
}

export function ResultColumn({ team, win = false, children }: { team: G4TeamState; win?: boolean; children: ReactNode }) {
  return (
    <section className={`g4-team${team.members ? '' : ' g4-team--empty'}${win ? ' g4-team--win' : ''}`} data-note={groupOf(team.team)}>
      <TeamHead team={team.team} win={win} />
      <div className="g4-team-body">{team.members ? children : <p className="g4-none">Nobody in this team</p>}</div>
    </section>
  );
}

const fmt = {
  m: (n: number) => String(n),
  e: (n: number) => String(n),
  b: (n: number) => signedPct(n),
};

/** Three meters, before → after. Lower is better for all three. */
export function Meters({ before, after, compact = false }: { before: { m: number; e: number; b: number }; after: RunResult; compact?: boolean }) {
  const rows = [
    { key: 'm' as const, label: 'Marketer work', unit: 'hours per campaign' },
    { key: 'e' as const, label: 'Harmful emails sent', unit: 'per 100,000' },
    { key: 'b' as const, label: 'Unsubscribes', unit: '' },
  ];
  return (
    <dl className={`g4-meters${compact ? ' g4-meters--compact' : ''}`}>
      {rows.map((r) => {
        const a = after[r.key];
        const b = before[r.key];
        const tone = a < b ? 'good' : a > b ? 'bad' : 'same';
        return (
          <div key={r.key} className={`g4-meter g4-meter--${tone}`}>
            <dt>{r.label}</dt>
            <dd>
              <span className="g4-from">{fmt[r.key](b)}</span>
              <span className="g4-arrow" aria-hidden="true">→</span>
              <b><CountUp from={b} to={a} format={fmt[r.key]} /></b>
              {r.unit && <small>{r.unit}</small>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Up to three story lines on the board (phones show them all). */
export function Stories({ run }: { run: RunResult }) {
  if (!run.stories.length) return <p className="g4-story g4-story--good">Every box held. Marketers save time, customers stay, and no harmful email goes out.</p>;
  const shown = run.stories.slice(0, 3);
  const more = run.stories.length - shown.length;
  return (
    <ul className="g4-stories">
      {shown.map((s) => <li key={s.box} className="g4-story"><b>Box {s.box}:</b> {s.text}</li>)}
      {more > 0 && <li className="g4-story g4-story--more">and {more} more weak {more === 1 ? 'box' : 'boxes'} (on your phones)</li>}
    </ul>
  );
}

export function Hits({ run }: { run: RunResult }) {
  return (
    <div className="g4-hits">
      {run.chaos.map((h) => {
        const card = CHAOS.find((c) => c.id === h.id)!;
        return (
          <div key={h.id} className={`g4-hit g4-hit--${h.broke ? 'broke' : 'ok'}`}>
            <span className="g4-hit-card">{h.id} · {card.name.toUpperCase()}</span>
            <b>{h.broke ? `Broke at ${boxLabel(h.broke)}` : 'Survived'}</b>
            <small>{h.line}</small>
          </div>
        );
      })}
    </div>
  );
}

/** The six months: a calendar strip that fills month by month. */
export function SixMonths() {
  return (
    <div className="g4-months">
      <h1 className="g4-title g4-title--center">SIX MONTHS LATER</h1>
      <div className="g4-months-bar" aria-hidden="true">
        {[1, 2, 3, 4, 5, 6].map((m) => <span key={m} style={{ animationDelay: `${m * 180}ms` }}>M{m}</span>)}
      </div>
    </div>
  );
}

/** A number that runs from `from` to `to` once, after the six months have played. */
export function CountUp({ from, to, format = String, delay = 1200 }: { from: number; to: number; format?: (n: number) => string; delay?: number }) {
  const [shown, setShown] = useState(from === to ? to : from);
  useEffect(() => {
    if (from === to) {
      const id = requestAnimationFrame(() => setShown(to));
      return () => cancelAnimationFrame(id);
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const start = performance.now() + (reduce ? 0 : delay);
    const run = (t: number) => {
      const k = reduce ? 1 : Math.min(1, Math.max(0, (t - start) / 900));
      setShown(Math.round(from + (to - from) * k));
      if (k < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [from, to, delay]);
  return <>{format(shown)}</>;
}

/** After the chaos cards: only the two numbers they change. */
export function ChaosMeters({ before, after }: { before: RunResult; after: RunResult }) {
  const rows = [
    { key: 'e' as const, label: 'Harmful emails per 100,000', f: String },
    { key: 'b' as const, label: 'Unsubscribes', f: signedPct },
  ];
  return (
    <dl className="g4-mini">
      {rows.map((r) => {
        const a = after[r.key];
        const b = before[r.key];
        return (
          <div key={r.key} className={`g4-mini-row g4-meter--${a < b ? 'good' : a > b ? 'bad' : 'same'}`}>
            <dt>{r.label}</dt>
            <dd><span className="g4-from">{r.f(b)}</span> <span className="g4-arrow" aria-hidden="true">→</span> <b><CountUp from={b} to={a} format={r.f} delay={700} /></b></dd>
          </div>
        );
      })}
    </dl>
  );
}

/** The 30-second debate clock: starts when the debate shows; tap to run it again. */
export function DebateClock() {
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, 30 - Math.floor((now - startedAt) / 1000));
  return (
    <div className="g4-debate-clock">
      <b className={left === 0 ? 'over' : left <= 5 ? 'low' : ''} role="timer">{left === 0 ? 'TIME!' : left}</b>
      <button className="fh-tool" onClick={() => { setStartedAt(Date.now()); setNow(Date.now()); }}>Again</button>
    </div>
  );
}

/** All possible systems by score: green survive both chaos cards, grey break; each team marked. */
export function ScoreChart({ teams }: { teams: Array<{ team: string; score: number }> }) {
  const { bins, binOf } = scoreHistogram();
  const max = Math.max(...bins.map((b) => b.survive + b.broken));
  const W = 420;
  const H = 120;
  const bw = W / bins.length;
  const y = (n: number) => (n / max) * H;
  return (
    <figure className="g4-how-chart">
      <figcaption>ALL {ALL_SYSTEMS.toLocaleString('en-US')} SYSTEMS BY SCORE <span className="g4-how-key"><i className="ok" /> survive both chaos cards <i className="broke" /> break</span></figcaption>
      <svg viewBox={`0 -26 ${W} ${H + 46}`} role="img" aria-label="Score distribution of all possible systems, with each team marked">
        {bins.map((b, i) => (
          <g key={b.from}>
            <rect x={i * bw + 1} width={bw - 2} y={H - y(b.survive + b.broken)} height={y(b.broken)} className="g4-bar-broke" />
            <rect x={i * bw + 1} width={bw - 2} y={H - y(b.survive)} height={y(b.survive)} className="g4-bar-ok" />
          </g>
        ))}
        <line x1="0" x2={W} y1={H} y2={H} className="g4-axis" />
        {[0, 50, 100].map((v) => (
          <text key={v} x={binOf(v) * bw + bw / 2} y={H + 16} className="g4-axis-label">{v}</text>
        ))}
        {teams.map((t, k) => {
          const x = binOf(t.score) * bw + bw / 2;
          return (
            <g key={t.team} data-note={G4_TEAMS.find((g) => g.id === t.team)!.group} className="g4-mark">
              <line x1={x} x2={x} y1={-8} y2={H} />
              <text x={x} y={-12 - (teams.filter((o, j) => j < k && Math.abs(binOf(o.score) - binOf(t.score)) < 2).length * 12)}>T{t.team}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

