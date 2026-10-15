// Clumsy-thumb protection for the phone game.
//
// A fast double tap on a phone lands its second tap on whatever the first tap
// just put on screen: NEXT on card 3 confirms card 4 unseen, REVIEW turns into
// SIGN THE CHART, SIGN turns into NEXT PATIENT. So each new screen or card
// calls settle(), and a touch that arrives too soon after it is ignored.
// Mouse and keyboard clicks are never held back (a teacher's laptop, tests).

let lastPointer = 'mouse';
let settledAt = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType || 'mouse'; }, { capture: true, passive: true });
}

/** Something new is on screen: hold back touches for a moment. */
export function settle() {
  settledAt = performance.now();
}

/** Is this click a real, fresh tap (not the tail of a double tap)? */
export function tapOk(e: { detail?: number; timeStamp?: number }, ms = 350): boolean {
  // The second click of a double click or double tap.
  if ((e.detail ?? 1) > 1) return false;
  if (lastPointer !== 'touch' && lastPointer !== 'pen') return true;
  const at = e.timeStamp ?? performance.now();
  return at - settledAt >= ms;
}

/** A short buzz on phones that support it (Android; iPhones ignore it). */
export function buzz(ms = 40) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Some browsers throw when vibration is blocked; it is only a nicety.
  }
}
