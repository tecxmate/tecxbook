import { Fragment, useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw, Settings, Trash2, WifiOff } from 'lucide-react';
import { SCENARIOS, TEAMS, type TeamInfo } from './scenarios';
import { formatDuration, gradeFor } from './scoring';
import { clearResults, fetchBoard, type DemoResult, type Phone } from './api';
import { Brand, QrCode, TeamTag } from './ui';

const POLL_MS = 2000;
const ROUND_SEC = 5 * 60;

type BoardTab = 'live' | 'reveal' | 'real' | 'discuss';

const TABS: Array<{ id: BoardTab; label: string }> = [
  { id: 'live', label: 'Live results' },
  { id: 'reveal', label: 'AI mistakes' },
  { id: 'real', label: 'Real world' },
  { id: 'discuss', label: 'Discuss' },
];

const PROGRESS = ['GAME 1', 'GAME 2', 'GAME 3', 'SCORES', 'GAME 4'];

export function Board({
  room,
  hostKey,
  onBack,
  onNext,
  onSettings,
  openPatients = ['c1', 'c2', 'c3'],
}: {
  room: string;
  /** Patients open in this class (the reveal shows these, plus any charted). */
  openPatients?: string[];
  hostKey?: string;
  onBack?: () => void;
  onNext?: () => void;
  /** Shows a gear button; the host opens its settings panel over the board. */
  onSettings?: () => void;
}) {
  const [results, setResults] = useState<DemoResult[]>([]);
  const [lineup, setLineup] = useState<Phone[]>([]);
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState<BoardTab>('live');

  // Paint the whole page in the board's night colour.
  useEffect(() => {
    document.documentElement.classList.add('qb-board');
    return () => document.documentElement.classList.remove('qb-board');
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchBoard(room)
        .then((r) => {
          if (!alive) return;
          setResults(r.results);
          setLineup(r.lineup);
          setOffline(false);
        })
        .catch(() => alive && setOffline(true));
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [room]);

  const joinUrl = useMemo(() => {
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set('room', room);
    return url.toString();
  }, [room]);

  const clear = () => {
    if (!window.confirm(`Delete all ${results.length} results in room "${room}"? This cannot be undone.`)) return;
    clearResults(room, hostKey).then(() => setResults([])).catch(() => setOffline(true));
  };

  return (
    <div className="dm-board">
      <header className="dm-top">
        <Brand room={room} />
        <ol className="dm-progress" aria-label="Progress">
          {PROGRESS.map((p, i) => (
            <li key={p} className={i === 2 ? 'is-now' : i < 2 ? 'is-done' : ''} aria-current={i === 2 ? 'step' : undefined}>{p}</li>
          ))}
        </ol>
        <div className="dm-nav">
          {offline && <span className="dm-offline"><WifiOff size="1em" /> Offline</span>}
          {onBack && <button className="dm-btn dm-btn--ghost" onClick={onBack}>◀ Games 1-2</button>}
          {onNext && <button className="dm-btn dm-btn--gold" onClick={onNext}>Class scores ▶</button>}
          {onSettings && (
            <button className="dm-gear" onClick={onSettings} aria-label="Settings" title="Settings">
              <Settings size="1.25em" />
            </button>
          )}
        </div>
      </header>

      <div className="dm-bar">
        <h1 className="dm-title"><span>GAME 3 ·</span> THE CLINIC</h1>
        <nav className="dm-tabs" aria-label="Board views">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'is-on' : ''} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        <RoundTimer />
      </div>

      <main className="dm-main dm-enter" key={tab}>
        {tab === 'live' && (
          <div className="dm-board-live">
            <div className="dm-board-teams">
              {TEAMS.map((t) => (
                <TeamColumn key={t.id} team={t} results={results.filter((r) => r.team === t.id)} phones={lineup.filter((p) => p.team === t.id)} />
              ))}
            </div>
            <aside className="dm-join">
              <span className="dm-join-kicker">Join on your phone</span>
              <QrCode text={joinUrl} />
              <span className="dm-join-room">ROOM <b>{room.toUpperCase()}</b></span>
              <span className="dm-join-url">{joinUrl.replace(/^https?:\/\//, '')}</span>
              <span className="dm-join-count">{lineup.length} phone{lineup.length === 1 ? '' : 's'} joined</span>
              <Feed results={results} />
            </aside>
          </div>
        )}
        {tab === 'reveal' && <Reveal results={results} openPatients={openPatients} />}
        {tab === 'real' && <RealWorld />}
        {tab === 'discuss' && <Discuss />}
      </main>

      <footer className="dm-foot">
        <span className="dm-board-count">{results.length} chart{results.length === 1 ? '' : 's'} signed</span>
        <button className="dm-clear" onClick={clear} disabled={!results.length} title="Delete every signed chart in this room">
          <Trash2 size="1em" /> Clear results
        </button>
      </footer>
    </div>
  );
}

// ── Live ──

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function TeamColumn({ team, results, phones }: { team: TeamInfo; results: DemoResult[]; phones: Phone[] }) {
  const n = results.length;
  const points = avg(results.map((r) => r.summary.points ?? 0));
  const time = avg(results.map((r) => r.summary.durationSec));
  const safety = results.reduce((a, r) => a + r.summary.safetyIssues, 0);

  return (
    <section className={`dm-team-col dm-team-col--${team.mode}`}>
      <header className="dm-team-col-head">
        <h2 className="dm-team-col-name">{team.name}</h2>
        <TeamTag team={team} />
      </header>
      <Lineup phones={phones} />
      <div className={`dm-score${n ? '' : ' dm-score--none'}`}>
        <span className="dm-score-row">
          <span className="dm-score-num">{n ? Math.round(points) : '—'}</span>
          {n > 0 && <span className="dm-grade" aria-label={`grade ${gradeFor(points)}`}>{gradeFor(points)}</span>}
        </span>
        <span className="dm-score-label">Average score per chart</span>
      </div>
      <dl className="dm-stats">
        <Stat label="Patients charted" value={String(n)} />
        <Stat label="Average time to sign" value={n ? formatDuration(time) : '—'} />
        <Stat label="Safety issues reaching patients" value={n ? String(safety) : '—'} tone={n ? (safety ? 'bad' : 'good') : undefined} />
      </dl>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className={`dm-metric${tone ? ` dm-metric--${tone}` : ''}`}>
      <dt className="dm-metric-label">{label}</dt>
      <dd className="dm-metric-value">{value}</dd>
    </div>
  );
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Who is in this team right now: one chip per dentist, with their nurses. */
function Lineup({ phones }: { phones: Phone[] }) {
  const dentists: string[] = [];
  for (const p of phones) if (p.job === 'dentist' && p.name && !dentists.some((d) => same(d, p.name))) dentists.push(p.name);
  // Alphabetical, so chips stay put while phones check in.
  dentists.sort((a, b) => a.localeCompare(b));
  const nurses = phones.filter((p) => p.job !== 'dentist');
  const waiting = nurses.filter((n) => !dentists.some((d) => same(d, n.follow))).length;
  if (!phones.length) return <div className="dm-lineup"><span className="dm-clinic dm-clinic--empty">Nobody yet</span></div>;
  return (
    <div className="dm-lineup">
      {dentists.map((d) => {
        // Nurse 1 first, so names do not swap places as phones check in.
        const mine = nurses.filter((n) => same(n.follow, d)).sort((a, b) => a.job.localeCompare(b.job) || a.name.localeCompare(b.name));
        const missing = (['nurse1', 'nurse2'] as const).filter((j) => !mine.some((n) => n.job === j));
        const names = mine.map((n) => n.name).filter(Boolean);
        const crew = names.length ? ` + ${names.join(', ')}` : '';
        return (
          <span key={d} className={`dm-clinic${missing.length ? ' dm-clinic--short' : ''}`}>
            Dr. {d}{crew}{missing.length === 2 ? ' · no nurses' : missing.length ? ` · needs Nurse ${missing[0] === 'nurse1' ? 1 : 2}` : names.length ? '' : ` · ${mine.length} nurses`}
          </span>
        );
      })}
      {waiting > 0 && <span className="dm-clinic dm-clinic--short">{dentists.length ? `${waiting} nurse${waiting === 1 ? '' : 's'} picking` : `${waiting} nurse${waiting === 1 ? '' : 's'}, no dentist`}</span>}
    </div>
  );
}

function Feed({ results }: { results: DemoResult[] }) {
  const latest = results.slice(-5).reverse();
  if (latest.length === 0) return <p className="dm-feed-empty">Waiting for the first signed chart</p>;
  return (
    <ul className="dm-feed" aria-label="Latest signed charts">
      {latest.map((r) => {
        const team = TEAMS.find((t) => t.id === r.team);
        const scenario = SCENARIOS.find((s) => s.id === r.summary.scenarioId);
        return (
          <li key={r.id} className="dm-feed-item">
            <span className={`dm-dot-team dm-dot-team--${team?.mode ?? 'manual'}`} />
            <span className="dm-feed-who">{r.station || team?.name}{scenario ? ` · ${scenario.first}` : ''}</span>
            <b>{r.summary.points ?? 0}</b>
          </li>
        );
      })}
    </ul>
  );
}

// ── AI mistakes ──
// Same columns as Live results. The first row is how many planted mistakes
// each team caught; then one row per planted mistake, where each cell says how
// many of that team's charts got that part right. Team 1 typed it themselves;
// Teams 2 and 3 had to fix the AI's version.

function Reveal({ results, openPatients }: { results: DemoResult[]; openPatients: string[] }) {
  // Only patients this class could play: the open ones and any that were charted.
  const shown = SCENARIOS.filter((s) => openPatients.includes(s.id) || results.some((r) => r.summary.scenarioId === s.id));
  const errors = shown.flatMap((s) => s.errors.map((e) => ({ scenario: s, error: e })));
  return (
    <div className="dm-reveal">
      <p className="dm-reveal-intro">We hid {errors.length} mistakes in the AI drafts. How many charts got them right?</p>
      <div className="dm-rv" style={{ gridTemplateRows: `auto auto repeat(${errors.length}, minmax(0, 1fr))` }}>
        <div className="dm-rv-corner" />
        {TEAMS.map((t) => (
          <div key={t.id} className={`dm-rv-team dm-rv-team--${t.mode}`}>
            <span className="dm-rv-team-name">{t.name}</span>
            <TeamTag team={t} />
          </div>
        ))}
        <div className="dm-rv-mistake dm-rv-mistake--total">
          <span className="dm-rv-title">AI mistakes caught</span>
        </div>
        {TEAMS.map((t) => {
          const mine = results.filter((r) => r.team === t.id);
          const caught = mine.reduce((a, r) => a + r.summary.aiErrorsCaught, 0);
          const planted = mine.reduce((a, r) => a + r.summary.aiErrorsTotal, 0);
          const tone = t.mode === 'manual' || !planted ? 'none' : caught * 2 >= planted ? 'good' : 'bad';
          return (
            <div key={t.id} className={`dm-rv-cell dm-rv-cell--total dm-rv-cell--${tone}`}>
              <span className="dm-rv-num">{t.mode === 'manual' ? 'no AI' : planted ? `${caught}/${planted}` : '—'}</span>
            </div>
          );
        })}
        {errors.map(({ scenario, error }) => (
          <Fragment key={error.id}>
            <div className="dm-rv-mistake">
              <span className="dm-rv-title">{error.shortTitle}</span>
              <span className="dm-rv-patient">{scenario.patientName}</span>
            </div>
            {TEAMS.map((t) => {
              const mine = results.filter((r) => r.team === t.id && r.summary.scenarioId === scenario.id);
              const right = mine.filter((r) => r.summary.fields.find((f) => f.key === error.field)?.correct).length;
              const tone = !mine.length ? 'none' : right * 2 >= mine.length ? 'good' : 'bad';
              return (
                <div key={t.id} className={`dm-rv-cell dm-rv-cell--${tone}`}>
                  <span className="dm-rv-num">{mine.length ? `${right}/${mine.length}` : '—'}</span>
                  {t.mode === 'ai-check' && error.checkCatches && <span className="dm-rv-warned">warned</span>}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// The game exaggerates on purpose. These are the real numbers to compare with.
const REAL_WORLD: Array<{ value: string; label: string; source: string }> = [
  { value: '3.5%', label: 'of sentences in real AI notes leave something out', source: 'Asgari et al., npj Digital Medicine 2025' },
  { value: '1.5%', label: 'of sentences in real AI notes are made up', source: 'Asgari et al., npj Digital Medicine 2025' },
  { value: '90 → 30 min', label: 'note time after work, as doctors felt it', source: 'MGB pilot survey, case Exhibit 4' },
  { value: '≈ 10%', label: 'less time per note, as a trial measured it', source: 'UCLA randomized trial, NEJM AI 2025' },
  { value: '72–93%', label: 'of drug-allergy warnings doctors click past', source: 'Hospital alert studies' },
];

function RealWorld() {
  return (
    <section className="dm-real">
      <p className="dm-reveal-intro">The game had more mistakes than real tools make. These are the real numbers.</p>
      <div className="dm-real-grid">
        {REAL_WORLD.map((f) => (
          <div key={f.value} className="dm-real-card">
            <span className="dm-real-value">{f.value}</span>
            <span className="dm-real-label">{f.label}</span>
            <span className="dm-real-source">{f.source}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Discuss ──

const QUESTIONS = [
  ['Faster or safer?', 'Which team would you want as your dentist?'],
  ['Where did the work go?', 'Team 1 typed. What did Teams 2 and 3 spend their time on?'],
  ['Did you really check?', 'Who signed the AI draft almost without reading it?'],
  ['What can a computer rule catch?', 'The safety check found record conflicts, not what was only said out loud.'],
  ['Which number would you trust?', 'Doctors felt 90 → 30 minutes. A trial measured about 10%.'],
  ['AUTO, APPROVE or ADVISE?', 'Which parts of the chart may the AI fill in alone?'],
];

function Discuss() {
  return (
    <div className="dm-discuss">
      {QUESTIONS.map(([q, d], i) => (
        <div key={q} className="dm-discuss-card">
          <span className="dm-discuss-num">{i + 1}</span>
          <div>
            <h2>{q}</h2>
            <p>{d}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Round timer ──

function RoundTimer() {
  const [left, setLeft] = useState(ROUND_SEC);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const over = left === 0;
  const late = running && left > 0 && left <= 10;
  return (
    <div className={`dm-timer${over ? ' is-over' : ''}${late ? ' is-late' : ''}`} role="timer" aria-label="Round timer">
      <span className="dm-timer-value">{over ? 'TIME!' : formatDuration(left)}</span>
      <div className="dm-timer-controls">
        <button className="dm-icon-btn" onClick={() => setRunning((r) => !r)} aria-label={running ? 'Pause' : 'Start'} title={running ? 'Pause' : 'Start'} disabled={over}>
          {running ? <Pause size="1.1em" /> : <Play size="1.1em" />}
        </button>
        <button className="dm-icon-btn" onClick={() => setLeft((s) => s + 60)} aria-label="Add a minute" title="Add a minute">+1</button>
        <button className="dm-icon-btn" onClick={() => { setRunning(false); setLeft(ROUND_SEC); }} aria-label="Reset" title="Reset to 5:00"><RotateCcw size="1.1em" /></button>
      </div>
    </div>
  );
}
