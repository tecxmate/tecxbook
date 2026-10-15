// Game 3, "The Clinic", of the Scribe Quest class game (AI Scribe exercise).
// Every patient, line and note here is made up for training. The planted AI
// mistakes copy the real failures reported in HBS case 9-126-061 (Mass General
// Brigham): a misheard word, history left out because each note starts blank,
// a patient's memory written down as fact, and one drug under two names.
//
// How many mistakes? Published audits of AI-drafted notes find about 1.5% of
// sentences made up and 3.5% left out (Asgari et al., npj Digital Medicine
// 2025). The game plants 5 mistakes in 24 cards, roughly 4× the real rate, so
// players find something within the time limit. Patients 1 and 3 have one
// mistake each, like most real notes; patient 2 is the "bad day" built from
// the case's own examples. The dentist's notes forget the personal detail for
// patients 1 and 3, as notes written from memory do (David Ting in the case).

import { BACKUP_SCENARIOS } from './scenarios-backup';

export type TeamMode = 'manual' | 'ai' | 'ai-check';

export interface TeamInfo {
  id: '1' | '2' | '3';
  name: string;
  mode: TeamMode;
  label: string;
  tagline: string;
}

export const TEAMS: TeamInfo[] = [
  { id: '1', name: 'Team 1', mode: 'manual', label: 'Manual', tagline: 'No AI. Chart from the dentist\'s notes.' },
  { id: '2', name: 'Team 2', mode: 'ai', label: 'AI Scribe', tagline: 'Scribby the AI drafts. You check.' },
  { id: '3', name: 'Team 3', mode: 'ai-check', label: 'AI + Safety check', tagline: 'Scribby drafts. A safety check helps.' },
];

export function getTeam(id: string | null | undefined): TeamInfo | undefined {
  return TEAMS.find((t) => t.id === id);
}

/** Seconds to finish a chart, the same for every team. */
export const TIME_LIMIT = 90;

// ── Cases ──

export type Speaker = 'dentist' | 'patient';

export interface VisitLine {
  who: Speaker;
  text: string;
}

export type Answers = Record<string, string | undefined>;

export interface Card {
  key: string;
  label: string;
  options: string[];
  truth: string;
  /** What Scribby fills in (Teams 2 and 3). */
  ai: string;
  /** A wrong answer here hurts the patient. */
  critical?: boolean;
  /** Team 3's safety check: a warning for the current choice, or null. */
  check?: (value: string | undefined, answers: Answers) => string | null;
  /** Team 3's false alarm on a card that is actually right. */
  falseAlarm?: string;
  /** What the patient says if this goes wrong. */
  ouch?: string;
}

export type ErrorKind = 'left-out' | 'misheard' | 'memory-as-fact' | 'same-drug-twice';

export const ERROR_KIND_LABELS: Record<ErrorKind, string> = {
  'left-out': 'Left out',
  misheard: 'Misheard word',
  'memory-as-fact': 'Memory as fact',
  'same-drug-twice': 'Same medicine twice',
};

export interface PlantedError {
  id: string;
  /** The card key Scribby got wrong. */
  field: string;
  kind: ErrorKind;
  /** A few words for the projector. */
  shortTitle: string;
  /** Why this happens with real AI scribes, in plain words, with its source. */
  whyReal: string;
  /** Whether Team 3's safety check flags it. */
  checkCatches: boolean;
}

export interface PatientLook {
  hair: string;
  shirt: string;
  /** Sprite shape: short hair, glasses, or long hair. */
  style: 'short' | 'glasses' | 'long';
}

export interface Scenario {
  /** c1 to c3 are the main patients, c4 to c6 the backups (scenarios-backup.ts). */
  id: 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6';
  number: 1 | 2 | 3 | 4 | 5 | 6;
  patientName: string;
  first: string;
  age: number;
  reason: string;
  look: PatientLook;
  visit: VisitLine[];
  /** Written by the dentist from memory, so they can miss things too. */
  doctorNotes: string[];
  record: Array<[string, string, boolean?]>;
  cards: Card[];
  errors: PlantedError[];
  /** The patient's line when everything went right. */
  thanks: string;
  /** Shown to Team 1: what the dentist's memory missed. */
  notesForgot?: string;
}

// Built-in patient names. The lecturer can rename any patient on the day in
// the projector's settings; applyNames() swaps the name everywhere.
const P1 = { first: 'Brian', full: 'Brian Tran' };
const P2 = { first: 'George', full: 'George Miller' };
const P3 = { first: 'Amira', full: 'Amira Haddad' };

