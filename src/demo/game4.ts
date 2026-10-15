// Game 4 · Build StyleMod's AI (Part 3 of the class, 60:00 to 90:00).
//
// Each team (Group A = Team 1, B = Team 2, C = Team 3) builds one AI-enabled
// decision system for StyleMod, the online clothing retailer from the
// marketing vignettes, in the session guide's seven architecture elements by picking
// one card per box. The projector then "runs StyleMod for six months", hits
// every system with two chaos cards (wrong KPI, automation bias), lets each
// team fix ONE box, and runs it again.
//
// Everything Game 4 knows lives here: the text, the effects, the chaos rules
// and the pure functions the Worker, the projector and the phones all use.
// No em dashes in anything shown on screen.

export type TeamId = '1' | '2' | '3';
export type Grade = 'S' | 'T' | 'W';

export interface G4Card {
  /** Box number plus a, b or c in the order shown (the same for everyone). */
  id: string;
  text: string;
  /** Strong, tempting-but-flawed or weak. Never shown to students. */
  grade: Grade;
  /** Marketer hours per campaign, harmful emails per 100,000 sent, unsubscribe change in %. */
  m: number;
  e: number;
  b: number;
  /** One line for the six-months story when this card is in the system (T and W only). */
  story?: string;
}

export interface G4Box {
  id: string;
  name: string;
  question: string;
  /** Already in the shuffled order every phone shows. */
  cards: G4Card[];
}

// The answer cards of each box are listed in the order the phones show them
// (shuffled once, so the strong card is not always first).
export const BOXES: G4Box[] = [
  {
    id: '1',
    name: 'Business decision',
    question: "What decision does StyleMod's management need to make, and what is the real business objective?",
    cards: [
      { id: '1a', grade: 'T', m: 10, e: 1, b: 10, text: 'Expand the AI into pricing, recommendations and customer service now, to get even more clicks.', story: 'Clicks became the goal, so the AI learned to push urgent discounts.' },
      { id: '1b', grade: 'S', m: 0, e: 0, b: -5, text: "Expand step by step, only where sales grow and customers' trust and inclusivity hold." },
      { id: '1c', grade: 'W', m: 0, e: 1, b: 0, text: 'Change nothing: the numbers already look great.', story: 'Nobody set a goal beyond the first results, so nobody knows what to watch.' },
    ],
  },
  {
    id: '2',
    name: 'Data and evidence',
    question: "Which inputs should StyleMod's AI use, and which outcomes or signals should be measured?",
    cards: [
      { id: '2a', grade: 'W', m: 0, e: 1, b: 0, text: "Only last year's open and click rates.", story: 'Old clicks say nothing about who is upset or leaving.' },
      { id: '2b', grade: 'S', m: 0, e: -1, b: 0, text: 'Purchases, browsing and loyalty data, plus complaints, unsubscribes and a check for customers the data misses.' },
      { id: '2c', grade: 'T', m: 0, e: 2, b: 0, text: 'All browsing data, including health and baby products. More data is better.', story: 'The AI guessed private things, like pregnancy, from browsing.' },
    ],
  },
  {
    id: '3',
    name: 'AI role',
    question: "What should StyleMod's AI do in this process, and what should it predict or generate?",
    cards: [
      { id: '3a', grade: 'W', m: -20, e: 0, b: -3, text: 'It only sorts customers into groups. Marketers still write every email.', story: 'Marketers still write every email, so little time is saved.' },
      { id: '3b', grade: 'T', m: -60, e: 3, b: -10, text: 'It writes each email and sends it to customers by itself.', story: 'The AI acts alone, so its mistakes go straight to customers.' },
      { id: '3c', grade: 'S', m: -50, e: 0, b: -10, text: 'It predicts who will buy or leave, drafts several messages, and flags sensitive topics.' },
    ],
  },
  {
    id: '4',
    name: 'Human judgment',
    question: "Where do StyleMod's marketers need to use their own judgment, and which AI outputs need extra care?",
    cards: [
      { id: '4a', grade: 'T', m: 30, e: -1, b: 10, text: 'A marketer reads every email for every customer before it goes out.', story: 'Reading every email takes so long that marketers skim, and campaigns go out late.' },
      { id: '4b', grade: 'W', m: 0, e: 4, b: 0, text: "Marketers approve the AI's pick. Nobody checks unless a customer complains.", story: 'Nobody checks, so harmful emails reach customers.' },
      { id: '4c', grade: 'S', m: 5, e: -2, b: 0, text: 'A marketer picks the final message and checks every email on sensitive topics (health, pregnancy, money).' },
    ],
  },
  {
    id: '5',
    name: 'Decision right',
    question: 'When should the AI only advise (ADVISE), when should a marketer approve (APPROVE), and what, if anything, could run on its own (AUTO)?',
    cards: [
      { id: '5a', grade: 'S', m: 0, e: -1, b: 0, text: 'Seasonal discounts AUTO. Campaign messages APPROVE. Pricing and sensitive topics ADVISE.' },
      { id: '5b', grade: 'W', m: -5, e: 4, b: 0, text: 'Everything AUTO: the AI is 97% accurate.', story: 'The other 3% go straight to millions of customers.' },
      { id: '5c', grade: 'T', m: 20, e: 0, b: 8, text: 'Everything APPROVE: a marketer approves every single email.', story: 'Marketers approve everything, so their attention runs out.' },
    ],
  },
  {
    id: '6',
    name: 'Action and workflow',
    question: "What steps should happen from the AI's draft to sending the campaign, and who handles escalation when something goes wrong?",
    cards: [
      { id: '6a', grade: 'T', m: 0, e: 0, b: 0, text: 'The AI vendor is responsible for every bad email.', story: 'When something goes wrong, StyleMod waits for the vendor.' },
      { id: '6b', grade: 'W', m: 0, e: 1, b: 2, text: 'Nobody is named. Customer service handles complaints.', story: 'Complaints bounce between teams, and nobody fixes them.' },
      { id: '6c', grade: 'S', m: 0, e: -1, b: 0, text: 'The AI drafts, a marketer approves, then it is sent. Harmful emails go to the marketing manager within a day, and sending pauses.' },
    ],
  },
  {
    id: '7',
    name: 'Feedback and learning',
    question: 'Which feedback should StyleMod track, and how should the system be reviewed and improved over time?',
    cards: [
      { id: '7a', grade: 'W', m: 0, e: 1, b: 0, text: 'Ask the marketing team once a year if they like it.', story: 'Problems are found a year too late.' },
      { id: '7b', grade: 'T', m: 0, e: 1, b: 5, text: 'Open rates and clicks, every month.', story: 'Clicks went up, so everyone thought it worked.' },
      { id: '7c', grade: 'S', m: 3, e: -1, b: -5, text: 'Every month: sales, unsubscribes, complaints and a random check of sent emails. Pause if unsubscribes or complaints rise.' },
    ],
  },
];

