// Backup patients for Game 3, "The Clinic". Same rules as scenarios.ts: every
// patient, line and note is made up for training, and the planted AI mistakes
// copy the real failures in HBS case 9-126-061 (Mass General Brigham).
//
// Spread of mistakes: patient 4 has two (history left out, one drug under two
// names), patients 5 and 6 have one each (a memory written as fact, a misheard
// word). The safety check catches the two that clash with the patient record
// and misses the two that only exist in the room, as a real check would.

import type { Scenario } from './scenarios';

// Patient names live here so they are easy to change.
const P4 = { first: 'Daniel', full: 'Daniel Okafor' };
const P5 = { first: 'Sofia', full: 'Sofia Reyes' };
const P6 = { first: 'Kenji', full: 'Kenji Watanabe' };

const has = (v: string | undefined, word: string) => (v ?? '').toLowerCase().includes(word);

export const BACKUP_SCENARIOS: Scenario[] = [
  {
    id: 'c4',
    number: 4,
    patientName: P4.full,
    first: P4.first,
    age: 47,
    reason: 'Swollen gum, lower right',
    look: { hair: '#4a3426', shirt: '#3d9be9', style: 'glasses' },
    visit: [
      { who: 'dentist', text: 'Hello! What brings you in?' },
      { who: 'patient', text: 'My gum at the very back, bottom right, is all swollen. I can barely open my mouth.' },
      { who: 'dentist', text: 'Let me see. It is your wisdom tooth, number forty-eight. The gum around it is infected.' },
      { who: 'patient', text: 'Great. I am a chef, and I cannot even taste my own soup.' },
      { who: 'dentist', text: 'Any changes to your health? Same medicines?' },
      { who: 'patient', text: 'Same as always. Just my diabetes pills, morning and evening.' },
      { who: 'dentist', text: 'Good to know. With diabetes, infections heal more slowly, so we act fast. Today I clean the gum. The tooth comes out next week, when the swelling is down.' },
      { who: 'dentist', text: 'Antibiotics for five days: amoxicillin. The box may say Amoxil. Same medicine, so take only one.' },
      { who: 'patient', text: 'Next week works, but only on Monday. The restaurant is closed on Mondays.' },
      { who: 'dentist', text: 'Monday it is. See you in one week.' },
    ],
    doctorNotes: [
      `${P4.full}, 47 · swollen gum, lower right`,
      'History: DIABETES, on metformin',
      'Tooth 48: infection around wisdom tooth',
      'Treat: clean the gum today, pull it next week',
      'Meds: amoxicillin, 5 days',
      'Next: 1 week',
    ],
    record: [
      ['Patient', `${P4.full}, 47`],
      ['Allergies', 'None'],
      ['Medicines', 'Metformin 500 mg twice a day (diabetes)', true],
      ['Last visit', 'Cleaning, March'],
    ],
    cards: [
      { key: 'why', label: 'Why he came', options: ['Toothache', 'Swollen gum', 'Cracked tooth', 'Check-up'], truth: 'Swollen gum', ai: 'Swollen gum' },
      { key: 'tooth', label: 'Which tooth', options: ['38', '48', '18', '28'], truth: '48', ai: '48', critical: true, ouch: 'You worked on the wrong side of my mouth!' },
      {
        key: 'history', label: 'Medical history', options: ['Nothing', 'Diabetes', 'Blood thinner', 'Pregnant'], truth: 'Diabetes', ai: 'Nothing', critical: true,
        check: (v) => (v !== 'Diabetes' ? 'Patient record says: metformin, a diabetes medicine.' : null),
        ouch: 'Nobody knew about my diabetes. My blood sugar went wild.',
      },
      { key: 'problem', label: 'What is wrong', options: ['Infection around wisdom tooth', 'Decay reached the nerve', 'Cracked tooth', 'Gum disease'], truth: 'Infection around wisdom tooth', ai: 'Infection around wisdom tooth', falseAlarm: 'Low AI confidence on this one. Double-check?' },
      { key: 'treat', label: 'Treatment', options: ['Clean today, pull next week', 'Pull it today', 'Root canal', 'Filling'], truth: 'Clean today, pull next week', ai: 'Clean today, pull next week', critical: true, ouch: 'That was not the plan!' },
      {
        key: 'meds', label: 'Medicine', options: ['Amoxicillin', 'Amoxil + amoxicillin', 'Ibuprofen only', 'Nothing'], truth: 'Amoxicillin', ai: 'Amoxil + amoxicillin', critical: true,
        check: (v) => (has(v, 'amoxil') ? 'Same medicine twice: Amoxil IS amoxicillin.' : null),
        ouch: 'I took a double dose. My stomach is not happy.',
      },
      { key: 'next', label: 'Next visit', options: ['In 1 week', 'In 6 months'], truth: 'In 1 week', ai: 'In 1 week' },
      { key: 'note', label: 'Personal note', options: ['Chef, Mondays only', 'Loves spicy food', '(nothing)'], truth: 'Chef, Mondays only', ai: 'Chef, Mondays only' },
    ],
    errors: [
      {
        id: 'c4-history',
        field: 'history',
        kind: 'left-out',
        shortTitle: 'Diabetes left out',
        whyReal: 'He said "my diabetes pills" once, in passing, as "same as always". Most real AI mistakes are things left out: 3.5% of sentences in a 2025 audit (Asgari et al., npj Digital Medicine). Dr. Schiff (MGB): every AI note starts from a blank page.',
        checkCatches: true,
      },
      {
        id: 'c4-rx',
        field: 'meds',
        kind: 'same-drug-twice',
        shortTitle: 'Amoxil + amoxicillin',
        whyReal: 'At MGB the AI listed Vimpat and lacosamide, one drug under two names, which doubled the dose (case Exhibit 6). Amoxil is the brand name of amoxicillin.',
        checkCatches: true,
      },
    ],
    thanks: 'Thanks, doc! Tonight I can taste my soup again.',
    notesForgot: `The notes forgot that ${P4.first} is a chef and can only come on Mondays.`,
  },
  {
    id: 'c5',
    number: 5,
    patientName: P5.full,
    first: P5.first,
    age: 27,
    reason: 'Chipped front tooth, bike fall',
    look: { hair: '#c4622d', shirt: '#4cc38a', style: 'long' },
    visit: [
      { who: 'dentist', text: 'Oh no. What happened to you?' },
      { who: 'patient', text: 'A pigeon walked onto the bike path. I braked. My bike did not.' },
      { who: 'dentist', text: 'And the pigeon?' },
      { who: 'patient', text: 'Totally fine. My front tooth, not so much. The top one on the right.' },
      { who: 'dentist', text: 'Top front, your right side: tooth eleven. A small chip, and the nerve looks fine.' },
      { who: 'dentist', text: 'That scrape on your knee came from the road. When was your last tetanus shot?' },
      { who: 'patient', text: 'I am sure I had one recently. Maybe at school? My mum would know.' },
      { who: 'dentist', text: 'School was more than ten years ago, and it is not in your file. Please get a booster from your doctor today.' },
      { who: 'dentist', text: 'Now, a white filling to fix the chip. For pain: ibuprofen after food. Nurofen is the same thing, so not both.' },
      { who: 'patient', text: 'Will it look normal by Thursday? I have a job interview!' },
      { who: 'dentist', text: 'It will look normal today. See you in one month to check the nerve.' },
    ],
    doctorNotes: [
      `${P5.full}, 27 · chipped front tooth (bike fall)`,
      'Tooth 11: small chip, nerve OK',
      'Tetanus: not sure when. Not on file → booster today (her doctor)',
      'Treat: white filling today',
      'Meds: ibuprofen only',
      'Next: 1 month',
    ],
    record: [
      ['Patient', `${P5.full}, 27`],
      ['Allergies', 'None'],
      ['Medicines', 'None'],
      ['Tetanus shot', 'Not on file', true],
      ['Last visit', 'Check-up, last June'],
    ],
    cards: [
      { key: 'why', label: 'Why she came', options: ['Toothache', 'Chipped tooth', 'Bleeding gums', 'Check-up'], truth: 'Chipped tooth', ai: 'Chipped tooth' },
      { key: 'tooth', label: 'Which tooth', options: ['11', '21', '12', '22'], truth: '11', ai: '11', critical: true, falseAlarm: 'Low AI confidence on this one. Double-check?', ouch: 'You fixed the wrong tooth!' },
      { key: 'tetanus', label: 'Tetanus shot', options: ['Up to date', 'Booster today'], truth: 'Booster today', ai: 'Up to date', critical: true, ouch: 'Nobody sent me for my tetanus shot!' },
      { key: 'problem', label: 'What is wrong', options: ['Small chip, nerve OK', 'Nerve damaged', 'Tooth knocked loose', 'Decay'], truth: 'Small chip, nerve OK', ai: 'Small chip, nerve OK' },
      { key: 'treat', label: 'Treatment', options: ['White filling today', 'Crown', 'Pull it today', 'Root canal'], truth: 'White filling today', ai: 'White filling today', critical: true, ouch: 'That was not the plan!' },
      {
        key: 'meds', label: 'Medicine', options: ['Ibuprofen', 'Ibuprofen + Nurofen', 'Amoxicillin', 'Nothing'], truth: 'Ibuprofen', ai: 'Ibuprofen', critical: true,
        check: (v) => (has(v, 'nurofen') ? 'Same medicine twice: Nurofen IS ibuprofen.' : null),
        ouch: 'My medicine made things worse.',
      },
      { key: 'next', label: 'Next visit', options: ['In 1 month', 'In 6 months'], truth: 'In 1 month', ai: 'In 1 month' },
      { key: 'note', label: 'Personal note', options: ['Job interview Thursday', 'Afraid of pigeons', '(nothing)'], truth: 'Job interview Thursday', ai: 'Job interview Thursday' },
    ],
    errors: [
      {
        id: 'c5-tetanus',
        field: 'tetanus',
        kind: 'memory-as-fact',
        shortTitle: '"Recent" tetanus shot',
        whyReal: 'A patient told Dr. Moura (MGB) her brain scan was normal. The AI wrote it down as fact. The real scan was not normal. Here she only half remembers "maybe at school", and nothing is on file.',
        checkCatches: false,
      },
    ],
    thanks: 'Thanks, doc! Now I can smile at the interview. And at pigeons.',
    notesForgot: `The notes forgot ${P5.first}'s job interview on Thursday.`,
  },
  {
    id: 'c6',
    number: 6,
    patientName: P6.full,
    first: P6.first,
    age: 71,
    reason: 'Sore gums under new denture',
    look: { hair: '#e3dfe8', shirt: '#e05a8a', style: 'short' },
    visit: [
      { who: 'dentist', text: `${P6.first}! How are the new dentures?` },
      { who: 'patient', text: 'They look great. They feel like a pebble in my shoe. Bottom, left side.' },
      { who: 'dentist', text: 'Let me see. Yes, the lower denture rubs your gum here, lower left. Two small sore spots.' },
      { who: 'dentist', text: 'Before I start: anything new since last time? Any allergies?' },
      { who: 'patient', text: 'Yes! Latex. In the hospital last spring, the rubber gloves gave me a rash.' },
      { who: 'dentist', text: 'Thanks for telling me. Nurse, latex-free gloves, please. Today I smooth the denture where it rubs.' },
      { who: 'patient', text: 'And for the pain? I already take my aspirin every morning.' },
      { who: 'dentist', text: 'Then no extra pain pills. A numbing gel on the sore spots after meals, and rinse with warm salt water.' },
      { who: 'patient', text: 'Good. I sing in a choir, the concert is on Sunday, and right now I sound like a duck.' },
      { who: 'dentist', text: 'You will be ready. See you in one week.' },
    ],
    doctorNotes: [
      `${P6.full}, 71 · sore gums, new lower denture`,
      'NEW ALLERGY: LATEX (rash, last spring). Latex-free gloves!',
      'Lower left: denture rubs the gum, 2 sore spots',
      'Treat: smooth the denture today',
      'Meds: numbing gel + warm salt water. On aspirin',
      'Next: 1 week',
    ],
    record: [
      ['Patient', `${P6.full}, 71`],
      ['Allergies', 'None on file (last updated 2023)'],
      ['Medicines', 'Aspirin 100 mg every morning (heart)', true],
      ['Last visit', 'New lower denture fitted, 3 weeks ago'],
    ],
    cards: [
      { key: 'why', label: 'Why he came', options: ['Toothache', 'Denture sores', 'Bleeding gums', 'Check-up'], truth: 'Denture sores', ai: 'Denture sores' },
      { key: 'where', label: 'Where it hurts', options: ['Lower left', 'Lower right', 'Upper left', 'Upper right'], truth: 'Lower left', ai: 'Lower left', critical: true, ouch: 'You smoothed the wrong side!' },
      { key: 'allergy', label: 'Allergies', options: ['None', 'Latex', 'Lactose', 'Penicillin'], truth: 'Latex', ai: 'Lactose', critical: true, ouch: 'Those gloves gave me a rash again!' },
      { key: 'problem', label: 'What is wrong', options: ['Denture rubs the gum', 'Gum disease', 'Infection', 'Decay'], truth: 'Denture rubs the gum', ai: 'Denture rubs the gum' },
      { key: 'treat', label: 'Treatment', options: ['Smooth the denture today', 'Make a new denture', 'Pull a tooth', 'Cleaning'], truth: 'Smooth the denture today', ai: 'Smooth the denture today', critical: true, ouch: 'That was not the plan!' },
      {
        key: 'meds', label: 'Medicine', options: ['Numbing gel + salt water', 'Ibuprofen', 'Amoxicillin', 'Nothing'], truth: 'Numbing gel + salt water', ai: 'Numbing gel + salt water', critical: true,
        check: (v) => (has(v, 'ibuprofen') ? 'Patient record says: aspirin every day. Ibuprofen on top is hard on the stomach.' : null),
        ouch: 'My medicine made things worse.',
      },
      { key: 'next', label: 'Next visit', options: ['In 1 week', 'In 6 months'], truth: 'In 1 week', ai: 'In 1 week', falseAlarm: 'Low AI confidence on this one. Double-check?' },
      { key: 'note', label: 'Personal note', options: ['Choir concert Sunday', 'Sounds like a duck', '(nothing)'], truth: 'Choir concert Sunday', ai: 'Choir concert Sunday' },
    ],
    errors: [
      {
        id: 'c6-latex',
        field: 'allergy',
        kind: 'misheard',
        shortTitle: 'Latex heard as lactose',
        whyReal: '"Latex" and "lactose" sound alike. David Ting (MGB): software that is 97% accurate can still get the one word that matters wrong. The allergy is new, so the old record cannot help.',
        checkCatches: false,
      },
    ],
    thanks: 'Thanks, doc! On Sunday I will sing like a bird, not a duck.',
    notesForgot: `The notes forgot ${P6.first}'s choir concert on Sunday.`,
  },
];
