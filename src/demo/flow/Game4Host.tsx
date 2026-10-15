// Game 4 · Build StyleMod's AI, on the projector. The board only switches
// between big steps; teams build and fix on their phones at their own pace,
// and every step keeps every pick. One focal thing per step: who is in each
// team, how far each team has got, six months later, the chaos cards, which
// box each team fixes, version 1 against version 2.

import type { ReactNode } from 'react';
import { Lock, RotateCcw, Timer } from 'lucide-react';
import { QrCode } from '../ui';
import { ChaosMeters, CountUp, DebateClock, Hits, Meters, ResultColumn, ScoreChart, SixMonths, Stories, TeamHead } from './Game4Board';
import { secondsLeft, type FlowPlayer, type FlowView } from './api';
import {
  BEFORE,
  BOX_IDS,
  CHAOS,
  G4_CHAOS_STEPS,
  G4_CLOSING,
  G4_PHASES,
  G4_RERUN_STEPS,
  G4_RUN_STEPS,
  BOXES,
  G4_TEAMS,
  ALL_SYSTEMS,
  beatsPercent,
  strongCard,
  systemStats,
  boxLabel,
  debateBox,
  deriveTeams,
  getBox,
  getCard,
  teamRuns,
  winners,
} from '../game4';
import './game4.css';

interface View {
  body: ReactNode;
  say: string;
  nextLabel: string;
  key: string;
  alert?: boolean;
}

type Send = (action: string, extra?: Record<string, unknown>) => Promise<FlowView | undefined>;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
const groupOf = (team: string) => G4_TEAMS.find((t) => t.id === team)!.group;

/**
 * Before the presenter moves on past the build or the fix step: which teams
 * are not finished, as one question ("Team 2 has 5 of 7 boxes. Move on
 * anyway?"), or null when everyone is done.
 */
export function g4MoveOnQuestion(from: string, to: string, players: FlowPlayer[]): string | null {
  const order = G4_PHASES as readonly string[];
  const i = order.indexOf(from);
  const j = order.indexOf(to);
  if (j < 0 || j <= Math.max(i, -1)) return null;
  const teams = deriveTeams(players).filter((t) => t.members > 0);
  const lines: string[] = [];
  const build = order.indexOf('g4_build');
  const fix = order.indexOf('g4_fix');
  if (i <= build && j > build) {
    for (const t of teams) if (t.decided < BOX_IDS.length) lines.push(`Team ${t.team} has ${t.decided} of ${BOX_IDS.length} boxes.`);
  }
  if (i >= build && i <= fix && j > fix) {
    for (const t of teams) if (!t.fixCard) lines.push(`Team ${t.team} has not picked its fix yet.`);
  }
  return lines.length ? `${lines.join(' ')} Move on anyway? Their picks are kept, and you can come back.` : null;
}

/** "Survives both chaos cards" or "Breaks at Box 1 · Business decision". */
function breaksLine(run: { chaos: Array<{ broke: string | null }> }): string {
  const broke = run.chaos.filter((h) => h.broke).map((h) => boxLabel(h.broke!));
  return broke.length ? `Breaks at ${broke.join(' and ')}` : 'Survives both chaos cards';
}