export const BOX_IDS = BOXES.map((b) => b.id);
export const getBox = (id: string | null | undefined) => BOXES.find((b) => b.id === id);
export const getCard = (box: string | null | undefined, card: string | null | undefined) => getBox(box)?.cards.find((c) => c.id === card);
export const boxLabel = (id: string) => `Box ${id} · ${getBox(id)?.name ?? ''}`;

// ── Teams ──

export const G4_TEAMS: Array<{ id: TeamId; group: string; name: string; side: string }> = [
  { id: '1', group: 'A', name: 'Team 1', side: 'Left' },
  { id: '2', group: 'B', name: 'Team 2', side: 'Middle' },
  { id: '3', group: 'C', name: 'Team 3', side: 'Right' },
];
/** Group A plays as Team 1, B as Team 2, C as Team 3. */
export const teamOfGroup = (group: string | null | undefined): TeamId => G4_TEAMS.find((t) => t.group === group)?.id ?? '1';
export const teamInfo = (id: string) => G4_TEAMS.find((t) => t.id === id) ?? G4_TEAMS[0];

// ── StyleMod today, and the chaos cards ──

/** Before the AI. Lower is better for all three. */
export const BEFORE = { m: 90, e: 6, b: 0 };

export const METERS = [
  { key: 'm', label: 'Marketer work', unit: 'hours per campaign' },
  { key: 'e', label: 'Harmful emails sent', unit: 'per 100,000 emails' },
  { key: 'b', label: 'Unsubscribes', unit: '' },
] as const;