const has = (v: string | undefined, word: string) => (v ?? '').toLowerCase().includes(word);

const MAIN_SCENARIOS: Scenario[] = [
  {
    id: 'c1',
    number: 1,
    patientName: P1.full,
    first: P1.first,
    age: 36,
    reason: 'Toothache, lower right',
    look: { hair: '#2b2340', shirt: '#ffc93c', style: 'short' },
    visit: [
      { who: 'dentist', text: 'Morning! What brings you in?' },
      { who: 'patient', text: 'My tooth is killing me. Bottom right, at the back. Hot coffee makes it scream.' },
      { who: 'dentist', text: 'Any allergies?' },
      { who: 'patient', text: 'Penicillin! Last time I took amoxicillin I turned into a strawberry.' },
      { who: 'dentist', text: 'Let\'s look. Tooth forty-six, lower right. The decay has reached the nerve. We start a root canal today.' },
      { who: 'patient', text: 'Do I need antibiotics?' },
      { who: 'dentist', text: 'No antibiotics, and definitely no amoxicillin. For the pain: ibuprofen, three times a day after food.' },
      { who: 'patient', text: 'Fine. But I hate needles, and I\'m getting married on Saturday!' },
      { who: 'dentist', text: 'Congratulations! Numbing gel first, promise. See you in one week to finish.' },
    ],
    doctorNotes: [
      `${P1.full}, 36 · toothache, lower right`,
      'Allergy: PENICILLIN (rash)',
      'Tooth 46: decay reached the nerve',
      'Treat: start root canal today',
      'Meds: ibuprofen only. NO antibiotics',
      'Next: 1 week',
    ],
    record: [
      ['Patient', `${P1.full}, 36`],
      ['Allergies', 'Penicillin (rash, 2023)', true],
      ['Medicines', 'None'],
      ['Last visit', 'Cleaning, November'],
    ],
    cards: [
      { key: 'why', label: 'Why he came', options: ['Toothache', 'Cracked tooth', 'Bleeding gums', 'Check-up'], truth: 'Toothache', ai: 'Toothache' },
      { key: 'tooth', label: 'Which tooth', options: ['36', '46', '26', '16'], truth: '46', ai: '36', critical: true, ouch: 'You drilled the wrong side of my mouth!' },
      {
        key: 'allergy', label: 'Allergies', options: ['None', 'Penicillin', 'Latex', 'Aspirin'], truth: 'Penicillin', ai: 'Penicillin', critical: true,
        check: (v) => (v !== 'Penicillin' ? 'Patient record says: penicillin allergy.' : null),
        ouch: 'Nobody wrote down my allergy…',
      },
      { key: 'problem', label: 'What is wrong', options: ['Decay reached the nerve', 'Gum disease', 'Cracked tooth', 'Infection'], truth: 'Decay reached the nerve', ai: 'Decay reached the nerve', falseAlarm: 'Low AI confidence on this one. Double-check?' },
      { key: 'treat', label: 'Treatment', options: ['Root canal today', 'Filling today', 'Pull it today', 'Cleaning'], truth: 'Root canal today', ai: 'Root canal today', critical: true, ouch: 'That was not the plan!' },
      {
        key: 'meds', label: 'Medicine', options: ['Ibuprofen', 'Amoxicillin', 'Ibuprofen + Advil', 'Nothing'], truth: 'Ibuprofen', ai: 'Ibuprofen', critical: true,
        check: (v) => (has(v, 'amoxicillin') ? 'Amoxicillin is a penicillin, and the record says he is allergic.'
          : has(v, 'advil') ? 'Same medicine twice: Advil IS ibuprofen.' : null),
        ouch: 'My medicine made things worse.',
      },
      { key: 'next', label: 'Next visit', options: ['In 1 week', 'In 6 months'], truth: 'In 1 week', ai: 'In 1 week' },
      { key: 'note', label: 'Personal note', options: ['Wedding Saturday, hates needles', 'Loves coffee', '(nothing)'], truth: 'Wedding Saturday, hates needles', ai: 'Wedding Saturday, hates needles' },
    ],
    errors: [
      {
        id: 'c1-teeth',
        field: 'tooth',
        kind: 'misheard',
        shortTitle: 'Tooth 36 instead of 46',
        whyReal: '"Forty-six" and "thirty-six" sound alike. David Ting (MGB): software that is 97% accurate can still get the one word that matters wrong.',
        checkCatches: false,
      },
    ],
    thanks: 'Thanks, doc! I will smile in every wedding photo.',
    notesForgot: `The notes forgot ${P1.first}'s wedding and his fear of needles. David Ting (MGB): "I used to worry … that I would forget something."`,
  },
  {
    id: 'c2',
    number: 2,
    patientName: P2.full,
    first: P2.first,
    age: 72,
    reason: 'Cracked tooth, upper left',
    look: { hair: '#cfd0dc', shirt: '#ff7a59', style: 'glasses' },
    visit: [
      { who: 'dentist', text: `${P2.first}! What happened?` },
      { who: 'patient', text: 'I lost a fight with an olive.' },
      { who: 'dentist', text: 'Who won?' },
      { who: 'patient', text: 'The olive. Top left, at the back. It hurts when I chew.' },
      { who: 'dentist', text: `Tooth twenty-six is cracked below the gum. Sorry, ${P2.first}. It has to come out.` },
      { who: 'dentist', text: 'Still taking your heart pill every evening?' },
      { who: 'patient', text: 'Yes! But relax, my blood test last month was normal.' },
      { who: 'dentist', text: 'Last month is too old. Fresh blood-clotting test first, then we pull it next week.' },
      { who: 'dentist', text: 'For the pain: Panadol. That\'s paracetamol, same thing. No ibuprofen with your heart pill.' },
      { who: 'patient', text: 'My daughter will drive me. See you next week, doc!' },
    ],
    doctorNotes: [
      `${P2.full}, 72 · tooth 26 cracked (olive!)`,
      'History: on WARFARIN (see file)',
      'Says blood test "normal last month". Not on file → fresh test first',
      'Treat: pull tooth 26 next week',
      'Meds: paracetamol only. NO ibuprofen',
      'Next: 1 week · daughter drives',
    ],
    record: [
      ['Patient', `${P2.full}, 72`],
      ['Allergies', 'None'],
      ['Medicines', 'Warfarin 5 mg every evening (blood thinner)', true],
      ['Lab tests', 'No blood-clotting test on file'],
      ['Last visit', 'Check-up, January'],
    ],
    cards: [
      { key: 'why', label: 'Why he came', options: ['Toothache', 'Cracked tooth', 'Bleeding gums', 'Check-up'], truth: 'Cracked tooth', ai: 'Cracked tooth' },
      { key: 'tooth', label: 'Which tooth', options: ['16', '26', '36', '46'], truth: '26', ai: '26', critical: true, falseAlarm: 'Low AI confidence on this one. Double-check?', ouch: 'You pulled the wrong tooth!' },
      {
        key: 'history', label: 'Medical history', options: ['Nothing', 'Blood thinner', 'Diabetes', 'Pregnant'], truth: 'Blood thinner', ai: 'Nothing', critical: true,
        check: (v) => (v !== 'Blood thinner' ? 'Patient record says: warfarin, a blood thinner.' : null),
        ouch: 'Nobody knew I bleed easily…',
      },
      { key: 'test', label: 'Blood-clotting test', options: ['Normal, skip it', 'Fresh test first'], truth: 'Fresh test first', ai: 'Normal, skip it', critical: true, ouch: 'No fresh test. I bled for hours!' },
      { key: 'treat', label: 'Treatment', options: ['Pull it today', 'Pull it next week', 'Filling', 'Root canal'], truth: 'Pull it next week', ai: 'Pull it next week', critical: true, ouch: 'That was not the plan!' },
      {
        key: 'meds', label: 'Medicine', options: ['Paracetamol', 'Panadol + paracetamol', 'Ibuprofen', 'Amoxicillin'], truth: 'Paracetamol', ai: 'Panadol + paracetamol', critical: true,
        check: (v) => (has(v, 'panadol') ? 'Same medicine twice: Panadol IS paracetamol.'
          : has(v, 'ibuprofen') ? 'Ibuprofen with a blood thinner raises the risk of bleeding.' : null),
        ouch: 'I took a double dose. My liver is not happy.',
      },
      { key: 'next', label: 'Next visit', options: ['In 1 week', 'In 6 months'], truth: 'In 1 week', ai: 'In 1 week' },
      { key: 'note', label: 'Personal note', options: ['Daughter drives him', 'Loves olives', '(nothing)'], truth: 'Daughter drives him', ai: 'Daughter drives him' },
    ],
    errors: [
      {
        id: 'c2-history',
        field: 'history',
        kind: 'left-out',
        shortTitle: 'Blood thinner left out',
        whyReal: 'The AI only hears this visit. The patient said "heart pill", and only the old record says warfarin. Dr. Schiff (MGB): every AI note starts from a blank page.',
        checkCatches: true,
      },
      {
        id: 'c2-inr',
        field: 'test',
        kind: 'memory-as-fact',
        shortTitle: '"Normal" blood test',
        whyReal: 'A patient told Dr. Moura (MGB) her brain scan was normal. The AI wrote it down. The real scan was not normal.',
        checkCatches: false,
      },
      {
        id: 'c2-rx',
        field: 'meds',
        kind: 'same-drug-twice',
        shortTitle: 'Panadol + paracetamol',
        whyReal: 'At MGB the AI listed Vimpat and lacosamide, one drug under two names, which doubled the dose (case Exhibit 6).',
        checkCatches: true,
      },
    ],
    thanks: 'Thanks, doc! I feel ready to fight olives again.',
  },
  {
    id: 'c3',
    number: 3,
    patientName: P3.full,
    first: P3.first,
    age: 29,
    reason: 'Bleeding gums',
    look: { hair: '#3a2440', shirt: '#8b6be0', style: 'long' },
    visit: [
      { who: 'dentist', text: 'Hi! What brings you in?' },
      { who: 'patient', text: 'My gums bleed every time I brush. My sink looks like a crime scene.' },
      { who: 'dentist', text: 'Anything new with your health?' },
      { who: 'patient', text: 'Not really. Oh wait, I\'m five months pregnant! Due in March.' },
      { who: 'dentist', text: 'Congratulations! Pregnancy hormones make gums swell and bleed. That explains it.' },
      { who: 'dentist', text: 'X-rays can wait until after the baby. Today, a gentle cleaning, and a mouthwash twice a day.' },
      { who: 'patient', text: 'Can I take ibuprofen if it\'s sore?' },
      { who: 'dentist', text: 'Not this far into pregnancy. Paracetamol is fine.' },
      { who: 'patient', text: 'I work night shifts, so mornings are best. Also, I\'m basically a zombie.' },
      { who: 'dentist', text: 'Mornings it is. See you in two weeks.' },
    ],
    doctorNotes: [
      `${P3.full}, 29 · bleeding, puffy gums`,
      'PREGNANT, 20 weeks (due March)',
      'Gums swollen from pregnancy',
      'X-rays: wait until after baby',
      'Treat: gentle cleaning today',
      'Meds: mouthwash + paracetamol. NO ibuprofen',
      'Next: 2 weeks',
    ],
    record: [
      ['Patient', `${P3.full}, 29`],
      ['Allergies', 'None'],
      ['Medicines', 'None'],
      ['Last visit', 'Check-up, May 2024'],
    ],
    cards: [
      { key: 'why', label: 'Why she came', options: ['Toothache', 'Cracked tooth', 'Bleeding gums', 'Check-up'], truth: 'Bleeding gums', ai: 'Bleeding gums', falseAlarm: 'Low AI confidence on this one. Double-check?' },
      { key: 'health', label: 'Health news', options: ['Nothing new', 'Pregnant', 'Diabetes', 'Blood thinner'], truth: 'Pregnant', ai: 'Nothing new', critical: true, ouch: 'Nobody wrote down that I am pregnant…' },
      { key: 'problem', label: 'What is wrong', options: ['Gums swollen from pregnancy', 'Gum disease', 'Decay', 'Infection'], truth: 'Gums swollen from pregnancy', ai: 'Gums swollen from pregnancy' },
      {
        key: 'xray', label: 'X-rays', options: ['Take them today', 'After the baby'], truth: 'After the baby', ai: 'After the baby', critical: true,
        check: (v, a) => (a.health === 'Pregnant' && v === 'Take them today' ? 'She is pregnant, and the dentist planned to wait.' : null),
        ouch: 'I got X-rays I did not need!',
      },
      { key: 'treat', label: 'Treatment', options: ['Gentle cleaning', 'Filling', 'Pull a tooth', 'Root canal'], truth: 'Gentle cleaning', ai: 'Gentle cleaning', critical: true, ouch: 'That was not the plan!' },
      {
        key: 'meds', label: 'Medicine', options: ['Mouthwash + paracetamol', 'Mouthwash + ibuprofen', 'Mouthwash only', 'Amoxicillin'], truth: 'Mouthwash + paracetamol', ai: 'Mouthwash + paracetamol', critical: true,
        check: (v, a) => (a.health === 'Pregnant' && has(v, 'ibuprofen') ? 'Ibuprofen is not recommended this far into pregnancy.' : null),
        ouch: 'I took a medicine I was told to avoid.',
      },
      { key: 'next', label: 'Next visit', options: ['In 2 weeks', 'In 6 months'], truth: 'In 2 weeks', ai: 'In 2 weeks' },
      { key: 'note', label: 'Personal note', options: ['Night shifts, mornings best', 'Loves zombies', '(nothing)'], truth: 'Night shifts, mornings best', ai: 'Night shifts, mornings best' },
    ],
    errors: [
      {
        id: 'c3-pregnant',
        field: 'health',
        kind: 'left-out',
        shortTitle: 'Pregnancy left out',
        whyReal: 'Most real AI mistakes are things left out, not made up: 3.5% of sentences left out vs 1.5% made up in a 2025 audit (Asgari et al., npj Digital Medicine). It was said once, in passing, and is not in the old record.',
        checkCatches: false,
      },
    ],
    thanks: 'Thanks, doc! My sink thanks you too.',
    notesForgot: `The notes forgot that ${P3.first} works night shifts and needs mornings.`,
  },
];

