// Games 1 and 2 of the class flow, before Scribe Quest. Note text is copied
// exactly from the session spec. No em dashes in anything shown on screen.

export type MistakeType = 'memory_as_fact' | 'same_drug_twice' | 'missing_history';

export interface NoteLine {
  id: string;
  text: string;
  mistake?: MistakeType;
}

export interface G1Note {
  id: 'A' | 'B' | 'C';
  topic: string;
  lines: NoteLine[];
}

export const G1_FOOTER = 'Made-up training example. The three mistake types come from the real HBS case.';

export const G1_NOTES: G1Note[] = [
  {
    id: 'A',
    topic: 'Headache',
    lines: [
      { id: 'visit', text: 'Visit: Follow-up visit. Her headaches came back.' },
      { id: 'history', text: 'History: None.', mistake: 'missing_history' },
      { id: 'scan', text: 'Scan: The patient says her brain scan was normal.', mistake: 'memory_as_fact' },
      { id: 'medicine', text: 'Medicine: Take Panadol, 2 pills a day. Take paracetamol, 2 pills a day.', mistake: 'same_drug_twice' },
      { id: 'plan', text: 'Plan: Rest, drink water and keep a headache diary.' },
      { id: 'next', text: 'Next visit: Come back in two weeks.' },
    ],
  },
  {
    id: 'B',
    topic: 'Back pain',
    lines: [
      { id: 'visit', text: 'Visit: Follow-up visit. Her back pain is worse.' },
      { id: 'history', text: 'History: None.', mistake: 'missing_history' },
      { id: 'xray', text: 'X-ray: The patient says her X-ray was normal.', mistake: 'memory_as_fact' },
      { id: 'medicine', text: 'Medicine: Take Advil, 2 pills a day. Take ibuprofen, 2 pills a day.', mistake: 'same_drug_twice' },
      { id: 'plan', text: 'Plan: Gentle stretching every morning.' },
      { id: 'next', text: 'Next visit: Come back in two weeks.' },
    ],
  },
  {
    id: 'C',
    topic: 'Stomach pain',
    lines: [
      { id: 'visit', text: 'Visit: Follow-up visit. His stomach pain is back.' },
      { id: 'history', text: 'History: None.', mistake: 'missing_history' },
      { id: 'blood', text: 'Blood test: The patient says his blood test was normal.', mistake: 'memory_as_fact' },
      { id: 'medicine', text: 'Medicine: Take Tylenol, 2 pills a day. Take acetaminophen, 2 pills a day.', mistake: 'same_drug_twice' },
      { id: 'plan', text: 'Plan: Eat small meals and avoid spicy food.' },
      { id: 'next', text: 'Next visit: Come back in two weeks.' },
    ],
  },
];

export const getNote = (id: string | null | undefined) => G1_NOTES.find((n) => n.id === id) ?? G1_NOTES[0];

export interface MistakeInfo {
  type: MistakeType;
  title: string;
  why: string;
  /** Short name for the stats bars and the prediction vote. */
  short: string;
  /** For the lecturer: what to ask the room on this card. */
  ask: string;
}

// Order of the cards on the reveal (the table order in the spec).
export const MISTAKES: MistakeInfo[] = [
  {
    type: 'memory_as_fact',
    title: 'The test result was never checked.',
    why: 'The patient said "normal", but nobody looked at the real result.',
    short: 'Test result never checked',
    ask: 'Who here would have trusted "normal"? What would you check, and where?',
  },
  {
    type: 'same_drug_twice',
    title: 'One medicine was written twice.',
    why: 'Panadol and paracetamol (Advil and ibuprofen, Tylenol and acetaminophen) are the same pill, so the dose doubles.',
    short: 'One medicine written twice',
    ask: 'Hands up if you knew these were the same pill. Should a doctor need to know every brand name?',
  },
  {
    type: 'missing_history',
    title: 'The history was missing.',
    why: 'A returning patient cannot have "no history". The AI started from a blank page.',
    short: 'Missing history',
    ask: 'The visit line said "follow-up". Did anyone use that clue? Missing information is harder to see than wrong information. Why?',
  },
];

export const mistakeInfo = (t: MistakeType) => MISTAKES.find((m) => m.type === t)!;