export type ChaosId = 'A' | 'D';

export const CHAOS: Array<{ id: ChaosId; name: string; concept: string; text: string; survive: string }> = [
  {
    id: 'A',
    name: 'Automation bias',
    concept: 'rubber stamp',
    text: 'Marketers now approve almost every AI email within seconds.',
    survive: 'Sensitive topics are always checked, so marketers stayed alert.',
  },
  {
    id: 'D',
    name: 'Wrong KPI',
    concept: 'clicks up, customers down',
    text: 'Opens and clicks keep climbing, but unsubscribes go up and fewer customers buy again.',
    survive: 'Unsubscribes were tracked, so the drift was caught.',
  },
];

export const G4_CLOSING =
  'Data-driven decision making is not more data or more AI. It is designing a decision process where the goal, the evidence, the AI, human judgment, decision rights, action and feedback are connected.';

/** The projector's steps inside the run, chaos and rerun phases. The run
 *  opens with every team's picks (each team explains), then the results; its
 *  debate step exists only when two teams chose differently somewhere. */
export const G4_RUN_STEPS = ['systems', 'results', 'debate'] as const;
export const G4_CHAOS_STEPS = ['cards', 'hit'] as const;
export const G4_RERUN_STEPS = ['results', 'how', 'close'] as const;

// ── Running the system ──

/** A team's system: one card id per box, or null for a box nobody decided. */
export type System = Record<string, string | null>;

export interface ChaosHit {
  id: ChaosId;
  /** The box where the system broke, or null if it survived. */
  broke: string | null;
  /** Why it broke, or why it survived. */
  line: string;
}

export interface RunResult {
  /** Marketer hours per campaign (at least 10). */
  m: number;
  /** Harmful emails per 100,000 sent (at least 0). */
  e: number;
  /** Unsubscribe change in %. */
  b: number;
  /** 0 to 100, 100 for the best possible system. */
  score: number;
  /** One line per weak or empty box, the most harmful first. */
  stories: Array<{ box: string; text: string }>;
  /** Empty without chaos. */
  chaos: ChaosHit[];
}

/** The card a box counts as: an empty box counts as its weak card (nobody designed it). */
function cardFor(box: G4Box, system: System): { card: G4Card; empty: boolean } {
  const card = box.cards.find((c) => c.id === system[box.id]);
  if (card) return { card, empty: false };
  return { card: box.cards.find((c) => c.grade === 'W')!, empty: true };
}

/** How much a card costs the score (lower is better). */
const penalty = (c: { m: number; e: number; b: number }) => c.m / 4 + 3 * c.e + c.b / 2;

/**
 * Score: 100 − (M − 48) / 4 − 3·E − (B + 20) / 2, rounded, never below 0.
 * The best possible system (M 48, E 0, B −20) scores 100; StyleMod before
 * the AI (90, 6, 0) would score 62. Fewer hours, fewer harmful emails and
 * fewer unsubscribes always score higher.
 */
export const scoreOf = (m: number, e: number, b: number) => Math.max(0, Math.round(100 - (m - 48) / 4 - 3 * e - (b + 20) / 2));

const CHAOS_A_BREAK: Record<string, string> = {
  '4T': 'Marketers were overwhelmed by reading every email, so they skim and approve.',
  '4W': 'Nobody checks, so a "Congratulations on your baby!" email reaches customers the AI only guessed were pregnant.',
  '5W': 'Everything is AUTO, so no marketer is ever asked to look.',
};
const CHAOS_D_BREAK: Record<string, string> = {
  '7T': 'Only clicks were tracked, so rising unsubscribes went unseen.',
  '7W': 'A yearly survey finds the lost customers a year too late.',
  '1T': 'The goal was more clicks, so the AI learned to push urgent discounts.',
};

/**
 * Six months of StyleMod with this system, optionally hit by both chaos
 * cards. Pure: the Worker, the projector and the phones get the same numbers.
 *
 * Card A (automation bias) breaks at Box 4 unless Box 4 is strong, else at Box 5
 * if Box 5 is weak: harmful emails +5. Card D (wrong KPI) breaks at Box 7 unless
 * Box 7 is strong, else at Box 1 if Box 1 is the tempting card: unsubscribes +15.
 */