/** Every patient as written, before any renaming. */
const BASE_SCENARIOS: Scenario[] = [...MAIN_SCENARIOS, ...BACKUP_SCENARIOS];

/**
 * Every patient with the lecturer's names applied. The same array is updated
 * in place by applyNames(), so every screen reads the current names.
 */
export const SCENARIOS: Scenario[] = [...BASE_SCENARIOS];

/** The patients with their built-in names, for the settings panel. */
export const BUILT_IN_PATIENTS = BASE_SCENARIOS.map((s) => ({ id: s.id, number: s.number, name: s.patientName, reason: s.reason, backup: s.number > 3 }));

let appliedNames = '{}';

/** Use the lecturer's names (scenario id → "First Last"). Cheap to call on every render. */
export function applyNames(names: Record<string, string> = {}) {
  const key = JSON.stringify(names);
  if (key === appliedNames) return;
  appliedNames = key;
  BASE_SCENARIOS.forEach((base, i) => { SCENARIOS[i] = renamed(base, names[base.id]); });
}

/** A copy of the patient with every mention of the old name swapped for the new one. */
function renamed(s: Scenario, full: string | undefined): Scenario {
  const name = (full ?? '').replace(/\s+/g, ' ').trim();
  if (!name || name === s.patientName) return s;
  const first = name.split(' ')[0];
  const firstWord = new RegExp(`\\b${s.first}\\b`, 'g');
  // Placeholders first, so a new name that contains the old one is not swapped twice.
  const swap = (t: string) =>
    t.split(s.patientName).join('\u0000').replace(firstWord, '\u0001').split('\u0000').join(name).split('\u0001').join(first);
  const swapOpt = (t: string | null | undefined) => (typeof t === 'string' ? swap(t) : t);
  const original = new Map(s.cards.flatMap((c) => c.options.map((o) => [swap(o), o] as const)));
  const back = (t: string | undefined) => (t === undefined ? t : original.get(t) ?? t);
  return {
    ...s,
    patientName: name,
    first,
    reason: swap(s.reason),
    visit: s.visit.map((l) => ({ ...l, text: swap(l.text) })),
    doctorNotes: s.doctorNotes.map(swap),
    record: s.record.map(([k, v, alert]) => [k, swap(v), alert] as [string, string, boolean?]),
    cards: s.cards.map((c) => ({
      ...c,
      label: swap(c.label),
      options: c.options.map(swap),
      truth: swap(c.truth),
      ai: swap(c.ai),
      ouch: swapOpt(c.ouch) ?? undefined,
      falseAlarm: swapOpt(c.falseAlarm) ?? undefined,
      // The safety check was written for the old names: hand it the old answers.
      check: c.check
        ? (v, answers) => {
            const old = Object.fromEntries(Object.entries(answers).map(([k, a]) => [k, back(a)]));
            return swapOpt(c.check!(back(v), old)) ?? null;
          }
        : undefined,
    })),
    errors: s.errors.map((e) => ({ ...e, shortTitle: swap(e.shortTitle), whyReal: swap(e.whyReal) })),
    thanks: swap(s.thanks),
    notesForgot: swapOpt(s.notesForgot) ?? undefined,
  };
}

export function getScenario(id: string | null | undefined): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
