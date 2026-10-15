// Games 1 and 2 through the server: joining, answering against the clock,
// and the points each game adds to the class score.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreG1 } from '../src/demo/flow/content.ts';
import { HOST_KEY, withRoom, type TestRoom } from './harness.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
const player = async (r: TestRoom, id: string) => (await r.board()).players.find((p: any) => p.id === id);
const scoreOf = async (r: TestRoom, id: string) => (await r.board()).scores.find((s: any) => s.id === id);
/* eslint-enable @typescript-eslint/no-explicit-any */

test('joining: picked group, smallest group, unique names, locked room', () => withRoom(async (r) => {
  assert.equal((await r.join('p1', 'Mai', 'B')).body.me.g1NoteId, 'B');
  // Nobody picks: the smallest group, A before C on a tie.
  assert.equal((await r.join('p2', 'An')).body.me.g1NoteId, 'A');
  assert.equal((await r.join('p3', 'Binh')).body.me.g1NoteId, 'C');
  // The same name (any case) gets a number.
  const mai2 = await r.join('p4', 'mai');
  assert.equal(mai2.body.me.nickname, 'mai 2');
  assert.equal(mai2.body.me.g1NoteId, 'A');

  // The same phone joining again keeps its name and may still change group in the lobby.
  const again = await r.join('p1', 'Mai', 'C');
  assert.equal(again.body.me.nickname, 'Mai');
  assert.equal(again.body.me.g1NoteId, 'C');

  assert.equal((await r.join('p5', '   ')).status, 400);
  assert.equal((await r.send('', 'join', { nickname: 'X' })).status, 400);

  // Locked: nobody new, but players already in can still reload.
  await r.host('settings', { settings: { joinOpen: false } });
  const locked = await r.join('p6', 'Late');
  assert.equal(locked.status, 423);
  assert.equal((await r.join('p2', 'An')).status, 200);
  const b = await r.board();
  assert.equal(b.players.length, 4);
  assert.equal(b.flow.joined, 4);
  assert.deepEqual(b.counts.notes, { A: 2, B: 0, C: 2 });
}));

test('Game 1 answers: versioned toggles, submit, deadline plus grace, stale rounds', () => withRoom(async (r, clock) => {
  await r.join('p1', 'Mai', 'A');
  await r.join('p2', 'An', 'A');
  await r.join('p3', 'Binh', 'B');
  // Before Game 1 starts nothing is taken.
  await r.send('p1', 'g1', { version: 1, selected: ['history'] });
  assert.deepEqual((await player(r, 'p1')).g1Selected, []);

  await r.phase('g1_play');
  const round = (await r.board()).flow.phaseStartedAt;
  const g1 = (id: string, version: number, selected: unknown[], extra: Record<string, unknown> = {}) =>
    r.send(id, 'g1', { version, selected, round, ...extra }).then((x) => x.body);

  // Junk is dropped from a toggle.
  assert.deepEqual((await g1('p1', 1, ['history', 7, ''])).me.g1Selected, ['history']);
  // Only a newer version wins, so toggles arriving out of order cannot undo each other.
  assert.deepEqual((await g1('p1', 1, ['scan'])).me.g1Selected, ['history']);
  await g1('p1', 3, ['history', 'scan']);
  assert.deepEqual((await g1('p1', 2, ['plan'])).me.g1Selected, ['history', 'scan']);
  // A toggle from an earlier run of Game 1 is ignored.
  const stale = await g1('p1', 9, ['plan'], { round: round - 1 });
  assert.equal(stale.stale, true);
  assert.deepEqual((await player(r, 'p1')).g1Selected, ['history', 'scan']);

  clock.tick(50_000);
  const done = await g1('p1', 4, ['history', 'scan', 'medicine'], { submit: true });
  assert.equal(done.me.g1SubmittedAt, clock.now);
  // Handed in: no more changes.
  assert.deepEqual((await g1('p1', 5, [])).me.g1Selected, ['history', 'scan', 'medicine']);

  // 180 s plus 3 s grace: still taken, timed at the end of the clock.
  clock.tick(133_000);
  assert.equal((await g1('p2', 1, ['history'], { submit: true })).me.g1SubmittedAt, round + 180_000);
  clock.tick(1);
  assert.deepEqual((await g1('p3', 1, ['xray'], { submit: true })).me.g1Selected, []);
  assert.equal((await r.board()).counts.g1Done, 2);
}));

