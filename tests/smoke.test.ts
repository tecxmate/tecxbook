import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeClock, makeRoom } from './harness.ts';

test('harness: a phone joins and the projector sees it', async () => {
  const clock = fakeClock();
  try {
    const r = makeRoom();
    const j = await r.join('p1', 'Mai', 'A');
    assert.equal(j.status, 200);
    const b = await r.board();
    assert.equal(b.players.length, 1);
    assert.equal(b.players[0].g1NoteId, 'A');
  } finally { clock.restore(); }
});
