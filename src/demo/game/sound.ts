// Tiny Web Audio sound effects (square-wave blips, no files). Audio starts
// on the first tap, as browsers require.

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean) {
  muted = value;
}

export function isMuted() {
  return muted;
}

function tone(freq: number, dur = 0.06, type: OscillatorType = 'square', vol = 0.035, when = 0) {
  if (muted) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx ?? new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch {
    // No audio on this device; the game works silently.
  }
}

export const sfx = {
  blip: (who: 'dentist' | 'patient' | 'ai') => tone(who === 'patient' ? 196 : who === 'ai' ? 740 : 392, 0.03),
  select: () => { tone(880, 0.04); tone(1318, 0.05, 'square', 0.03, 0.045); },
  confirm: () => { tone(660, 0.05); tone(990, 0.06, 'square', 0.03, 0.05); },
  good: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.08, 'square', 0.035, i * 0.06)),
  bad: () => { tone(160, 0.22, 'sawtooth', 0.05); tone(110, 0.3, 'sawtooth', 0.05, 0.12); },
  warn: () => { tone(988, 0.07, 'triangle', 0.06); tone(988, 0.07, 'triangle', 0.06, 0.12); },
  robot: () => { for (let i = 0; i < 7; i++) tone(260 + Math.random() * 900, 0.05, 'square', 0.03, i * 0.075); },
  start: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.1, 'square', 0.035, i * 0.08)),
  tick: () => tone(1200, 0.03, 'square', 0.03),
  timeUp: () => [784, 659, 523, 392].forEach((f, i) => tone(f, 0.14, 'square', 0.04, i * 0.12)),
};
