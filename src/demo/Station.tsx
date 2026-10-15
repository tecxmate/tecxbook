// Game 3, THE CLINIC, on a phone: pick a team and a job, pick a patient, watch the
// visit, then finish the chart one multiple-choice card at a time against a
// countdown. Each team needs three phones:
//   Dentist  plays the visit, picks the answers and signs the chart
//   Nurse 1  reads the conversation (Team 1: the dentist's quick notes)
//   Nurse 2  reads the patient's medical history
// The nurses' phones follow the dentist's phone through /api/demo-team. A big
// team can run two clinics: each nurse taps the dentist they are helping.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import {
  SCENARIOS,
  applyNames,
  TEAMS,
  getScenario,
  getTeam,
  type Answers,
  type Card,
  type Scenario,
  type TeamInfo,
} from './scenarios';
import { scoreRun, type ScoreSummary } from './scoring';
import { fetchResults, postTeamState, sayHello, submitResult, type Phone, type TeamState } from './api';
import { drawScene, type SceneState } from './game/scene';
import { isMuted, setMuted, sfx } from './game/sound';
import { buzz, settle, tapOk } from './game/taps';
import { phoneId } from './identity';
import { DEFAULT_SETTINGS, type FlowSettings } from './flow/api';
import './quest.css';

// ── Saved per phone ──

const STORAGE_KEY = 'dental-ai.demo-station.v2';

type Role = 'dentist' | 'nurse1' | 'nurse2';
const ROLES: Role[] = ['dentist', 'nurse1', 'nurse2'];

function roleInfo(role: Role, team: TeamInfo): { name: string; reads: string; job: string } {
  if (role === 'dentist') return { name: 'DENTIST', reads: 'THE CHART', job: 'Picks the answers and signs.' };
  if (role === 'nurse2') return { name: 'NURSE 2', reads: 'MEDICAL HISTORY', job: "Reads the patient's file." };
  return team.mode === 'manual'
    ? { name: 'NURSE 1', reads: "DENTIST'S NOTES", job: "Reads the dentist's notes." }
    : { name: 'NURSE 1', reads: 'CONVERSATION', job: 'Reads the visit, word for word.' };
}

const drName = (name: string) => (name ? `DR. ${name.toUpperCase()}` : 'THE DENTIST');
/** A dentist's name as typed: no leading or double spaces, at most 16 letters. */
const NAME_MAX = 16;
const tidyName = (v: string) => v.replace(/^\s+/, '').replace(/\s{2,}/g, ' ').slice(0, NAME_MAX);
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Dentists online on a team, by name, each once, in a steady order. */
function dentistNames(phones: Phone[]): string[] {
  const names: string[] = [];
  for (const p of phones) if (p.job === 'dentist' && p.name && !names.some((n) => sameName(n, p.name))) names.push(p.name);
  return names.sort((a, b) => a.localeCompare(b));
}

interface Saved {
  team?: string;
  role?: Role;
  /** The dentist's name (the chart phone only). */
  station?: string;
  /** Signed patients, kept apart per room and team ("room|team"). */
  doneBy?: Record<string, string[]>;
}

function loadSaved(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Saved;
  } catch {
    return {};
  }
}

function save(patch: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadSaved(), ...patch }));
  } catch {
    // Private mode: the phone just forgets its team on reload.
  }
}

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

type Step = { name: 'title' } | { name: 'patients' } | { name: 'play'; scenario: Scenario } | { name: 'nurse' };

/** Tell the nurses' phones what the dentist is doing. One retry, then let it go. */
function shareState(room: string, team: string, state: Parameters<typeof postTeamState>[2]) {
  postTeamState(room, team, state).catch(() => {
    window.setTimeout(() => { postTeamState(room, team, state).catch(() => {}); }, 2000);
  });
}