/** The projector's view of the Game 4 step on screen. */
export function g4View({ flow, players, now, send, joinUrl, room }: { flow: FlowView; players: FlowPlayer[]; now: number; send: Send; joinUrl: string; room: string }): View {
  const teams = deriveTeams(players);
  const anyPicks = players.some((p) => p.g4 && (Object.keys(p.g4.picks ?? {}).length > 0 || p.g4.fix));
  const clockTools = (
    <div className="fh-tools g4-tools">
      <button className="fh-tool" onClick={() => void send('g4clock', { op: 'extend' })}>+1 minute</button>
      <button className="fh-tool" onClick={() => void send('g4clock', { op: 'restart' })}><RotateCcw size="0.9em" /> Restart clock</button>
    </div>
  );

  if (flow.phase === 'g4_intro') {
    const restart = () => {
      const n = players.filter((p) => p.g4 && (Object.keys(p.g4.picks ?? {}).length > 0 || p.g4.fix)).length;
      if (window.confirm(`Start Game 4 again? This clears the picks ${n} player${n === 1 ? ' has' : 's have'} made: every team's boxes and fixes.`)) void send('g4reset');
    };
    return {
      key: 'g4:intro',
      nextLabel: 'START BUILDING',
      say: 'Teams sit together: Group A is Team 1 on the left, B is Team 2 in the middle, C is Team 3 on the right. Each phone picks one card per box; the team\'s card is the one most members pick.',
      body: (
        <div className="g4 g4-intro">
          <h1 className="g4-title"><span>GAME 4 ·</span> BUILD STYLEMOD'S AI</h1>
          <p className="fh-lead g4-lead">Your team builds StyleMod's AI marketing system: 7 boxes, one card each. Then we run it for six months.</p>
          <div className="g4-intro-row">
          <section className="fh-card fh-join g4-join">
            <span className="fh-join-kicker">JOIN ON YOUR PHONE</span>
            <QrCode text={joinUrl} />
            <span className="fh-join-url">{joinUrl.replace(/^https?:\/\//, '').replace(/\?room=.*$/, '')}</span>
            <span className="fh-join-code">ROOM <b>{room.toUpperCase()}</b></span>
            {!flow.settings.joinOpen && <span className="fh-join-closed"><Lock size="1em" /> Joining is closed</span>}
          </section>
          <div className="g4-teams">
            {G4_TEAMS.map((t) => {
              const mine = players.filter((p) => p.g1NoteId === t.group);
              const many = mine.length > 16 ? ' fh-names--tiny' : mine.length > 9 ? ' fh-names--small' : '';
              return (
                <section key={t.id} className="g4-team" data-note={t.group}>
                  <TeamHead team={t.id} extra={`GROUP ${t.group}`} />
                  <div className="g4-team-body">
                    <div className={`fh-names${many}`}>
                      {mine.map((p) => <span key={p.id}>{p.nickname}</span>)}
                      {!mine.length && <em className="fh-names-empty">Nobody in Group {t.group}</em>}
                    </div>
                    <p className="g4-count">{people(mine.length)}</p>
                  </div>
                </section>
              );
            })}
          </div>
          </div>
          {anyPicks && (
            <div className="fh-tools g4-tools">
              <button className="fh-tool" onClick={restart}><RotateCcw size="0.9em" /> Start Game 4 again</button>
            </div>
          )}
        </div>
      ),
    };
  }

  if (flow.phase === 'g4_build') {
    const endsAt = (flow.g4.buildAt ?? flow.phaseStartedAt) + flow.settings.g4BuildSec * 1000 + flow.g4.buildExtraMs;
    const left = secondsLeft(endsAt, now);
    const behind = teams.filter((t) => t.members > 0 && t.decided < BOX_IDS.length);
    return {
      key: 'g4:build',
      nextLabel: 'RUN SIX MONTHS',
      say: left === 0
        ? `Time is up, but nothing closes by itself. ${behind.length ? `${behind.map((t) => `Team ${t.team}`).join(' and ')} still ${behind.length === 1 ? 'has' : 'have'} open boxes.` : 'Every team is done: press RUN SIX MONTHS.'}`
        : 'Walk around. Ask a team: which box was hardest to agree on? Teams work at their own pace; NEXT asks first if a team is not done.',
      body: (
        <div className="g4 g4-build">
          <div className="g4-head">
            <h1 className="fh-h1 g4-h1">Build your team's StyleMod system: 7 boxes, one card each.</h1>
            <div className={`g4-clock${left === 0 ? ' over' : left <= 30 ? ' low' : ''}`} role="timer"><Timer size="0.7em" aria-hidden="true" /> {left === 0 ? "TIME'S UP" : clock(left)}</div>
          </div>
          <div className="g4-teams">
            {teams.map((t) => (
              <section key={t.team} className={`g4-team${t.members ? '' : ' g4-team--empty'}`} data-note={groupOf(t.team)}>
                <TeamHead team={t.team} />
                <div className="g4-team-body g4-team-body--center">
                  <div className="g4-squares" aria-label={`${t.decided} of 7 boxes decided`}>
                    {BOX_IDS.map((id) => <span key={id} className={`g4-sq${t.system[id] ? ' on' : ''}`}>{id}</span>)}
                  </div>
                  <p className="g4-big"><b>{t.decided}</b> of 7 boxes</p>
                  <p className="g4-count">{t.members ? `${people(t.members)}${t.active < t.members ? ` · ${t.active} picking` : ''}` : 'Nobody in this team'}</p>
                </div>
              </section>
            ))}
          </div>
          {clockTools}
        </div>
      ),
    };
  }

  if (flow.phase === 'g4_run' && G4_RUN_STEPS[flow.step] === 'systems') {
    return {
      key: 'g4:systems',
      nextLabel: 'SIX MONTHS LATER',
      say: 'One person per team comes up and explains the system in 30 seconds: which card for each box, and why.',
      body: (
        <div className="g4 g4-systems">
          <h1 className="fh-h1 g4-h1 g4-h1--center">Each team: explain your system in 30 seconds.</h1>
          <div className="g4-teams">
            {teams.map((t) => (
              <section key={t.team} className="g4-team" data-note={groupOf(t.team)}>
                <TeamHead team={t.team} />
                {t.members ? (
                  <ol className="g4-system">
                    {BOXES.map((b) => (
                      <li key={b.id}>
                        <span>{b.id} · {b.name}</span>
                        <p>{getCard(b.id, t.system[b.id])?.text ?? 'Not decided'}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <em className="fh-names-empty g4-system-empty">Nobody in this team</em>
                )}
              </section>
            ))}
          </div>
        </div>
      ),
    };
  }

  if (flow.phase === 'g4_run' && G4_RUN_STEPS[flow.step] === 'debate') {
    const d = debateBox(teams);
    if (d) {
      const box = getBox(d.box)!;
      return {
        key: `g4:debate:${d.box}`,
        nextLabel: 'CHAOS CARDS',
        say: `Team ${d.convince} has 30 seconds, then Team ${d.listen} answers. Ask the third team: who convinced you?`,
        body: (
          <div className="g4 g4-debate">
            <p className="fh-kicker">DEBATE · {boxLabel(d.box).toUpperCase()}</p>
            <h1 className="fh-h1 g4-h1 g4-h1--center">{box.question}</h1>
            <div className="g4-choices">
              {d.choices.map((c) => (
                <div key={c.team} className={`g4-choice${c.team === d.convince || c.team === d.listen ? ' on' : ''}`} data-note={groupOf(c.team)}>
                  <span>TEAM {c.team} CHOSE</span>
                  <p>{getCard(d.box, c.card)!.text}</p>
                </div>
              ))}
            </div>
            <div className="g4-convince">
              <p>Team {d.convince}, convince Team {d.listen} in 30 seconds.</p>
              <DebateClock />
            </div>
          </div>
        ),
      };
    }
  }

  if (flow.phase === 'g4_run') {
    const debate = debateBox(teams);
    const worst = [...teams].filter((t) => t.members).sort((a, b) => teamRuns(a).run.score - teamRuns(b).run.score)[0];
    return {
      key: 'g4:run',
      nextLabel: debate ? 'DEBATE' : 'CHAOS CARDS',
      say: worst && teamRuns(worst).run.stories.length
        ? `Ask Team ${worst.team}: why did Box ${teamRuns(worst).run.stories[0].box} do this? "${teamRuns(worst).run.stories[0].text}"`
        : 'Ask each team: which number surprised you?',
      body: (
        <div className="g4 g4-run">
          <SixMonths />
          <div className="g4-teams g4-teams--late">
            {teams.map((t) => (
              <ResultColumn key={t.team} team={t}>
                <Meters before={BEFORE} after={teamRuns(t).run} />
                <Stories run={teamRuns(t).run} />
              </ResultColumn>
            ))}
          </div>
        </div>
      ),
    };
  }

  if (flow.phase === 'g4_chaos') {
    const step = G4_CHAOS_STEPS[flow.step] ?? 'hit';
    if (step === 'cards') {
      return {
        key: 'g4:chaos-cards',
        nextLabel: 'HIT THE SYSTEMS',
        say: 'Read both cards aloud. Ask: which of your boxes would stop this? Then press NEXT.',
        body: (
          <div className="g4 g4-chaos">
            <h1 className="fh-h1 g4-h1 g4-h1--center">Two chaos cards hit every system.</h1>
            <div className="g4-chaos-cards">
              {CHAOS.map((c, i) => (
                <article key={c.id} className="g4-chaos-card" style={{ animationDelay: `${i * 350}ms` }}>
                  <header><span className="g4-chaos-letter">{c.id}</span><span>CHAOS CARD {c.id}</span></header>
                  <h2>{c.name}</h2>
                  <p className="g4-chaos-concept">({c.concept})</p>
                  <p className="g4-chaos-text">{c.text}</p>
                </article>
              ))}
            </div>
          </div>
        ),
      };
    }
    return {
      key: 'g4:chaos-hit',
      nextLabel: 'FIX ONE BOX',
      say: 'Point at each broken box. Ask the team: why did that card let it happen? Next, each team may fix ONE box.',
      body: (
        <div className="g4 g4-chaos">
          <h1 className="fh-h1 g4-h1 g4-h1--center">Did your system survive both chaos cards?</h1>
          <div className="g4-teams">
            {teams.map((t) => {
              const r = teamRuns(t);
              return (
                <ResultColumn key={t.team} team={t}>
                  <Hits run={r.chaos} />
                  <ChaosMeters before={r.run} after={r.chaos} />
                </ResultColumn>
              );
            })}
          </div>
        </div>
      ),
    };
  }

  if (flow.phase === 'g4_fix') {
    const endsAt = (flow.g4.fixAt ?? flow.phaseStartedAt) + flow.settings.g4FixSec * 1000 + flow.g4.fixExtraMs;
    const left = secondsLeft(endsAt, now);
    return {
      key: 'g4:fix',
      nextLabel: 'RUN AGAIN',
      say: 'Each team changes ONE box. Their phones suggest the box that broke, but any box may be fixed. Ask: why that box?',
      body: (
        <div className="g4 g4-build">
          <div className="g4-head">
            <h1 className="fh-h1 g4-h1">Fix ONE box: the one that broke, or any other.</h1>
            <div className={`g4-clock${left === 0 ? ' over' : left <= 30 ? ' low' : ''}`} role="timer"><Timer size="0.7em" aria-hidden="true" /> {left === 0 ? "TIME'S UP" : clock(left)}</div>
          </div>
          <div className="g4-teams">
            {teams.map((t) => {
              const broke = teamRuns(t).chaos.chaos.filter((h) => h.broke).map((h) => h.broke!);
              const state = t.fixCard ? 'done' : t.fixBox ? 'box' : 'none';
              return (
                <section key={t.team} className={`g4-team${t.members ? '' : ' g4-team--empty'}`} data-note={groupOf(t.team)}>
                  <TeamHead team={t.team} />
                  <div className="g4-team-body g4-team-body--center">
                    <p className="g4-broke">{broke.length ? `Broke at ${broke.map((b) => `Box ${b}`).join(' and ')}` : 'Survived both cards'}</p>
                    <div className={`g4-fix g4-fix--${state}`}>
                      {state === 'done' ? (
                        <><span className="g4-fix-tick" aria-hidden="true">✓</span><b>Fixed {boxLabel(t.fixBox!)}</b></>
                      ) : state === 'box' ? (
                        <b>Fixing {boxLabel(t.fixBox!)}…</b>
                      ) : (
                        <b>{t.members ? 'Choosing a fix…' : 'Nobody in this team'}</b>
                      )}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
          {clockTools}
        </div>
      ),
    };
  }

  // g4_rerun
  const step = G4_RERUN_STEPS[flow.step] ?? 'close';
  const won = winners(teams);
  if (step === 'how') {
    const stats = systemStats();
    const playing = teams.filter((t) => t.members > 0);
    return {
      key: 'g4:how',
      nextLabel: 'LAST WORD',
      say: `There were ${ALL_SYSTEMS.toLocaleString('en-US')} possible systems. Read the strong card for each box, then ask: which one would your team argue with?`,
      body: (
        <div className="g4 g4-how">
          <h1 className="fh-h1 g4-h1 g4-h1--center">How the simulation scored your system</h1>
          <div className="g4-how-grid">
            <section className="g4-how-model">
              <p className="g4-how-label">THE STRONG CARD IN EACH BOX</p>
              <ol>
                {BOXES.map((b) => (
                  <li key={b.id}>
                    <span>{b.id} · {b.name}</span>
                    <p>{strongCard(b).text}</p>
                  </li>
                ))}
              </ol>
            </section>
            <section className="g4-how-rules">
              <div className="g4-how-stats">
                <p><b>{ALL_SYSTEMS.toLocaleString('en-US')}</b> possible systems<small>3 cards × 7 boxes</small></p>
                <p><b>{stats.survive}</b> survive both chaos cards</p>
                <p><b>{stats.atTop}</b> {stats.atTop === 1 ? 'scores' : 'score'} {stats.top}</p>
              </div>
              <p className="g4-how-label">HOW IT WORKS</p>
              <ul className="g4-how-steps">
                <li>Each box has one <b>strong</b> card, one <b>tempting trap</b> and one <b>weak</b> card.</li>
                <li>Each card moves three numbers from StyleMod before the AI: marketer hours (90), harmful emails (6 per 100,000), unsubscribes (0%).</li>
                <li><b>Automation bias</b> breaks your system at Box 4 unless it is strong, or at Box 5 if everything is AUTO: +5 harmful emails.</li>
                <li><b>Wrong KPI</b> breaks it at Box 7 unless it is strong, or at Box 1 if the goal was more clicks: +15% unsubscribes.</li>
                <li>Score = 100 − (hours − 48) ÷ 4 − 3 × harmful emails − (unsubscribes + 20) ÷ 2.</li>
              </ul>
              <ScoreChart teams={playing.map((t) => ({ team: t.team, score: teamRuns(t).rerun.score }))} />
              <p className="g4-how-teams">
                {playing.map((t) => {
                  const score = teamRuns(t).rerun.score;
                  return (
                    <span key={t.team} data-note={groupOf(t.team)}>
                      <b>TEAM {t.team}</b> {score} · better than {beatsPercent(score)}%
                    </span>
                  );
                })}
              </p>
            </section>
          </div>
        </div>
      ),
    };
  }

  if (step === 'close') {
    return {
      key: 'g4:close',
      nextLabel: 'THE END',
      say: 'Read the line aloud, slowly. Then ask: which box did your team learn most from?',
      body: (
        <figure className="fh-quote g4-close">
          <blockquote>{G4_CLOSING}</blockquote>
          <figcaption>GAME 4 · BUILD STYLEMOD'S AI</figcaption>
        </figure>
      ),
    };
  }
  return {
    key: 'g4:rerun',
    nextLabel: 'HOW IT WAS SCORED',
    say: `${won.length ? `Congratulate ${won.map((t) => `Team ${t}`).join(' and ')}. ` : ''}Each team explains its fix out loud in one sentence: which box, which card, and why.`,
    body: (
      <div className="g4 g4-run g4-rerun">
        <h1 className="fh-h1 g4-h1 g4-h1--center">Version 2, hit by both chaos cards again. Who built the best system?</h1>
        <div className="g4-teams">
          {teams.map((t) => {
            const r = teamRuns(t);
            const win = t.members > 0 && won.includes(t.team);
            return (
              <ResultColumn key={t.team} team={t} win={win}>
                <p className="g4-fixed">{t.fixCard ? `Fixed ${boxLabel(t.fixBox!)}` : 'No box fixed'}</p>
                <p className={`g4-now${r.rerun.chaos.some((h) => h.broke) ? ' bad' : ''}`}>{breaksLine(r.rerun)}</p>
                <Meters before={r.chaos} after={r.rerun} compact />
                <div className="g4-score">
                  <span>SCORE</span>
                  <b><CountUp from={r.chaos.score} to={r.rerun.score} /></b>
                  <small>was {r.chaos.score}</small>
                </div>
              </ResultColumn>
            );
          })}
        </div>
      </div>
    ),
  };
}