test('Game 1 extend: +30 s and phones handed in by the clock open again', () => withRoom(async (r, clock) => {
  for (const [id, name] of [['p1', 'Mai'], ['p2', 'An'], ['p3', 'Binh']]) await r.join(id, name, 'A');
  await r.phase('g1_play');
  const t0 = clock.now;
  clock.tick(60_000);
  await r.send('p1', 'g1', { version: 1, selected: ['history'], submit: true });
  clock.tick(121_000); // 181 s: the phone's clock hands it in
  await r.send('p2', 'g1', { version: 1, selected: ['scan'], submit: true });
  assert.equal((await player(r, 'p2')).g1SubmittedAt, t0 + 180_000);

  const ext = await r.host('extend');
  assert.equal(ext.body.flow.g1Ms, 210_000);
  assert.equal((await player(r, 'p1')).g1SubmittedAt, t0 + 60_000, 'a player who pressed Submit stays submitted');
  assert.equal((await player(r, 'p2')).g1SubmittedAt, null);

  clock.tick(19_000);
  await r.send('p2', 'g1', { version: 2, selected: ['scan', 'history'], submit: true });
  assert.deepEqual((await player(r, 'p2')).g1Selected, ['scan', 'history']);
  clock.tick(13_000); // 213 s = 210 + grace
  await r.send('p3', 'g1', { version: 1, selected: ['plan'] });
  clock.tick(1);
  await r.send('p3', 'g1', { version: 2, selected: ['next'] });
  assert.deepEqual((await player(r, 'p3')).g1Selected, ['plan']);

  // Extend does nothing outside Game 1.
  await r.phase('g1_reveal');
  assert.equal((await r.host('extend')).body.flow.g1Ms, 210_000);
}));

test('Game 1 score: 100 per mistake found, minus 100 per correct line circled, 0 to 300', () => withRoom(async (r) => {
  assert.deepEqual(scoreG1('A', ['history', 'scan', 'medicine']), { caught: 3, falseAlarms: 0, score: 3, perfect: true });
  assert.deepEqual(scoreG1('A', ['history', 'plan']), { caught: 1, falseAlarms: 1, score: 0, perfect: false });
  assert.equal(scoreG1('A', ['visit', 'plan', 'next']).score, 0, 'never below 0');
  assert.equal(scoreG1('B', ['history', 'xray']).score, 2);
  assert.equal(scoreG1('A', ['history', 'xray']).score, 1, "B's line ids mean nothing on note A");

  const plays: Array<[string, string, string[], number]> = [
    ['p1', 'A', ['history', 'scan', 'medicine'], 300],
    ['p2', 'A', ['history', 'scan', 'medicine', 'plan'], 200],
    ['p3', 'B', ['xray', 'next'], 0],
    ['p4', 'C', ['blood'], 100],
    ['p5', 'C', [], 0],
    ['p6', 'A', ['visit', 'plan', 'next'], 0],
  ];
  for (const [id, note] of plays) await r.join(id, `N${id}`, note);
  await r.phase('g1_play');
  for (const [id, , selected] of plays) if (selected.length) await r.send(id, 'g1', { version: 1, selected });
  for (const [id, , , points] of plays) {
    const s = await scoreOf(r, id);
    assert.equal(s.g1, points, id);
    assert.equal(s.total, points);
  }
  const top = await r.phone('p1');
  assert.equal(top.myScore.rank, 1);
  assert.equal(top.myScore.of, 6);
  assert.equal((await r.phone('p5')).myScore.rank, 4);
  assert.equal(top.players, undefined, 'phones get counts, not everyone');
}));