export const G1_HINTS = [
  'Could two medicine names mean one medicine?',
  'Can a follow-up patient really have no history?',
  'Who said the test was normal, the record or the patient?',
];

export const G1_QUOTE = {
  text: 'This is why clinicians must continue to verify critical details.',
  who: 'Dr. Lidia Moura, neurologist at MGH',
  note: 'In the real case, a "normal" brain scan was not normal, Vimpat and lacosamide were listed as two drugs, and notes started blank.',
};

// ── Game 1 scoring ──

export interface G1Score {
  caught: number;
  falseAlarms: number;
  score: number;
  perfect: boolean;
}

/** +1 per mistake circled, -1 per correct line circled, never below 0. */
export function scoreG1(noteId: string, selected: string[]): G1Score {
  const note = getNote(noteId);
  const caught = note.lines.filter((l) => l.mistake && selected.includes(l.id)).length;
  const falseAlarms = note.lines.filter((l) => !l.mistake && selected.includes(l.id)).length;
  return { caught, falseAlarms, score: Math.max(0, caught - falseAlarms), perfect: caught === 3 && falseAlarms === 0 };
}

export type LineMark = 'caught' | 'missed' | 'false' | 'plain';

export function markLine(line: NoteLine, selected: string[]): LineMark {
  const circled = selected.includes(line.id);
  if (line.mistake) return circled ? 'caught' : 'missed';
  return circled ? 'false' : 'plain';
}

/** Did this player circle the line of this mistake type? */
export const caughtType = (noteId: string, selected: string[], type: MistakeType) =>
  getNote(noteId).lines.some((l) => l.mistake === type && selected.includes(l.id));

// ── Game 2 ──

export const G2_HEADER = 'AI DRAFT NOTE · SORE THROAT';

export const G2_LINES: Array<NoteLine & { label: string; bad?: boolean }> = [
  { id: 'visit', label: 'Visit', text: 'Visit: Sore throat and fever for three days.' },
  { id: 'allergy', label: 'Allergy', text: 'Allergy: Aspirin. It gives her a rash.', bad: true },
  { id: 'check', label: 'Check', text: 'Check: The throat is red, and the breathing is fine.' },
  { id: 'plan', label: 'Plan', text: 'Plan: Rest at home and drink a lot of water.' },
  { id: 'medicine', label: 'Medicine', text: 'Medicine: Take aspirin, 2 pills a day for 5 days.', bad: true },
  { id: 'next', label: 'Next visit', text: 'Next visit: Come back if the fever lasts more than three days.' },
];

export const G2_FOOTER = 'Made-up training example, not from the case.';
export const isSpotted = (line: string | null) => line === 'allergy' || line === 'medicine';

export const POLL_WHO = {
  id: 'g2_who',
  question: 'Who should catch errors like this?',
  options: [
    { id: 'A', label: 'The doctor' },
    { id: 'B', label: 'A second checker' },
    { id: 'C', label: 'The software' },
    { id: 'D', label: 'A mix: the software flags risky lines, and the doctor checks those carefully' },
  ],
};

/** Before the Game 1 stats: the class guesses which mistake it missed most. */
export const PREDICT = {
  id: 'g1_predict',
  question: 'Which mistake do you think the class missed most?',
  options: MISTAKES.map((m) => ({ id: m.type, label: m.short })),
};

// ── Timing (the Worker uses the same numbers) ──

export const G2_SHOW_MS = 8_000;
export const G2_VOTE_MS = 10_000;

export type FlowPhase = 'lobby' | 'g1_play' | 'g1_reveal' | 'g2_ready' | 'g2_play' | 'g2_reveal' | 'g3' | 'final' | 'g4_intro' | 'g4_build' | 'g4_run' | 'g4_chaos' | 'g4_fix' | 'g4_rerun';

/** How the running score is made, for the phones and the projector. */
export const SCORE_RULES = [
  'Game 1: 100 per mistake found, minus 100 per correct line circled',
  'Game 2: 100 for not signing, 200 for tapping Allergy or Medicine',
  "Game 3: your clinic's average chart score divided by 4, the same for the dentist and both nurses",
];

/** Reveal steps on the projector. Phones follow them. */
export const G1_STEPS = ['predict', 'stats', 'card1', 'card2', 'card3', 'quote', 'leaders'] as const;
export const G2_STEPS = ['tally', 'note', 'stats', 'poll'] as const;