export function Station({ room, suggestedName = '', settings = DEFAULT_SETTINGS }: { room: string; suggestedName?: string; settings?: FlowSettings }) {
  const limit = settings.chartSec;
  // Patients the lecturer opened for this round (all when none chosen).
  // The lecturer's patient names, then the patients open for this round
  // (the three main ones if none is set).
  applyNames(settings.names);
  const open = settings.patients.length ? settings.patients : ['c1', 'c2', 'c3'];
  const allowed = SCENARIOS.filter((x) => open.includes(x.id));
  const [saved] = useState(loadSaved);
  const [team, setTeam] = useState<TeamInfo>(
    () => getTeam(new URLSearchParams(window.location.search).get('team')) ?? getTeam(saved.team) ?? TEAMS[1],
  );
  const [role, setRole] = useState<Role>(saved.role ?? 'dentist');
  const [station, setStation] = useState(saved.station ?? suggestedName);
  const [doneBy, setDoneBy] = useState<Record<string, string[]>>(saved.doneBy ?? {});
  const [step, setStep] = useState<Step>(() => {
    if (!saved.team || !saved.role || (saved.role === 'dentist' && !saved.station)) return { name: 'title' };
    return saved.role === 'dentist' ? { name: 'patients' } : { name: 'nurse' };
  });
  const [muted, setMutedState] = useState(isMuted);
  const [me] = useState(phoneId);
  const [crew, setCrew] = useState<Phone[]>([]);

  // A dentist's phone says hello every few seconds, so the board and the
  // nurses know it is here, and it learns which nurses are with it.
  // A nurse plays under their class nickname.
  const playerName = suggestedName;
  const dentistOn = role === 'dentist' && step.name !== 'title' && !!station;
  useEffect(() => {
    if (!dentistOn) return;
    let stop = false;
    const beat = () =>
      sayHello(room, team.id, { id: me, job: 'dentist', name: station, follow: '' })
        .then((r) => { if (!stop) setCrew(r.phones); })
        .catch(() => {});
    beat();
    const id = window.setInterval(beat, 5000);
    return () => { stop = true; window.clearInterval(id); };
  }, [dentistOn, room, team.id, me, station]);

  // The game is a one-screen app: the page itself never scrolls.
  useEffect(() => {
    document.documentElement.classList.add('sq-lock');
    return () => document.documentElement.classList.remove('sq-lock');
  }, []);

  const doneKey = `${room}|${team.id}`;
  const done = doneBy[doneKey] ?? [];
  const toggleSound = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  if (step.name === 'title') {
    return (
      <TitleScreen
        limit={limit}
        team={team}
        role={role}
        station={station}
        playerName={playerName}
        muted={muted}
        onToggleSound={toggleSound}
        onStart={(t, r, s) => {
          sfx.start();
          setTeam(t);
          setRole(r);
          setStation(s);
          save({ team: t.id, role: r, station: s });
          setStep(r === 'dentist' ? { name: 'patients' } : { name: 'nurse' });
        }}
        onPick={() => sfx.select()}
      />
    );
  }

  if (step.name === 'nurse') {
    return (
      <NurseScreen
        patients={allowed}
        limit={limit}
        room={room}
        team={team}
        role={role === 'dentist' ? 'nurse1' : role}
        me={me}
        name={playerName}
        muted={muted}
        onToggleSound={toggleSound}
        onChangeTeam={() => setStep({ name: 'title' })}
      />
    );
  }

  if (step.name === 'patients') {
    return (
      <PatientsScreen
        patients={allowed}
        team={team}
        station={station}
        crew={crew.filter((p) => p.id !== me)}
        done={done}
        muted={muted}
        onToggleSound={toggleSound}
        onChangeTeam={() => setStep({ name: 'title' })}
        onPick={(scenario) => { sfx.select(); setStep({ name: 'play', scenario }); }}
      />
    );
  }

  return (
    <Play
      limit={limit}
      key={step.scenario.id}
      room={room}
      team={team}
      station={station}
      scenario={step.scenario}
      muted={muted}
      onToggleSound={toggleSound}
      onSigned={(id) => {
        if (done.includes(id)) return;
        const next = { ...doneBy, [doneKey]: [...done, id] };
        setDoneBy(next);
        save({ doneBy: next });
      }}
      onExit={() => {
        shareState(room, team.id, { scenarioId: step.scenario.id, phase: 'idle', dentist: station });
        setStep({ name: 'patients' });
      }}
    />
  );
}

// ── Shared pieces: top bar, sound, confirm panel ──

function SoundButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button className="q-chip q-btn q-sound" onClick={onToggle} aria-pressed={!muted} aria-label={muted ? 'Sound is off' : 'Sound is on'} title={muted ? 'Sound off' : 'Sound on'}>
      {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
    </button>
  );
}

/** The same top bar on every Game 3 screen: game, team, then the timer or back chip, then sound. */
function Hud({ team, muted, onToggleSound, children }: { team: TeamInfo; muted: boolean; onToggleSound: () => void; children?: ReactNode }) {
  return (
    <header className="q-hud">
      <div className="q-logo" aria-hidden="true">SCRIBE <b>QUEST</b></div>
      <span className="q-chip q-game-chip">GAME 3</span>
      <span className="q-chip" data-team={team.id}>{team.name.toUpperCase()}</span>
      <span className="q-hud-end">
        {children}
        <SoundButton muted={muted} onToggle={onToggleSound} />
      </span>
    </header>
  );
}

