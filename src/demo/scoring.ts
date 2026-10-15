// Scoring for Scribe Quest.
//
// Fairness: points only count for cards a player checked themselves (pressed
// NEXT on). An AI team that signs Scribby's draft without checking earns
// nothing for it, yet every wrong card in the signed chart still hurts the
// patient. Safety outweighs speed, so a careful manual team can beat a fast,
// careless AI team.

import { TIME_LIMIT, type Answers, type Scenario, type TeamMode } from './scenarios';

export const POINTS = {
  card: 100,
  safetyCard: 50,
  perSecondLeft: 2,
  heartLost: -150,
};

export interface CardResult {
  key: string;
  correct: boolean;
}

export interface Badge {
  label: string;
  good: boolean;
}

export interface ScoreSummary {
  scenarioId: string;
  mode: TeamMode;
  durationSec: number;
  timedOut: boolean;
  points: number;
  grade: string;
  /** Hearts the patient keeps, out of 3. */
  hearts: number;
  correct: number;
  total: number;
  checked: number;
  /** Safety cards wrong at signature: harm that reaches the patient. */
  safetyIssues: number;
  aiErrorsCaught: number;
  aiErrorsTotal: number;
  caughtErrorIds: string[];
  missedErrorIds: string[];
  /** AI teams: Scribby's wrong picks that the player confirmed. */
  rubberStamps: number;
  badges: Badge[];
  fields: CardResult[];
  breakdown: { cards: number; safety: number; speed: number; hearts: number };
}

export function gradeFor(points: number): string {
  return points >= 1100 ? 'S' : points >= 900 ? 'A' : points >= 650 ? 'B' : points >= 400 ? 'C' : 'D';
}

export function scoreRun(
  scenario: Scenario,
  mode: TeamMode,
  answers: Answers,
  confirmed: Record<string, boolean>,
  durationSec: number,
  timedOut: boolean,
  limit: number = TIME_LIMIT,
): ScoreSummary {
  const isAi = mode !== 'manual';
  const rows = scenario.cards.map((c) => {
    const value = answers[c.key];
    return { card: c, value, correct: value === c.truth, checked: !!confirmed[c.key] };
  });
  const earned = rows.filter((r) => r.correct && r.checked);
  const safeEarned = earned.filter((r) => r.card.critical).length;
  const safetyIssues = rows.filter((r) => r.card.critical && !r.correct).length;
  const heartsLost = Math.min(3, safetyIssues);
  const used = Math.min(limit, Math.round(durationSec));
  const left = timedOut ? 0 : limit - used;

  const breakdown = {
    cards: earned.length * POINTS.card,
    safety: safeEarned * POINTS.safetyCard,
    speed: left * POINTS.perSecondLeft,
    hearts: heartsLost * POINTS.heartLost,
  };
  const points = Math.max(0, breakdown.cards + breakdown.safety + breakdown.speed + breakdown.hearts);

  const caught = isAi
    ? scenario.errors.filter((e) => rows.find((r) => r.card.key === e.field && r.correct && r.checked)).map((e) => e.id)
    : [];
  const missed = isAi ? scenario.errors.filter((e) => !caught.includes(e.id)).map((e) => e.id) : [];
  const rubberStamps = isAi
    ? scenario.errors.filter((e) => rows.find((r) => r.card.key === e.field && r.checked && r.value === r.card.ai)).length
    : 0;

  const badges: Badge[] = [];
  if (heartsLost === 0) badges.push({ label: 'CAREFUL HANDS', good: true });
  if (isAi && caught.length === scenario.errors.length) badges.push({ label: 'EAGLE EYE', good: true });
  if (!isAi && earned.length === rows.length) badges.push({ label: 'PERFECT NOTES', good: true });
  if (left >= 40) badges.push({ label: 'SPEED DEMON', good: true });
  if (rubberStamps >= 1 && rubberStamps === scenario.errors.length) badges.push({ label: 'RUBBER STAMP', good: false });
  if (timedOut) badges.push({ label: 'OUT OF TIME', good: false });

  return {
    scenarioId: scenario.id,
    mode,
    durationSec: used,
    timedOut,
    points,
    grade: gradeFor(points),
    hearts: 3 - heartsLost,
    correct: rows.filter((r) => r.correct).length,
    total: rows.length,
    checked: rows.filter((r) => r.checked).length,
    safetyIssues,
    aiErrorsCaught: caught.length,
    aiErrorsTotal: isAi ? scenario.errors.length : 0,
    caughtErrorIds: caught,
    missedErrorIds: missed,
    rubberStamps,
    badges,
    fields: rows.map((r) => ({ key: r.card.key, correct: r.correct })),
    breakdown,
  };
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
