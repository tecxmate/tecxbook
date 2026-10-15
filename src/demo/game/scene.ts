// Pixel-art clinic drawn on a 256×144 canvas: Dr. You, the patient and
// Scribby the AI robot. Sprites are small character maps scaled ×2.

import type { PatientLook } from '../scenarios';

type Palette = Record<string, string>;

const BASE: Palette = {
  k: '#262144', s: '#f2b48c', S: '#d98f6c', h: '#5a3a2e', w: '#fbf7ee',
  m: '#3fbfa6', b: '#3d5a99', r: '#8fd3f4', R: '#5aa2cf', y: '#ffc93c', c: '#ff7a59',
};

const DENTIST = [
  '...kkkkkk...', '..khhhhhhk..', '.khhhhhhhhk.', '.khsssssshk.', '.kskssssksk.', '.kssssssssk.',
  '.kmmmmmmmmk.', '..kmmmmmmk..', '.kwwwwwwwwk.', 'kwwwwmmwwwwk', 'kwwwwwwwwwwk', 'kwkwwwwwwkwk',
  'kskwwwwwwksk', '.kkwwwwwwkk.', '..kwwwwwwk..', '..kbbkkbbk..', '..kbbk.kbbk.', '..kkkk.kkkk.',
];

// H = hair, T = top/shirt; filled from the patient's look.
const PATIENT: Record<PatientLook['style'], string[]> = {
  short: [
    '...kkkkkk...', '..kHHHHHHk..', '.kHHHHHHHHk.', '.kHssssssHk.', '.kskssssksk.', '.kssssssssk.',
    '.ksssSSsssk.', '..kssssssk..', '.kTTTTTTTTk.', 'kTTTTTTTTTTk', 'kTkTTTTTTkTk', 'kskTTTTTTksk',
    '.kkbbbbbbkk.', '..kbbbbbbk..', '..kbbkkbbk..', '..kbbk.kbbk.', '..kkkk.kkkk.',
  ],
  glasses: [
    '...kkkkkk...', '..kHHHHHHk..', '.kHHHHHHHHk.', '.kHssssssHk.', '.kkkkskkkkk.', '.kskksskksk.',
    '.kssssssssk.', '.ksssSSsssk.', '..kssssssk..', '.kTTTTTTTTk.', 'kTTTTTTTTTTk', 'kTkTTTTTTkTk',
    'kskTTTTTTksk', '.kkbbbbbbkk.', '..kbbbbbbk..', '..kbbkkbbk..', '..kbbk.kbbk.', '..kkkk.kkkk.',
  ],
  long: [
    '...kkkkkk...', '..kHHHHHHk..', '.kHHHHHHHHk.', '.kHssssssHk.', '.kHskssksHk.', '.kHssssssHk.',
    '.kHsssSSsHk.', '.kHkssssskHk', 'kHkTTTTTTkHk', 'kHTTTTTTTTHk', 'kTkTTTTTTkTk', 'kskTTTTTTksk',
    '.kkbbbbbbkk.', '..kbbbbbbk..', '..kbbkkbbk..', '..kbbk.kbbk.', '..kkkk.kkkk.',
  ],
};

const ROBOT = [
  '.....yy.....', '.....kk.....', '..kkkkkkkk..', '.krrrrrrrrk.', '.krkkrrkkrk.', '.krkkrrkkrk.',
  '.krrrrrrrrk.', '.krrkkkkrrk.', '.kRRRRRRRRk.', '..kkkkkkkk..', '....kyyk....', '.....yy.....',
];

const HEART = ['.kk.kk.', 'kcckcck', 'kccccck', 'kccccck', '.kccck.', '..kck..', '...k...'];

function sprite(ctx: CanvasRenderingContext2D, map: string[], pal: Palette, x: number, y: number, s = 2) {
  map.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const col = pal[row[i]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x + i * s), Math.round(y + j * s), s, s);
    }
  });
}