/** An in-page "are you sure?" for things that cannot be undone. The safe choice is the big one. */
function Confirm({ title, line, yes, no = 'STAY', onYes, onNo }: { title: string; line: string; yes: string; no?: string; onYes: () => void; onNo: () => void }) {
  const id = useId();
  const stay = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => { settle(); stay.current?.focus(); }, []);
  return (
    <div className="q-confirm" onClick={(e) => { if (e.target === e.currentTarget) onNo(); }}>
      <div className="q-confirm-box q-enter" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-l`}>
        <h2 id={`${id}-t`}>{title}</h2>
        <p id={`${id}-l`}>{line}</p>
        <div className="q-confirm-actions">
          <button className="px-btn" onClick={(e) => { if (tapOk(e, 400)) onYes(); }}>{yes}</button>
          <button ref={stay} className="px-btn big" onClick={onNo}>{no}</button>
        </div>
      </div>
    </div>
  );
}

/** The rare "change team or job" exit: a small ghost button that always asks first. */
function ChangeTeam({ label, line, onChange }: { label: string; line: string; onChange: () => void }) {
  const [asking, setAsking] = useState(false);
  // It mounts with the patient list and the nurse screen: the second tap of a
  // double tap on PRESS START or NEXT PATIENT must not land on anything there.
  useLayoutEffect(() => settle(), []);
  return (
    <>
      <div className="q-leave">
        <button className="px-btn small ghost" onClick={(e) => { if (!tapOk(e, 500)) return; sfx.select(); setAsking(true); }}>{label}</button>
      </div>
      {asking && (
        <Confirm
          title="Change team or job?"
          line={line}
          yes="YES, CHANGE"
          onYes={() => { setAsking(false); onChange(); }}
          onNo={() => setAsking(false)}
        />
      )}
    </>
  );
}

// ── Title: pick a team and a job ──

function TitleScreen({ limit, team, role, station, playerName, muted, onToggleSound, onStart, onPick }: {
  limit: number;
  team: TeamInfo;
  role: Role;
  station: string;
  playerName: string;
  muted: boolean;
  onToggleSound: () => void;
  onStart: (team: TeamInfo, role: Role, station: string) => void;
  onPick: () => void;
}) {
  const [picked, setPicked] = useState(team);
  const [job, setJob] = useState(role);
  const [name, setName] = useState(() => tidyName(station));
  const needsName = job === 'dentist' && !name.trim();
  const start = () => { if (!needsName) onStart(picked, job, job === 'dentist' ? name.trim() : ''); };
  const you = job === 'dentist'
    ? `${drName(name.trim())}, ${picked.name}`
    : `${playerName ? `${playerName}, ` : ''}${roleInfo(job, picked).name.replace('NURSE', 'Nurse')}, ${picked.name}`;
  return (
    <div className="sq sq-scroll">
      <div className="q-title-screen q-enter">
        <div className="q-title-top">
          <span className="q-chip q-game-chip">GAME 3</span>
          <span className="q-brand">SCRIBE <b>QUEST</b></span>
          <SoundButton muted={muted} onToggle={onToggleSound} />
        </div>
        <h1 className="q-logo-big">THE<br />CLINIC</h1>
        <p className="q-intro">A team of 3 runs a clinic. Each chart gets {limit} seconds.</p>
        <h2 className="q-label">1 · YOUR TEAM</h2>
        <div className="q-teams" role="radiogroup" aria-label="Pick your team">
          {TEAMS.map((t) => (
            <button
              key={t.id}
              className={`q-team${picked.id === t.id ? ' on' : ''}`}
              data-team={t.id}
              role="radio"
              aria-checked={picked.id === t.id}
              onClick={() => { onPick(); setPicked(t); }}
            >
              <span className="q-team-name">{t.name.toUpperCase()}</span>
              <span className="q-team-mode">{t.label}</span>
              <span className="q-team-tag">{t.tagline}</span>
            </button>
          ))}
        </div>
        <h2 className="q-label">2 · YOUR JOB</h2>
        <div className="q-roles" role="radiogroup" aria-label="Pick your job">
          {ROLES.map((r) => {
            const info = roleInfo(r, picked);
            return (
              <button
                key={r}
                className={`q-role${job === r ? ' on' : ''}`}
                data-role={r}
                role="radio"
                aria-checked={job === r}
                onClick={() => { onPick(); setJob(r); }}
              >
                <span className="q-role-name">{info.name}</span>
                <span className="q-role-reads">{info.reads}</span>
                <span className="q-role-job">{info.job}</span>
              </button>
            );
          })}
        </div>
        {job === 'dentist' && (
          <>
            <label className="q-label" htmlFor="q-names">3 · DENTIST'S NAME</label>
            <input
              id="q-names"
              className="q-input"
              value={name}
              maxLength={NAME_MAX}
              placeholder="e.g. Anna"
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="go"
              onChange={(e) => setName(tidyName(e.target.value))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); start(); } }}
            />
          </>
        )}
        <div className="q-start">
          <button className="px-btn big" disabled={needsName} onClick={start}>▶ PRESS START</button>
          <p className="q-small" role="status">{needsName ? "Type the dentist's name to start." : `You: ${you}`}</p>
        </div>
      </div>
    </div>
  );
}

// ── Patient list ──

function PatientsScreen({ patients, team, station, crew, done, muted, onToggleSound, onChangeTeam, onPick }: {
  patients: Scenario[];
  team: TeamInfo;
  station: string;
  /** Other phones online on this team. */
  crew: Phone[];
  done: string[];
  muted: boolean;
  onToggleSound: () => void;
  onChangeTeam: () => void;
  onPick: (s: Scenario) => void;
}) {
  const only = patients.length === 1;
  const allDone = patients.length > 0 && patients.every((s) => done.includes(s.id));
  let sub = 'Tap the patient your lecturer names.';
  if (only) sub = 'Tap your patient to start.';
  if (allDone) sub = 'All charts signed. Look up at the board.';
  return (
    <div className="sq sq-scroll">
      <div className="q-app">
        <Hud team={team} muted={muted} onToggleSound={onToggleSound} />
        <section className="q-box q-enter">
          <h2 className="q-h2">TODAY'S PATIENTS</h2>
          <p className="q-sub"><b>{drName(station)}</b> · {sub}</p>
          <Crew team={team} station={station} crew={crew} />
          <div className="q-patients">
            {patients.map((s) => (
              <button key={s.id} className={`q-patient${only ? ' only' : ''}`} onClick={(e) => { if (tapOk(e, 500)) onPick(s); }}>
                <span className="q-patient-num">{s.number}</span>
                <span className="q-patient-info">
                  <strong>{s.patientName}, {s.age}</strong>
                  <span>{s.reason}</span>
                  {only && <em className="q-patient-tag">Your lecturer chose this patient</em>}
                </span>
                <span className={`q-patient-state${done.includes(s.id) ? ' done' : ''}`}>{done.includes(s.id) ? '✓ SIGNED' : '▶'}</span>
              </button>
            ))}
          </div>
        </section>
        <ChangeTeam label="CHANGE TEAM" line="Your nurses will lose you." onChange={onChangeTeam} />
      </div>
    </div>
  );
}

/** Which nurses are with this dentist, and what to do if one is missing. */
function Crew({ team, station, crew }: { team: TeamInfo; station: string; crew: Phone[] }) {
  const mine = crew.filter((p) => p.job !== 'dentist' && sameName(p.follow, station));
  const nurse1 = mine.filter((p) => p.job === 'nurse1').map((p) => p.name).filter(Boolean);
  const nurse2 = mine.filter((p) => p.job === 'nurse2').map((p) => p.name).filter(Boolean);
  const has1 = mine.some((p) => p.job === 'nurse1');
  const has2 = mine.some((p) => p.job === 'nurse2');
  const choosing = crew.filter((p) => p.job !== 'dentist' && !p.follow).length;
  const twin = crew.some((p) => p.job === 'dentist' && sameName(p.name, station));
  let tip: string;
  if (has1 && has2) tip = `${[...nurse1, ...nurse2].join(' and ') || 'Both nurses'} ${nurse1.length + nurse2.length === 1 ? 'is' : 'are'} with you. Ask them what you need.`;
  else if (!has1 && !has2) tip = `No nurses yet. Two teammates join ${team.name} as Nurse 1 and Nurse 2.`;
  else tip = `Only Nurse ${has1 ? 1 : 2} so far. They can read both for now.`;
  return (
    <div className="q-crew" role="status">
      <div className="q-crew-slots">
        <span className={has1 ? 'on' : ''}>{has1 ? '✓' : '·'} NURSE 1{nurse1.length ? ` · ${nurse1.join(', ').toUpperCase()}` : ''}</span>
        <span className={has2 ? 'on' : ''}>{has2 ? '✓' : '·'} NURSE 2{nurse2.length ? ` · ${nurse2.join(', ').toUpperCase()}` : ''}</span>
      </div>
      <p>{tip}{choosing > 0 ? ` ${choosing} nurse${choosing === 1 ? ' has' : 's have'} not picked a dentist yet.` : ''}</p>
      {twin && <p className="q-crew-warn">Another dentist on {team.name} is also called {station}. Tap CHANGE TEAM and use a different name.</p>}
    </div>
  );
}

// ── Play one patient ──

type Phase = 'visit' | 'talk' | 'draft' | 'chart' | 'sign' | 'result';
type Who = 'dentist' | 'patient' | 'ai';
interface Line { who: Who; text: string }

const DRAFT_STEPS = ['Listening to the recording', 'Finding the patient details', 'Writing the plan'];

function Play({ limit, room, team, station, scenario, muted, onToggleSound, onSigned, onExit }: {
  limit: number;
  room: string;
  team: TeamInfo;
  station: string;
  scenario: Scenario;
  muted: boolean;
  onToggleSound: () => void;
  onSigned: (id: string) => void;
  onExit: () => void;
}) {
  const isAi = team.mode !== 'manual';
  const names: Record<Who, string> = { dentist: drName(station), patient: scenario.first.toUpperCase(), ai: 'SCRIBBY' };
  const [reduce] = useState(reduceMotion);

  const [phase, setPhase] = useState<Phase>('visit');
  const [lines, setLines] = useState<Line[]>(() => scenario.visit.map((l) => ({ who: l.who, text: l.text })));
  const [lineIdx, setLineIdx] = useState(0);
  const [typed, setTyped] = useState(0);
  const [draftStep, setDraftStep] = useState(0);

  const [answers, setAnswers] = useState<Answers>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [item, setItem] = useState(0);
  const [pending, setPending] = useState<string | undefined>(undefined);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [summary, setSummary] = useState<ScoreSummary | null>(null);
  const [leftAt, setLeftAt] = useState(0);
  const [sendState, setSendState] = useState<'sending' | 'sent' | 'failed'>('sending');
  const [ranking, setRanking] = useState<Array<{ team: TeamInfo; avg: number; n: number }> | null>(null);
  const lastTick = useRef(-1);

  // The nurses' phones follow each phase; the countdown is shared as time used.
  useEffect(() => {
    shareState(room, team.id, {
      scenarioId: scenario.id,
      phase,
      dentist: station,
      points: phase === 'result' ? summary?.points ?? null : null,
      elapsedMs: phase === 'chart' || phase === 'sign' ? Date.now() - startedAt : null,
    });
    // Only a phase change is news for the nurses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Every new card or step holds back stray taps for a moment.
  useLayoutEffect(() => settle(), [phase, item]);

  // ── Dialogue ──
  const line = lines[lineIdx];
  const dialogue = phase === 'visit' || phase === 'talk';
  const shown = dialogue && line ? (reduce ? line.text : line.text.slice(0, typed)) : '';
  const typing = dialogue && !!line && !reduce && typed < line.text.length;
  // The tap after this line starts the chart clock.
  const lastBeforeChart = phase === 'talk' && lineIdx === lines.length - 1 && (!isAi || draftStep >= DRAFT_STEPS.length);

  useEffect(() => {
    if (!dialogue || !line || reduce) return;
    const len = line.text.length;
    const id = window.setInterval(() => setTyped((n) => Math.min(len, n + 1)), 26);
    return () => window.clearInterval(id);
  }, [dialogue, line, reduce]);

  useEffect(() => {
    if (typing && typed % 3 === 0 && line?.text[typed] !== ' ') sfx.blip(line.who);
  }, [typed, typing, line]);

  const afterLines = useCallback(() => {
    if (phase === 'visit') {
      setPhase('talk');
      setLines(isAi
        ? [{ who: 'ai', text: 'Beep boop! I recorded the whole visit.' }, { who: 'ai', text: 'Drafting the chart for you now…' }]
        : [{ who: 'dentist', text: 'No AI helper today. My notes are in my pocket. Time to fill in the chart…' }]);
      setLineIdx(0);
      setTyped(0);
      return;
    }
    // End of the "talk" lines.
    if (isAi && draftStep < DRAFT_STEPS.length) {
      setPhase('draft');
      sfx.robot();
      return;
    }
    beginChart();
    // beginChart is stable for this patient and team.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isAi, draftStep]);

  // One step per tap, whatever the speed: a tap finishes the line being typed,
  // the next one moves on. Taps do nothing while Scribby drafts.
  const advance = useCallback(() => {
    if (!dialogue || !line) return;
    if (typing) { setTyped(line.text.length); return; }
    if (lineIdx < lines.length - 1) {
      setLineIdx(lineIdx + 1);
      setTyped(0);
    } else {
      afterLines();
    }
  }, [dialogue, line, typing, lineIdx, lines.length, afterLines]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !(e.target as HTMLElement).closest?.('button, input')) {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance]);

  // ── Scribby drafts ──
  useEffect(() => {
    if (phase !== 'draft') return;
    const id = window.setInterval(() => {
      setDraftStep((n) => {
        const next = n + 1;
        if (next < DRAFT_STEPS.length) sfx.robot();
        return next;
      });
    }, 650);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'draft' || draftStep < DRAFT_STEPS.length) return;
    const id = window.setTimeout(() => {
      setPhase('talk');
      setLines([{ who: 'ai', text: 'Done! Please check my work. I am almost always right. Almost.' }]);
      setLineIdx(0);
      setTyped(0);
    }, 400);
    return () => window.clearTimeout(id);
  }, [phase, draftStep]);

  // ── Chart ──
  function beginChart() {
    const start: Answers = {};
    if (isAi) for (const c of scenario.cards) start[c.key] = c.ai;
    const t = Date.now();
    setAnswers(start);
    setConfirmed({});
    setItem(0);
    setPending(isAi ? scenario.cards[0].ai : undefined);
    setStartedAt(t);
    setNow(t);
    setPhase('chart');
    buzz();
  }

  const goTo = (i: number, conf = confirmed, ans = answers) => {
    const c = scenario.cards[i];
    setItem(i);
    setPending(conf[c.key] ? ans[c.key] : (isAi ? c.ai : undefined));
  };

  const confirmCard = () => {
    const c = scenario.cards[item];
    if (pending === undefined) return;
    sfx.confirm();
    const ans = { ...answers, [c.key]: pending };
    const conf = { ...confirmed, [c.key]: true };
    setAnswers(ans);
    setConfirmed(conf);
    const open = scenario.cards.findIndex((x) => !conf[x.key]);
    if (open === -1) { setPhase('sign'); return; }
    const after = scenario.cards.findIndex((x, i) => i > item && !conf[x.key]);
    goTo(after !== -1 ? after : open, conf, ans);
  };

  const finished = useRef(false);
  const finish = useCallback((timedOut: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const used = (Date.now() - startedAt) / 1000;
    const result = scoreRun(scenario, team.mode, answers, confirmed, used, timedOut, limit);
    setSummary(result);
    setLeftAt(performance.now());
    setPhase('result');
    if (timedOut) sfx.timeUp(); else if (result.hearts < 3) sfx.bad(); else sfx.good();
    onSigned(scenario.id);
    setSendState('sending');
    submitResult(room, team.id, station, result)
      .then(() => {
        setSendState('sent');
        return fetchResults(room);
      })
      .then((all) => {
        setRanking(TEAMS.map((t) => {
          const mine = all.filter((r) => r.team === t.id);
          const avg = mine.length ? mine.reduce((a, r) => a + (r.summary.points ?? 0), 0) / mine.length : 0;
          return { team: t, avg, n: mine.length };
        }).sort((a, b) => b.avg - a.avg));
      })
      .catch(() => setSendState((s) => (s === 'sent' ? s : 'failed')));
  }, [startedAt, scenario, team, answers, confirmed, room, station, onSigned, limit]);

  const resend = () => {
    if (!summary) return;
    setSendState('sending');
    submitResult(room, team.id, station, summary).then(() => setSendState('sent')).catch(() => setSendState('failed'));
  };

  // The countdown calls the latest finish without restarting its timer
  // whenever a parent re-renders (a new finish every render would keep
  // resetting the interval, and the clock would stall).
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  // Countdown: ticks in the last 10 seconds (a buzz at 10), signs automatically at 0.
  const timed = phase === 'chart' || phase === 'sign';
  useEffect(() => {
    if (!timed) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const left = limit - Math.floor((t - startedAt) / 1000);
      if (left <= 10 && left > 0 && left !== lastTick.current) {
        lastTick.current = left;
        sfx.tick();
        if (left === 10) buzz();
      }
      if (left <= 0) finishRef.current(true);
    }, 250);
    return () => window.clearInterval(id);
  }, [timed, startedAt, limit]);

  // Leaving mid-visit (the lecturer moved on): tell the nurses' phones.
  useEffect(() => () => {
    if (!finished.current) shareState(room, team.id, { scenarioId: scenario.id, phase: 'idle', dentist: station });
    // Only on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After signing, the clock stays frozen at the time that was left.
  const left = timed || phase === 'result' ? Math.max(0, limit - Math.floor((now - startedAt) / 1000)) : limit;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  // ── Scene ──
  const scene: SceneState = {
    look: scenario.look,
    showRobot: isAi,
    talking: typing ? line.who : null,
    robotBusy: phase === 'draft',
    leaving: phase === 'result' && summary ? { hearts: summary.hearts, since: leftAt } : null,
    reduceMotion: reduce,
  };

  const signedName = scenario.first;
  return (
    <div className="sq" data-phase={phase}>
      <div className="q-app">
        <Hud team={team} muted={muted} onToggleSound={onToggleSound}>
          {/* Leaving is fine until the chart clock starts; after that the clock is the rule. */}
          {dialogue || phase === 'draft'
            ? <button className="q-chip q-btn q-back" onClick={() => { sfx.select(); onExit(); }}>◀ PATIENTS</button>
            : <span className={`q-chip q-clock${timed && left <= 10 ? ' low' : ''}${phase === 'result' ? ' stopped' : ''}`} aria-label="Time left for this chart">⏱ {clock}</span>}
        </Hud>

        <div className="q-stage">
          <section className="q-game">
            <div className="q-screen">
              <SceneCanvas state={scene} onTap={advance} />
            </div>
            <div className="q-panel" aria-live="polite" onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) advance(); }}>
              {dialogue && line && (
                <div className="q-panel-in">
                  <span className="q-who" data-who={line.who}>{names[line.who]}</span>
                  <p className="q-line">{shown}</p>
                  <p className="q-tap" aria-hidden={typing}>
                    {typing ? '' : lastBeforeChart ? `▼ TAP: START THE ${limit}s CHART` : '▼ TAP'}
                  </p>
                </div>
              )}
              {phase === 'draft' && (
                <div className="q-panel-in q-enter" key="draft">
                  <span className="q-who" data-who="ai">SCRIBBY</span>
                  <ul className="q-progress">
                    {DRAFT_STEPS.map((s, i) => <li key={s} className={i < draftStep ? 'done' : ''}>{s}</li>)}
                  </ul>
                  <p className="q-tap">PLEASE WAIT…</p>
                </div>
              )}
              {phase === 'chart' && (
                <ChartCard
                  scenario={scenario}
                  team={team}
                  index={item}
                  answers={answers}
                  confirmed={confirmed}
                  pending={pending}
                  onPick={(v) => { sfx.select(); setPending(v); }}
                  onBack={() => { sfx.select(); goTo(item - 1); }}
                  onNext={confirmCard}
                />
              )}
              {phase === 'sign' && (
                <>
                  <div className="q-panel-in q-enter">
                    <span className="q-who" data-who="dentist">{names.dentist}</span>
                    <p className="q-line q-big-line">Sign {signedName}'s chart?</p>
                    <p className="q-fair">All 8 cards are checked. A signed chart cannot be changed.</p>
                  </div>
                  <div className="q-next-row q-stack">
                    <button className="px-btn" onClick={() => { sfx.select(); setPhase('chart'); goTo(0); }}>◀ CHECK AGAIN</button>
                    <button className="px-btn big" onClick={(e) => { if (tapOk(e, 600)) finish(false); }}>✍ SIGN THE CHART</button>
                  </div>
                </>
              )}
              {phase === 'result' && summary && (
                <Result
                  scenario={scenario}
                  team={team}
                  summary={summary}
                  answers={answers}
                  sendState={sendState}
                  ranking={ranking}
                  onResend={resend}
                  onNext={onExit}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── One chart card ──

function ChartCard({ scenario, team, index, answers, confirmed, pending, onPick, onBack, onNext }: {
  scenario: Scenario;
  team: TeamInfo;
  index: number;
  answers: Answers;
  confirmed: Record<string, boolean>;
  pending: string | undefined;
  onPick: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const card: Card = scenario.cards[index];
  const isAi = team.mode !== 'manual';
  const last = scenario.cards.every((c, i) => i === index || confirmed[c.key]);
  const warning = team.mode === 'ai-check' ? card.check?.(pending, { ...answers, [card.key]: pending }) ?? null : null;
  const info = team.mode === 'ai-check' && !warning ? card.falseAlarm ?? null : null;

  // Warn once when a card opens with a conflict.
  const warnedFor = useRef('');
  useEffect(() => {
    if (warning && warnedFor.current !== card.key) {
      warnedFor.current = card.key;
      sfx.warn();
    }
  }, [warning, card.key]);

  return (
    <>
      <div className="q-panel-in q-enter" key={index}>
        <div className="q-card-top">
          <span className="q-who" data-who={isAi ? 'ai' : 'dentist'}>CHART {index + 1}/{scenario.cards.length}</span>
          <div className="q-pips" aria-hidden="true">
            {scenario.cards.map((c, i) => <span key={c.key} className={`q-pip${confirmed[c.key] ? ' done' : i === index ? ' now' : ''}`} />)}
          </div>
          {index > 0 && <button className="px-btn small" onClick={onBack}>◀ BACK</button>}
        </div>
        {team.mode === 'ai-check' && (
          <div className={`q-check${warning ? ' warn' : info ? ' info' : ' ok'}`} role={warning ? 'alert' : undefined}>
            <b>{warning ? '⚠ SAFETY CHECK' : info ? '? SAFETY CHECK' : '✓ SAFETY CHECK'}</b>
            <span>{warning ?? info ?? 'No conflict with the patient record.'}</span>
          </div>
        )}
        <div className="q-field">{card.label.toUpperCase()}</div>
        {index === 0 && !confirmed[card.key] && (
          <p className="q-ask">{isAi ? "Keep Scribby's pick or change it. Ask your nurses." : 'Ask your nurses, then pick.'}</p>
        )}
        <div className="q-options" role="radiogroup" aria-label={card.label}>
          {card.options.map((o) => (
            <button
              key={o}
              className={`px-btn q-opt${pending === o ? ' picked' : ''}`}
              role="radio"
              aria-checked={pending === o}
              onClick={(e) => { if (tapOk(e)) onPick(o); }}
            >
              {isAi && o === card.ai && <span className="q-bot-tag">SCRIBBY</span>}
              {o}
            </button>
          ))}
        </div>
      </div>
      <div className="q-next-row">
        <button className="px-btn big" disabled={pending === undefined} onClick={(e) => { if (tapOk(e)) onNext(); }}>{last ? 'REVIEW ▶' : 'NEXT ▶'}</button>
      </div>
    </>
  );
}

// ── Result ──

function Result({ scenario, team, summary, answers, sendState, ranking, onResend, onNext }: {
  scenario: Scenario;
  team: TeamInfo;
  summary: ScoreSummary;
  answers: Answers;
  sendState: 'sending' | 'sent' | 'failed';
  ranking: Array<{ team: TeamInfo; avg: number; n: number }> | null;
  onResend: () => void;
  onNext: () => void;
}) {
  const isAi = team.mode !== 'manual';
  const hurt = scenario.cards.find((c) => c.critical && answers[c.key] !== c.truth);
  const quote = summary.hearts === 3 ? scenario.thanks : hurt?.ouch ?? scenario.thanks;
  const b = summary.breakdown;
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  return (
    <>
      <div className="q-panel-in q-enter">
        <span className="q-who" data-who="patient">{summary.timedOut ? "TIME'S UP" : scenario.first.toUpperCase()}</span>
        <div className="q-result-head">
          <span className="q-grade" aria-label={`Grade ${summary.grade}`}>{summary.grade}</span>
          <div><div className="q-score">{summary.points}</div><small className="q-small-ink">POINTS</small></div>
          <span className="q-hearts" aria-label={`${summary.hearts} of 3 hearts left`}>
            {[0, 1, 2].map((i) => <span key={i} className={i < summary.hearts ? '' : 'lost'}>♥</span>)}
          </span>
        </div>
        <p className="q-quote">“{quote}”</p>
        {sendState === 'failed' && (
          <div className="q-sendfail" role="alert">
            <span>Not sent to the class board yet.</span>
            <button className="px-btn small" onClick={onResend}>TRY AGAIN</button>
          </div>
        )}
        <button className="q-more" aria-expanded={open} aria-controls={detailsId} onClick={() => { sfx.select(); setOpen((o) => !o); }}>
          {open ? 'HIDE DETAILS ▲' : 'DETAILS ▼'}
        </button>
        {/* Collapsed with `hidden`: still in the page, just not drawn. */}
        <div className="q-details" id={detailsId} hidden={!open}>
          {summary.badges.length > 0 && (
            <div className="q-badges">{summary.badges.map((bd) => <span key={bd.label} className={`q-badge${bd.good ? '' : ' boo'}`}>{bd.label}</span>)}</div>
          )}
          <table className="q-breakdown"><tbody>
            <tr><td>Correct cards you checked</td><td>{b.cards}</td></tr>
            <tr><td>Safety cards right</td><td>{b.safety}</td></tr>
            <tr><td>Time bonus</td><td>{b.speed}</td></tr>
            <tr><td>Hearts {scenario.first} lost</td><td className={b.hearts ? 'neg' : ''}>{b.hearts ? `−${-b.hearts}` : 0}</td></tr>
          </tbody></table>
          <p className="q-fair">Points only count for cards you checked yourself.</p>
          {isAi && (
            <p className="q-fair">
              Scribby made {summary.aiErrorsTotal} mistake{summary.aiErrorsTotal === 1 ? '' : 's'}. You caught {summary.aiErrorsCaught}.
            </p>
          )}
          {!isAi && scenario.notesForgot && <p className="q-fair">{scenario.notesForgot}</p>}

          <div className="q-rank">
            <h3>TEAM RANKING</h3>
            {sendState === 'failed' ? (
              <p className="q-fair">Could not reach the class board. Tap TRY AGAIN above, or show this screen to the lecturer.</p>
            ) : !ranking ? (
              <p className="q-fair">Sending to the class board…</p>
            ) : (
              <ol>{ranking.map((r) => (
                <li key={r.team.id} className={r.team.id === team.id ? 'me' : ''}>
                  {r.team.name} · {r.team.label} · {r.n ? `${Math.round(r.avg)} pts avg` : 'no charts yet'}
                </li>
              ))}</ol>
            )}
          </div>

          <div className="q-all">
            <h3>ALL ANSWERS</h3>
            <ul>
              {scenario.cards.map((c) => {
                const ok = answers[c.key] === c.truth;
                return (
                  <li key={c.key}>
                    <span className={ok ? 'ok' : 'bad'}>{ok ? '✓' : '✗'}</span>
                    <span>{c.label}: {answers[c.key] ?? 'left empty'}{ok ? '' : <em> → {c.truth}</em>}</span>
                  </li>
                );
              })}
            </ul>
            {isAi && scenario.errors.map((e) => <p key={e.id} className="q-fair">{e.whyReal}</p>)}
          </div>
        </div>
      </div>
      <div className="q-next-row">
        <button className="px-btn big" onClick={(e) => { if (tapOk(e, 800)) onNext(); }}>NEXT PATIENT ▶</button>
      </div>
    </>
  );
}

// ── A nurse's phone: follows the dentist and shows one thing to read ──

const POLL_MS = 2000;

function NurseScreen({ patients, limit, room, team, role, me, name, muted, onToggleSound, onChangeTeam }: {
  patients: Scenario[];
  limit: number;
  room: string;
  team: TeamInfo;
  role: 'nurse1' | 'nurse2';
  me: string;
  name: string;
  muted: boolean;
  onToggleSound: () => void;
  onChangeTeam: () => void;
}) {
  const info = roleInfo(role, team);
  const [live, setLive] = useState<{ states: TeamState[]; phones: Phone[]; offset: number; ok: boolean }>({ states: [], phones: [], offset: 0, ok: true });
  // The dentist this nurse helps: the only one online, or the one tapped.
  const [follow, setFollow] = useState<string | null>(null);
  const followRef = useRef<string | null>(null);
  useEffect(() => { followRef.current = follow; }, [follow]);
  const nameRef = useRef(name);
  useEffect(() => { nameRef.current = name; }, [name]);
  const [now, setNow] = useState(() => Date.now());
  // A patient the nurse picked by hand, kept only while the dentist stays on `base`.
  const [manual, setManual] = useState<{ id: string; base: string | null } | null>(null);
  // What this phone shows when the other nurse is missing.
  const [view, setView] = useState<'nurse1' | 'nurse2'>(role);

  useEffect(() => {
    let stop = false;
    let timer = 0;
    const poll = () => {
      if (document.hidden) { timer = window.setTimeout(poll, POLL_MS); return; }
      sayHello(room, team.id, { id: me, job: role, name: nameRef.current, follow: followRef.current ?? '' })
        .then(({ states, phones, now: server }) => {
          if (stop) return;
          setLive({ states, phones, offset: server - Date.now(), ok: true });
          const ds = dentistNames(phones);
          // One dentist online: follow them, also when the one we followed left.
          if (ds.length === 1) setFollow((f) => (f && sameName(f, ds[0]) ? f : ds[0]));
        })
        .catch(() => { if (!stop) setLive((l) => ({ ...l, ok: false })); })
        .finally(() => { if (!stop) timer = window.setTimeout(poll, POLL_MS); });
    };
    poll();
    return () => { stop = true; window.clearTimeout(timer); };
  }, [room, team.id, me, role]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const dentists = dentistNames(live.phones);
  const followName = follow ?? (dentists.length === 1 ? dentists[0] : null);
  const state = followName ? live.states.find((x) => sameName(x.dentist, followName)) ?? null : null;
  const followGone = follow !== null && !dentists.some((d) => sameName(d, follow));
  const showPicker = dentists.length > 1 || (followGone && dentists.length > 0);
  const otherJob = role === 'nurse1' ? 'nurse2' : 'nurse1';
  const solo = !!followName && !live.phones.some((p) => p.id !== me && p.job === otherJob && sameName(p.follow, followName));
  const reading = solo ? view : role;

  const followed = state?.scenarioId ?? null;
  const shownId = manual && manual.base === followed ? manual.id : followed;
  const scenario = getScenario(shownId);
  const dr = drName(followName ?? '');
  const timed = !!state && state.startedAt !== null && (state.phase === 'chart' || state.phase === 'sign');
  const left = timed ? Math.max(0, limit - Math.floor((now + live.offset - (state.startedAt ?? 0)) / 1000)) : limit;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const following = getScenario(followed);

  let status = `Waiting for ${dr} to open a patient.`;
  if (!followName && dentists.length > 1) status = `${team.name} has ${dentists.length} dentists. Tap the one you are helping.`;
  else if (followGone && dentists.length > 1) status = `${dr} left. Tap the dentist you are helping.`;
  else if (!followName) status = `Waiting for ${team.name}'s dentist to join.`;
  else if (state && following) {
    const who = following.first;
    if (state.phase === 'visit' || state.phase === 'talk') status = `${dr} is seeing ${who}. Get ready to read.`;
    else if (state.phase === 'draft') status = `Scribby is writing ${who}'s chart.`;
    else if (state.phase === 'chart') status = `${dr} is charting ${who}. Read out what they need!`;
    else if (state.phase === 'sign') status = `${dr} is about to sign ${who}'s chart.`;
    else if (state.phase === 'result') status = `${who}'s chart is signed${state.points !== null ? `: ${state.points} points` : ''}.`;
    else status = `${dr} is picking the next patient.`;
  }
  const peeking = !!scenario && !!following && scenario.id !== following.id;

  return (
    <div className="sq q-nurse" data-phase={state?.phase ?? 'idle'}>
      <div className="q-app">
        <Hud team={team} muted={muted} onToggleSound={onToggleSound}>
          <span className={`q-chip q-clock${timed && left <= 10 ? ' low' : ''}`} aria-label="Time left for this chart">⏱ {clock}</span>
        </Hud>

        <div className="q-status" role="status">
          <b>{info.name}{name ? ` (${name.toUpperCase()})` : ''} · {roleInfo(reading, team).reads}</b>
          <span>{live.ok ? status : 'Lost the connection. Trying again…'}</span>
          {peeking && <span className="q-solo">You are reading {scenario.first}. Tap {following.first.toUpperCase()} ● to go back.</span>}
          {solo && <span className="q-solo">No {otherJob === 'nurse1' ? 'Nurse 1' : 'Nurse 2'} yet, so you can read both.</span>}
        </div>

        {showPicker && (
          <div className="q-ntabs q-dentists" role="radiogroup" aria-label="Dentist you are helping">
            {dentists.map((d) => {
              const on = !!followName && sameName(d, followName);
              return (
                <button key={d} className={on ? 'on' : ''} role="radio" aria-checked={on} onClick={() => { sfx.select(); setFollow(d); setManual(null); }}>
                  {drName(d)}
                </button>
              );
            })}
          </div>
        )}

        <section className="q-notes" aria-label={roleInfo(reading, team).reads}>
          {solo && (
            <div className="q-ntabs q-views" role="radiogroup" aria-label="What to read">
              {(['nurse1', 'nurse2'] as const).map((r) => (
                <button key={r} className={reading === r ? 'on' : ''} role="radio" aria-checked={reading === r} onClick={() => { sfx.select(); setView(r); }}>
                  {roleInfo(r, team).reads}
                </button>
              ))}
            </div>
          )}
          <div className="q-ntabs" role="radiogroup" aria-label="Patient">
            {patients.map((s) => (
              <button
                key={s.id}
                className={shownId === s.id ? 'on' : ''}
                role="radio"
                aria-checked={shownId === s.id}
                onClick={() => { sfx.select(); setManual({ id: s.id, base: followed }); }}
              >
                {s.number} {s.first.toUpperCase()}{followed === s.id ? ' ●' : ''}
              </button>
            ))}
          </div>
          {!scenario ? (
            <p className="q-sub">The patient shows up here when {dr} opens one.</p>
          ) : (
            <>
              <h2 className="q-h2">{scenario.patientName.toUpperCase()}, {scenario.age}</h2>
              <div className="q-nbody">
                {reading === 'nurse2' && (
                  <dl className="q-record">
                    {scenario.record.map(([k, v, alert]) => (
                      <div key={k}><dt>{k.toUpperCase()}</dt><dd className={alert ? 'alert' : ''}>{v}</dd></div>
                    ))}
                  </dl>
                )}
                {reading === 'nurse1' && team.mode === 'manual' && (
                  <div className="q-scribble">{scenario.doctorNotes.map((l) => <p key={l}>{l}</p>)}</div>
                )}
                {reading === 'nurse1' && team.mode !== 'manual' && scenario.visit.map((l, i) => (
                  <div key={i} className="q-nline"><b className={l.who}>{l.who === 'dentist' ? dr : scenario.first.toUpperCase()}</b>{l.text}</div>
                ))}
              </div>
            </>
          )}
        </section>
        <ChangeTeam label="CHANGE TEAM OR JOB" line="Your dentist will lose you." onChange={onChangeTeam} />
      </div>
    </div>
  );
}

// ── Pixel scene ──

function SceneCanvas({ state, onTap }: { state: SceneState; onTap: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const loop = (t: number) => {
      drawScene(ctx, latest.current, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={canvas}
      width={256}
      height={144}
      onClick={onTap}
      aria-label="Pixel dental clinic with the dentist, the patient and Scribby the AI robot"
    />
  );
}