export function runSystem(system: System, chaos: boolean): RunResult {
  let m = BEFORE.m;
  let e = BEFORE.e;
  let b = BEFORE.b;
  const stories: Array<{ box: string; text: string; weight: number }> = [];
  const grade: Record<string, Grade> = {};
  for (const box of BOXES) {
    const { card, empty } = cardFor(box, system);
    grade[box.id] = card.grade;
    m += card.m;
    e += card.e;
    b += card.b;
    if (card.grade !== 'S') {
      const strong = box.cards.find((c) => c.grade === 'S')!;
      stories.push({
        box: box.id,
        text: empty ? `Nobody decided Box ${box.id} · ${box.name}, so nobody owns it.` : card.story ?? '',
        weight: penalty(card) - penalty(strong),
      });
    }
  }
  const hits: ChaosHit[] = [];
  if (chaos) {
    const a = grade['4'] !== 'S' ? '4' : grade['5'] === 'W' ? '5' : null;
    hits.push({ id: 'A', broke: a, line: a ? CHAOS_A_BREAK[`${a}${grade[a]}`] : CHAOS[0].survive });
    if (a) e += 5;
    const d = grade['7'] !== 'S' ? '7' : grade['1'] === 'T' ? '1' : null;
    hits.push({ id: 'D', broke: d, line: d ? CHAOS_D_BREAK[`${d}${grade[d]}`] : CHAOS[1].survive });
    if (d) b += 15;
  }
  m = Math.max(10, m);
  e = Math.max(0, e);
  return {
    m,
    e,
    b,
    score: scoreOf(m, e, b),
    stories: stories.sort((x, y) => y.weight - x.weight || Number(x.box) - Number(y.box)).map(({ box, text }) => ({ box, text })),
    chaos: hits,
  };
}

// ── Every possible system (the reveal at the end) ──

/** 3 cards in each of 7 boxes. */
export const ALL_SYSTEMS = 3 ** BOXES.length;

let allScores: number[] | null = null;
let allSurvive = 0;
/** Score bins of 5 points (0-4 … 95-99, then 100), split by surviving both chaos cards. */
let allBins: Array<{ from: number; survive: number; broken: number }> = [];
const binOf = (score: number) => Math.min(20, Math.floor(score / 5));

/** Scores of all 2,187 systems after both chaos cards, lowest first (computed once). */
function scoreSpace() {
  if (!allScores) {
    const scores: number[] = [];
    allSurvive = 0;
    allBins = Array.from({ length: 21 }, (_, i) => ({ from: i * 5, survive: 0, broken: 0 }));
    for (let i = 0; i < ALL_SYSTEMS; i++) {
      const system: System = {};
      let n = i;
      for (const box of BOXES) {
        system[box.id] = box.cards[n % 3].id;
        n = Math.floor(n / 3);
      }
      const r = runSystem(system, true);
      scores.push(r.score);
      const survives = r.chaos.every((h) => !h.broke);
      if (survives) allSurvive += 1;
      allBins[binOf(r.score)][survives ? 'survive' : 'broken'] += 1;
    }
    allScores = scores.sort((a, b) => a - b);
  }
  return allScores;
}

/** How many of all possible systems survive both chaos cards, and how many reach the top score. */
export function systemStats() {
  const scores = scoreSpace();
  const top = scores[scores.length - 1];
  return { survive: allSurvive, top, atTop: scores.filter((s) => s === top).length };
}

/** How all possible systems spread over the score, for the reveal's chart. */
export function scoreHistogram() {
  scoreSpace();
  return { bins: allBins, binOf };
}

/** Share of all possible systems (0 to 100) that score lower than this score. */
export function beatsPercent(score: number): number {
  const scores = scoreSpace();
  let lower = 0;
  while (lower < scores.length && scores[lower] < score) lower += 1;
  return Math.floor((lower / scores.length) * 100);
}

/** The strong card of a box (the model answer). */
export const strongCard = (box: G4Box) => box.cards.find((c) => c.grade === 'S')!;

/** Version 2: version 1 with the team's one fixed box. */
export function applyFix(system: System, box: string | null, card: string | null): System {
  if (!box || !card || !getCard(box, card)) return system;
  return { ...system, [box]: card };
}