function rect(ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

function room(ctx: CanvasRenderingContext2D, t: number) {
  rect(ctx, '#a8dfd9', 0, 0, 256, 100);
  for (let x = 0; x < 256; x += 32) rect(ctx, '#97d3cd', x, 0, 2, 84);
  rect(ctx, '#7cc6be', 0, 84, 256, 16);
  rect(ctx, '#262144', 0, 99, 256, 2);
  for (let y = 101; y < 144; y += 11) {
    for (let x = 0; x < 256; x += 16) {
      rect(ctx, (x / 16 + Math.floor(y / 11)) % 2 ? '#f6d9ad' : '#ecc48e', x, y, 16, 11);
    }
  }
  // window with a drifting cloud
  rect(ctx, '#262144', 12, 10, 56, 38);
  rect(ctx, '#7ec8f0', 15, 13, 50, 32);
  const cx = 15 + ((t / 40) % 66) - 16;
  ctx.save();
  ctx.beginPath();
  ctx.rect(15, 13, 50, 32);
  ctx.clip();
  rect(ctx, '#ffffff', cx, 22, 18, 5);
  rect(ctx, '#ffffff', cx + 4, 18, 9, 5);
  ctx.restore();
  rect(ctx, '#262144', 39, 13, 2, 32);
  rect(ctx, '#262144', 15, 28, 50, 2);
  rect(ctx, '#f6d9ad', 10, 48, 60, 4);
  // plant
  rect(ctx, '#c9553d', 80, 82, 14, 16);
  rect(ctx, '#262144', 80, 96, 14, 2);
  rect(ctx, '#3fbfa6', 82, 66, 4, 16);
  rect(ctx, '#3fbfa6', 88, 62, 4, 20);
  rect(ctx, '#2f9c86', 76, 70, 6, 6);
  rect(ctx, '#2f9c86', 92, 68, 6, 6);
  // poster: a happy tooth
  rect(ctx, '#262144', 196, 12, 36, 44);
  rect(ctx, '#fffaf0', 198, 14, 32, 40);
  rect(ctx, '#ffffff', 206, 20, 16, 14);
  rect(ctx, '#262144', 206, 20, 16, 2);
  rect(ctx, '#262144', 206, 20, 2, 14);
  rect(ctx, '#262144', 220, 20, 2, 14);
  rect(ctx, '#ffffff', 206, 34, 6, 8);
  rect(ctx, '#ffffff', 216, 34, 6, 8);
  rect(ctx, '#262144', 209, 25, 2, 2);
  rect(ctx, '#262144', 217, 25, 2, 2);
  rect(ctx, '#ff7a59', 211, 29, 6, 2);
  rect(ctx, '#ffc93c', 202, 46, 24, 4);
  // lamp and dental chair
  rect(ctx, '#262144', 139, 0, 2, 30);
  rect(ctx, '#262144', 128, 30, 24, 8);
  rect(ctx, '#ffc93c', 130, 32, 20, 4);
  if (Math.floor(t / 500) % 2 === 0) rect(ctx, 'rgba(255,201,60,0.18)', 120, 38, 40, 40);
  rect(ctx, '#262144', 134, 112, 12, 18);
  rect(ctx, '#262144', 124, 128, 32, 6);
  rect(ctx, '#262144', 106, 98, 62, 14);
  rect(ctx, '#3fbfa6', 108, 100, 58, 10);
  rect(ctx, '#262144', 160, 66, 12, 36);
  rect(ctx, '#3fbfa6', 162, 68, 8, 32);
  rect(ctx, '#262144', 158, 60, 16, 8);
  rect(ctx, '#3fbfa6', 160, 62, 12, 4);
  // tool tray
  rect(ctx, '#262144', 92, 88, 2, 14);
  rect(ctx, '#262144', 84, 86, 20, 4);
  rect(ctx, '#cfdde6', 86, 82, 3, 4);
  rect(ctx, '#cfdde6', 92, 81, 2, 5);
  rect(ctx, '#cfdde6', 97, 83, 4, 3);
}

function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  rect(ctx, '#262144', x, y, 14, 9);
  rect(ctx, '#fffaf0', x + 1, y + 1, 12, 7);
  rect(ctx, '#262144', x + 4, y + 9, 3, 2);
  const n = 1 + (Math.floor(t / 250) % 3);
  for (let i = 0; i < n; i++) rect(ctx, '#262144', x + 3 + i * 3, y + 4, 2, 2);
}

export interface SceneState {
  look: PatientLook;
  showRobot: boolean;
  talking: 'dentist' | 'patient' | 'ai' | null;
  robotBusy: boolean;
  /** Set when the patient leaves: hearts kept and when they left (ms). */
  leaving: { hearts: number; since: number } | null;
  reduceMotion: boolean;
}

export function drawScene(ctx: CanvasRenderingContext2D, s: SceneState, t: number) {
  ctx.imageSmoothingEnabled = false;
  room(ctx, t);
  const bob = s.reduceMotion ? 0 : Math.round(Math.sin(t / 300) * 2);
  const talk = (who: SceneState['talking']) => (s.talking === who && !s.reduceMotion ? Math.floor(t / 120) % 2 : 0);
  const pal: Palette = { ...BASE, H: s.look.hair, T: s.look.shirt };

  sprite(ctx, DENTIST, BASE, 44, 64 - talk('dentist'));
  const px = s.leaving ? 176 + Math.min(40, (t - s.leaving.since) / 60) : 176;
  const rows = PATIENT[s.look.style];
  sprite(ctx, rows, pal, px, 100 - rows.length * 2 - talk('patient'));
  if (s.showRobot) sprite(ctx, ROBOT, BASE, 214, 30 + bob - talk('ai'));

  if (s.talking === 'dentist') bubble(ctx, 58, 52, t);
  if (s.talking === 'patient') bubble(ctx, 190, 52, t);
  if (s.talking === 'ai') bubble(ctx, 230, 18, t);
  if (s.robotBusy && Math.floor(t / 150) % 2) rect(ctx, '#ffc93c', 220, 20, 4, 4);
  if (s.leaving) {
    for (let i = 0; i < 3; i++) {
      const heartPal = i < s.leaving.hearts ? BASE : { ...BASE, c: '#cfc6dd' };
      sprite(ctx, HEART, heartPal, px - 6 + i * 10, 50, 1.4);
    }
  }
}