test('Game 2: sign window, spot window and score', () => withRoom(async (r, clock) => {
  for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) await r.join(id, `N${id}`);
  await r.host('settings', { settings: { g2ShowSec: 5, g2VoteSec: 6 } });
  await r.phase('g2_play');
  const round = clock.now;
  const sign = (id: string, signed: boolean, extra = {}) => r.send(id, 'g2sign', { signed, round, ...extra }).then((x) => x.body.me);
  const spot = (id: string, line: string) => r.send(id, 'g2spot', { line, round }).then((x) => x.body.me);

  clock.tick(4_999); // the note is still showing
  assert.equal((await sign('p1', false)).g2Signed, null);
  clock.tick(1);
  assert.equal((await sign('p1', false)).g2SignedAt, round + 5_000);
  const auto = await sign('p2', true, { auto: true });
  assert.equal(auto.g2Signed, true);
  assert.equal(auto.g2Auto, true);
  // A vote is final.
  assert.equal((await sign('p1', true)).g2Signed, false);

  clock.tick(1_000);
  assert.equal((await spot('p1', 'allergy')).g2Spotted, 'allergy');
  assert.equal((await spot('p1', 'visit')).g2Spotted, 'allergy', 'a spot is final');
  clock.tick(2_000);
  assert.equal((await r.send('p5', 'g2sign', { signed: false, round: round - 1 })).body.stale, true);
  assert.equal((await sign('p5', false)).g2Signed, false);
  assert.equal((await spot('p5', '')).g2Spotted, 'none');

  clock.tick(5_000); // 13 s = 5 show + 6 vote + 2 grace
  assert.equal((await sign('p3', true)).g2Signed, true);
  assert.equal((await spot('p2', 'medicine')).g2Spotted, 'medicine', "p2's spot window ends 8 s after its vote");
  clock.tick(1);
  assert.equal((await sign('p4', false)).g2Signed, null);
  assert.equal((await spot('p4', 'allergy')).g2Spotted, null, 'no spot without a vote');
  clock.tick(8_000); // p3 voted at 13 s, so its window closed at 21 s
  assert.equal((await spot('p3', 'medicine')).g2Spotted, null);

  const expected: Record<string, number> = { p1: 300, p2: 200, p3: 0, p4: 0, p5: 100 };
  for (const [id, points] of Object.entries(expected)) assert.equal((await scoreOf(r, id)).g2, points, id);

  // Playing Game 2 again clears it, with one copy kept.
  await r.phase('g2_ready');
  const again = await r.phase('g2_play');
  assert.equal(again.body.flow.backupLabel, 'Game 2 restarted');
  assert.equal((await player(r, 'p1')).g2Signed, null);
}));

test('host key: the first projector owns the room', () => withRoom(async (r) => {
  assert.equal((await r.board()).flow.hosted, false);
  assert.equal((await r.host('claim')).status, 200);
  const b = await r.board();
  assert.equal(b.flow.hosted, true);
  assert.equal(b.flow.hostKey, undefined, 'the key is never sent out');
  assert.equal((await r.host('phase', { phase: 'g1_play' }, 'other-laptop')).status, 403);
  assert.equal((await r.host('claim', {}, '')).status, 400);
  assert.equal((await r.host('dance')).status, 400);
  assert.equal((await r.phase('g9_play')).status, 400);
  assert.equal((await r.board()).flow.phase, 'lobby');
  assert.equal((await r.host('claim', {}, HOST_KEY)).status, 200);
}));

test('settings are clamped, cleaned, used by the next game and kept by a reset', () => withRoom(async (r) => {
  const res = await r.host('settings', {
    settings: {
      g1Sec: 5, g2ShowSec: 999, g2VoteSec: 7.6, chartSec: 'x',
      patients: ['c9', 'c2', 'c2'],
      names: { c1: '  Ana   Lee ', c9: 'Nobody', c2: 'a'.repeat(40), c3: '   ' },
      joinOpen: 'no', g4BuildSec: 10, g4FixSec: 5000,
    },
  });
  assert.deepEqual(res.body.flow.settings, {
    g1Sec: 30, g2ShowSec: 30, g2VoteSec: 8, chartSec: 90,
    patients: ['c2'],
    names: { c1: 'Ana Lee', c2: 'a'.repeat(24) },
    joinOpen: true, g4BuildSec: 60, g4FixSec: 900,
  });
  // Never no patients.
  assert.deepEqual((await r.host('settings', { settings: { patients: [] } })).body.flow.settings.patients, ['c1', 'c2', 'c3']);
  assert.equal((await r.phase('g1_play')).body.flow.g1Ms, 30_000);
  assert.equal((await r.host('reset')).body.flow.settings.g1Sec, 30);
}));