/** "+15%", "−20%", "0%". */
export const signedPct = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`;

// ── Teams' answers: what each phone picked, and the team's majority ──

export interface G4Pick {
  card: string;
  /** When this player picked this card (server time). */
  at: number;
}

/** One player's Game 4 answers, stored in the room. */
export interface G4PlayerState {
  /** Build step: one card per box. */
  picks: Record<string, G4Pick>;
  /** Fix step: the box this player wants to fix and, once picked, its new card. */
  fix: { box: string; at: number; card: string | null; cardAt: number } | null;
}

/** The most-picked card; a tie goes to the card picked first. Null if nobody picked. */
export function majority(votes: G4Pick[]): string | null {
  const tally = new Map<string, { n: number; first: number }>();
  for (const v of votes) {
    const t = tally.get(v.card);
    if (t) {
      t.n += 1;
      t.first = Math.min(t.first, v.at);
    } else tally.set(v.card, { n: 1, first: v.at });
  }
  let best: string | null = null;
  let top = { n: 0, first: Infinity };
  for (const [card, t] of tally) {
    if (t.n > top.n || (t.n === top.n && t.first < top.first)) {
      best = card;
      top = t;
    }
  }
  return best;
}

export interface G4TeamState {
  team: TeamId;
  members: number;
  /** Members who picked at least one card. */
  active: number;
  /** Version 1: the team's card for each box (null = nobody picked yet). */
  system: System;
  /** How many boxes have a team card. */
  decided: number;
  /** The box the team fixes (majority of members' choices) and its new card. */
  fixBox: string | null;
  fixCard: string | null;
  /** Live counts for the team's phones. */
  counts: Record<string, Record<string, number>>;
  fixBoxCounts: Record<string, number>;
  fixCardCounts: Record<string, number>;
}

/** Every team's system and live counts, from the players' stored picks. */
export function deriveTeams(players: Array<{ g1NoteId: string; g4?: G4PlayerState | null }>): G4TeamState[] {
  return G4_TEAMS.map((t) => {
    const mine = players.filter((p) => teamOfGroup(p.g1NoteId) === t.id);
    const system: System = {};
    const counts: Record<string, Record<string, number>> = {};
    for (const box of BOXES) {
      const votes = mine.map((p) => p.g4?.picks?.[box.id]).filter((v): v is G4Pick => !!v && !!getCard(box.id, v.card));
      system[box.id] = majority(votes);
      if (votes.length) {
        counts[box.id] = {};
        for (const v of votes) counts[box.id][v.card] = (counts[box.id][v.card] ?? 0) + 1;
      }
    }
    const fixes = mine.map((p) => p.g4?.fix).filter((f): f is NonNullable<G4PlayerState['fix']> => !!f && !!getBox(f.box));
    const fixBox = majority(fixes.map((f) => ({ card: f.box, at: f.at })));
    const fixBoxCounts: Record<string, number> = {};
    for (const f of fixes) fixBoxCounts[f.box] = (fixBoxCounts[f.box] ?? 0) + 1;
    // Only cards picked for the team's box, and never the card already there.
    const cardVotes = fixes
      .filter((f) => f.box === fixBox && f.card && f.card !== system[f.box] && getCard(f.box, f.card))
      .map((f) => ({ card: f.card!, at: f.cardAt }));
    const fixCardCounts: Record<string, number> = {};
    for (const v of cardVotes) fixCardCounts[v.card] = (fixCardCounts[v.card] ?? 0) + 1;
    return {
      team: t.id,
      members: mine.length,
      active: mine.filter((p) => p.g4 && Object.keys(p.g4.picks ?? {}).length > 0).length,
      system,
      decided: BOX_IDS.filter((id) => system[id]).length,
      fixBox,
      fixCard: majority(cardVotes),
      counts,
      fixBoxCounts,
      fixCardCounts,
    };
  });
}

/** What the room sends during Game 4: every team's system, and live counts for the asking phone's team only. */
export interface G4Public {
  teams: Array<Pick<G4TeamState, 'team' | 'members' | 'active' | 'system' | 'decided' | 'fixBox' | 'fixCard'>>;
  mine: Pick<G4TeamState, 'team' | 'counts' | 'fixBoxCounts' | 'fixCardCounts'> | null;
}

export function publicG4(teams: G4TeamState[], myTeam: string | null): G4Public {
  return {
    teams: teams.map(({ team, members, active, system, decided, fixBox, fixCard }) => ({ team, members, active, system, decided, fixBox, fixCard })),
    mine: (() => {
      const t = teams.find((x) => x.team === myTeam);
      return t ? { team: t.team, counts: t.counts, fixBoxCounts: t.fixBoxCounts, fixCardCounts: t.fixCardCounts } : null;
    })(),
  };
}

/** Version 1 and version 2 of one team, with and without chaos. */
export function teamRuns(t: { system: System; fixBox: string | null; fixCard: string | null }) {
  const v2 = applyFix(t.system, t.fixBox, t.fixCard);
  return {
    run: runSystem(t.system, false),
    chaos: runSystem(t.system, true),
    v2,
    rerun: runSystem(v2, true),
  };
}

/** The teams (with players) with the best version 2 score after chaos; more than one on a tie. */
export function winners(teams: Array<{ team: TeamId; members: number; system: System; fixBox: string | null; fixCard: string | null }>): TeamId[] {
  const playing = teams.filter((t) => t.members > 0).map((t) => ({ team: t.team, score: teamRuns(t).rerun.score }));
  const best = Math.max(...playing.map((t) => t.score));
  return playing.filter((t) => t.score === best).map((t) => t.team);
}

// ── Debate between teams, after the six months ──

export interface Debate {
  box: string;
  /** Each team that decided this box, and its card. */
  choices: Array<{ team: TeamId; card: string }>;
  /** The team with the strongest card argues first; the team with the weakest answers. */
  convince: TeamId;
  listen: TeamId;
}

/**
 * The ONE box where the teams disagree most: the most different cards, then
 * the biggest gap in what the cards did, then the lowest box number. Null if
 * every team (with players) chose the same card wherever they decided.
 */
export function debateBox(teams: Array<{ team: TeamId; members: number; system: System }>): Debate | null {
  const playing = teams.filter((t) => t.members > 0);
  let best: (Debate & { distinct: number; gap: number }) | null = null;
  for (const box of BOXES) {
    const choices = playing.filter((t) => getCard(box.id, t.system[box.id])).map((t) => ({ team: t.team, card: t.system[box.id]! }));
    const distinct = new Set(choices.map((c) => c.card)).size;
    if (distinct < 2) continue;
    const scored = choices.map((c) => ({ ...c, w: penalty(getCard(box.id, c.card)!) }));
    const strong = [...scored].sort((a, b) => a.w - b.w || Number(a.team) - Number(b.team))[0];
    const weak = [...scored].sort((a, b) => b.w - a.w || Number(a.team) - Number(b.team))[0];
    const gap = weak.w - strong.w;
    if (!best || distinct > best.distinct || (distinct === best.distinct && gap > best.gap)) {
      best = { box: box.id, choices, convince: strong.team, listen: weak.team, distinct, gap };
    }
  }
  if (!best) return null;
  const { box, choices, convince, listen } = best;
  return { box, choices, convince, listen };
}

/** How many projector steps a Game 4 phase has. */
export function g4Steps(phase: string, teams: Array<{ team: TeamId; members: number; system: System }>): number {
  if (phase === 'g4_run') return debateBox(teams) ? G4_RUN_STEPS.length : G4_RUN_STEPS.length - 1;
  if (phase === 'g4_chaos') return G4_CHAOS_STEPS.length;
  if (phase === 'g4_rerun') return G4_RERUN_STEPS.length;
  return 1;
}

// ── Phases ──

export const G4_PHASES = ['g4_intro', 'g4_build', 'g4_run', 'g4_chaos', 'g4_fix', 'g4_rerun'] as const;
export type G4Phase = (typeof G4_PHASES)[number];
export const isG4 = (phase: string): phase is G4Phase => (G4_PHASES as readonly string[]).includes(phase);

/** Game 4 clocks (they never move anything on; the presenter does). */
export interface G4Clock {
  buildAt: number | null;
  fixAt: number | null;
  buildExtraMs: number;
  fixExtraMs: number;
}
export const NEW_G4_CLOCK: G4Clock = { buildAt: null, fixAt: null, buildExtraMs: 0, fixExtraMs: 0 };
