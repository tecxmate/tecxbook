// The two incidents from the pilot class (2026-10-15), replayed against the
// server to show they are fixed, and a restart in the middle of a class.
//
// (a) The lecturer went back to the lobby to show the QR code for late
//     joiners, then forward again, and Game 1 restarted: every score was wiped.
// (b) A student from team A scanned again on a new browser, landed in another
//     team and could not get back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withRoom, type TestRoom } from './harness.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
const byId = (list: any[]) => Object.fromEntries(list.map((x) => [x.id, x]));
const player = async (r: TestRoom, id: string) => byId((await r.board()).players)[id];
const score = async (r: TestRoom, id: string) => byId((await r.board()).scores)[id];
/* eslint-enable @typescript-eslint/no-explicit-any */
const ALL_A = ['history', 'scan', 'medicine'];

// ── (a) Game 1 restarted by moving around ──
//
// The projector side of the fix is in src/demo/flow/Host.tsx, go(): once
// anyone has answered Game 1, NEXT into g1_play goes on to g1_reveal and BACK
// into it goes to the lobby, so moving around never restarts the game. Only
// the "Play Game 1 again" button in ⚙ (go with replay = true, after a confirm)
// sends phase g1_play again. That lives in a React component and is not tested
// here. The tests below cover the server side: even if g1_play is sent again,
// a copy is kept and one press of "restore" brings everything back.

test('incident (a): lobby and back to Game 1 keeps a copy, and restore brings every answer back', () => withRoom(async (r, clock) => {
  await r.join('p1', 'Mai', 'A');
  await r.join('p2', 'An', 'B');
  await r.join('p3', 'Binh', 'C');
  await r.phase('g1_play');
  clock.tick(40_000);
  await r.send('p1', 'g1', { version: 3, selected: ALL_A, submit: true });
  await r.send('p2', 'g1', { version: 2, selected: ['xray', 'plan'] });
  await r.send('p3', 'g1', { version: 1, selected: ['blood', 'medicine'], submit: true });
  const before = await r.board();
  assert.deepEqual(before.scores.map((s: { id: string; g1: number }) => [s.id, s.g1]), [['p1', 300], ['p3', 200], ['p2', 0]]);

  // Back to the lobby for the QR code, a late joiner, then forward again.
  await r.phase('lobby');
  await r.join('p4', 'Late');
  clock.tick(5_000);
  const again = await r.phase('g1_play');
  assert.equal(again.body.flow.backupLabel, 'Game 1 restarted');
  assert.equal(again.body.flow.backupAt, clock.now);
  const wiped = await r.board();
  for (const p of wiped.players) {
    assert.deepEqual(p.g1Selected, []);
    assert.equal(p.g1SubmittedAt, null);
  }
  assert.ok(wiped.scores.every((s: { total: number }) => s.total === 0));

  // A second bounce, with nothing answered, must not replace the copy with an empty one.
  const backupAt = clock.now;
  clock.tick(5_000);
  await r.phase('lobby');
  assert.equal((await r.phase('g1_play')).body.flow.backupAt, backupAt);

  const restored = await r.host('restore');
  assert.equal(restored.status, 200);
  assert.equal(restored.body.flow.backupAt, null);
  const after = await r.board();
  const afterPlayers = byId(after.players);
  for (const p of before.players) assert.deepEqual(afterPlayers[p.id], p);
  assert.deepEqual(after.scores.filter((s: { id: string }) => s.id !== 'p4'), before.scores);
  assert.equal(after.players.length, 4, 'the late joiner stays');

  assert.equal((await r.host('restore')).status, 404, 'one undo only');
}));

test('incident (a): "Start again" (reset) can be undone, Game 3 charts included', () => withRoom(async (r, clock) => {
  await r.host('settings', { settings: { g1Sec: 120 } });
  await r.join('p1', 'Mai', 'A');
  await r.join('p2', 'An', 'A');
  await r.phase('g1_play');
  await r.send('p1', 'g1', { version: 1, selected: ALL_A });
  await r.hello('1', { id: 'p1', job: 'dentist', name: 'Dr Mai' });
  await r.hello('1', { id: 'p2', job: 'nurse1', name: 'An', follow: 'Dr Mai' });
  await r.sign('1', 'Dr Mai', 800);
  await r.sign('1', 'Dr Mai', 1000);
  const before = await r.board();
  const charts = (await r.call('/api/demo-results', 'GET')).body.results;

  clock.tick(1_000);
  const reset = await r.host('reset');
  assert.equal(reset.body.flow.phase, 'lobby');
  assert.equal(reset.body.flow.backupLabel, 'Room started again');
  assert.equal(reset.body.flow.settings.g1Sec, 120);
  assert.equal((await r.host('claim', {}, 'other-laptop')).status, 403, 'the projector still owns the room');
  assert.equal((await r.board()).players.length, 0);
  assert.equal((await r.phone('p1')).me, null);
  assert.deepEqual((await r.call('/api/demo-results', 'GET')).body.results, []);

  await r.host('restore');
  const after = await r.board();
  assert.deepEqual(after.players, before.players);
  assert.deepEqual(after.scores, before.scores);
  assert.equal(after.flow.joined, 2);
  assert.deepEqual((await r.call('/api/demo-results', 'GET')).body.results, charts);
  assert.equal((await r.sign('1', 'Dr Mai', 900)).body.id, 3, 'chart numbers carry on');
}));

test('incident (a): a reset of an empty room leaves nothing to undo', () => withRoom(async (r) => {
  await r.host('reset');
  assert.equal((await r.board()).flow.backupAt, null);
  assert.equal((await r.host('restore')).status, 404);
}));

// ── (b) Scanning again on a new browser ──

test('incident (b): a second browser within 20 s is a new player, not a takeover', () => withRoom(async (r, clock) => {
  await r.join('p1', 'Mai', 'A');
  await r.phase('g1_play');
  await r.send('p1', 'g1', { version: 1, selected: ALL_A });
  clock.tick(20_000); // exactly 20 s since p1's last request
  const twin = await r.join('p2', 'mai ');
  assert.equal(twin.status, 200);
  assert.equal(twin.body.rejoined, undefined);
  assert.equal(twin.body.me.nickname, 'mai 2');
  assert.deepEqual((await player(r, 'p1')).g1Selected, ALL_A);

  // A phone that keeps polling keeps its name, however long since it last answered.
  clock.tick(15_000);
  await r.phone('p1');
  clock.tick(15_000);
  const third = await r.join('p3', 'MAI');
  assert.equal(third.body.rejoined, undefined);
  assert.equal(third.body.me.nickname, 'MAI 3');
  assert.equal((await r.board()).players.length, 3);
}));

test('incident (b): after 20 s of silence the same name takes the old player back, even in a locked room', () => withRoom(async (r, clock) => {
  await r.join('p1', 'Mai', 'A');
  await r.join('p2', 'An', 'B');
  await r.phase('g1_play');
  await r.send('p1', 'g1', { version: 1, selected: ALL_A, submit: true });
  await r.hello('1', { id: 'p1', job: 'dentist', name: 'Dr Mai' });
  const old = await player(r, 'p1');
  const oldScore = await score(r, 'p1');
  assert.equal(oldScore.g1, 300);

  clock.tick(20_001);
  // New browser, different case and spaces, and it even picks another group.
  const back = await r.join('p9', ' MAI ', 'C');
  assert.equal(back.status, 200);
  assert.equal(back.body.rejoined, true);
  assert.deepEqual(back.body.me, { ...old, id: 'p9' });
  assert.deepEqual(await score(r, 'p9'), { ...oldScore, id: 'p9' });
  assert.equal(await player(r, 'p1'), undefined, 'the old id is gone');
  assert.equal((await r.phone('p1')).me, null);
  assert.equal((await r.send('p1', 'g1', { version: 2, selected: [] })).status, 404);
  assert.equal((await r.board()).flow.joined, 2, 'not counted as a new player');

  // Locked room: the rejoin is checked before the lock (demo/worker.ts, flow(): `back` before `joinOpen`).
  await r.host('settings', { settings: { joinOpen: false } });
  clock.tick(20_001);
  const locked = await r.join('p10', 'mai');
  assert.equal(locked.status, 200);
  assert.equal(locked.body.rejoined, true);
  assert.equal(locked.body.me.g1NoteId, 'A');
  assert.equal((await r.join('p11', 'Stranger')).status, 423);
}));

test("incident (b): the lecturer's move keeps Game 1 graded on the note played and clears Game 4 picks", () => withRoom(async (r) => {
  await r.join('p1', 'Mai', 'A');
  await r.join('p2', 'An', 'A');
  await r.phase('g1_play');
  await r.send('p1', 'g1', { version: 1, selected: ALL_A });
  await r.phase('g4_build');
  await r.send('p1', 'g4pick', { box: '1', card: '1b' });

  await r.host('move', { id: 'p1', note: 'B' });
  const moved = await player(r, 'p1');
  assert.equal(moved.g1NoteId, 'B');
  assert.equal(moved.g1Note, 'A');
  assert.equal(moved.g4, null);
  // Against note B, "scan" is not a line, so this would be 200.
  assert.equal((await score(r, 'p1')).g1, 300);
  const teams = (await r.board()).g4.teams;
  assert.deepEqual(teams.map((t: { members: number }) => t.members), [1, 1, 0]);
  assert.equal(teams[0].system['1'], null);

  // Moving back keeps the note the answers belong to.
  await r.host('move', { id: 'p1', note: 'A' });
  assert.equal((await player(r, 'p1')).g1Note, 'A');
  // No-ops: the same group, an unknown group, an unknown player.
  for (const extra of [{ id: 'p1', note: 'A' }, { id: 'p1', note: 'D' }, { id: 'nobody', note: 'B' }]) {
    assert.equal((await r.host('move', extra)).status, 200);
  }
  assert.equal((await player(r, 'p1')).g1NoteId, 'A');
  // A player who never played Game 1 has no old note to keep.
  await r.host('move', { id: 'p2', note: 'C' });
  assert.equal((await player(r, 'p2')).g1Note, undefined);
}));

test('incident (b): after a move, playing Game 1 again is graded on the new note', {
  todo: 'demo/worker.ts:612-620 (phase g1_play) clears the answers but not p.g1Note, so the replay is scored against the old note while the phone shows the new one (Player.tsx:455 uses g1NoteId)',
}, () => withRoom(async (r) => {
  await r.join('p1', 'Mai', 'A');
  await r.phase('g1_play');
  await r.send('p1', 'g1', { version: 1, selected: ALL_A });
  await r.host('move', { id: 'p1', note: 'B' });
  await r.phase('lobby');
  await r.phase('g1_play');
  await r.send('p1', 'g1', { version: 2, selected: ['history', 'xray', 'medicine'] });
  assert.equal((await score(r, 'p1')).g1, 300);
}));

test('incidents (a)+(b): restore after the student rejoined gives the answers to the phone in use', {
  todo: 'demo/worker.ts:669 restores the backup by player id, so the old id comes back as a second "Mai" holding the answers, and the rejoined phone keeps 0',
}, () => withRoom(async (r, clock) => {
  await r.join('p1', 'Mai', 'A');
  await r.phase('g1_play');
  await r.send('p1', 'g1', { version: 1, selected: ALL_A });
  await r.phase('lobby');
  await r.phase('g1_play'); // the accidental restart
  clock.tick(20_001);
  await r.join('p9', 'Mai'); // meanwhile Mai came back on a new browser
  await r.host('restore');
  const b = await r.board();
  assert.equal(b.players.filter((p: { nickname: string }) => p.nickname === 'Mai').length, 1);
  assert.equal((await score(r, 'p9')).g1, 300);
}));

// ── (c) The room restarts mid-class ──

test('restart durability: a restarted room loads every player, answer, chart, setting and the undo copy', () => withRoom(async (r, clock) => {
  await r.host('settings', { settings: { g1Sec: 120, g2ShowSec: 5 } });
  await r.join('p1', 'Mai', 'A');
  await r.join('p2', 'An', 'B');
  await r.join('p3', 'Binh', 'C');
  await r.phase('g1_play');
  await r.send('p1', 'g1', { version: 1, selected: ALL_A, submit: true });
  await r.send('p2', 'g1', { version: 1, selected: ['xray'] });
  await r.phase('lobby');
  await r.phase('g1_play'); // the incident: answers wiped, copy kept

  r.restart();
  assert.equal((await r.board()).flow.backupLabel, 'Game 1 restarted');
  assert.equal((await r.host('claim', {}, 'other-laptop')).status, 403);
  await r.host('restore');
  assert.equal((await score(r, 'p1')).g1, 300);

  await r.phase('g2_play');
  clock.tick(5_000);
  await r.send('p1', 'g2sign', { signed: false });
  await r.send('p1', 'g2spot', { line: 'allergy' });
  await r.phase('g3');
  await r.hello('1', { id: 'p1', job: 'dentist', name: 'Dr Mai' });
  await r.hello('1', { id: 'p2', job: 'nurse1', name: 'An', follow: 'Dr Mai' });
  await r.sign('1', 'Dr Mai', 1000);
  await r.call('/api/demo-team', 'POST', { dentist: 'Dr Mai', phase: 'chart', elapsedMs: 3_000 }, '&team=1');
  await r.phase('g4_build');
  await r.send('p1', 'g4pick', { box: '3', card: '3c' });
  clock.tick(20_001);
  await r.join('p9', 'binh'); // p3 came back on a new browser
  await r.host('move', { id: 'p2', note: 'A' });

  const board = await r.board();
  const charts = (await r.call('/api/demo-results', 'GET')).body.results;
  assert.equal(byId(board.scores).p1.total, 300 + 300 + 250);

  r.restart();
  assert.deepEqual(await r.board(), board);
  assert.deepEqual((await r.call('/api/demo-results', 'GET')).body.results, charts);
  const states = (await r.hello('1', { id: 'p2', job: 'nurse1', name: 'An', follow: 'Dr Mai' })).body.states;
  assert.equal(states[0].startedAt, board.now - 20_001 - 3_000);
  assert.equal(await player(r, 'p3'), undefined);
  assert.equal((await r.host('claim', {}, 'other-laptop')).status, 403);
}));

test('restart durability: right after a restart, a new browser cannot take an active player\'s name', {
  todo: 'demo/worker.ts:449 reads last-seen times from memory only (`seen`, ?? 0), so after a restart every player counts as silent until their phone polls again',
}, () => withRoom(async (r, clock) => {
  await r.join('p1', 'Mai', 'A');
  await r.phase('g1_play');
  await r.send('p1', 'g1', { version: 1, selected: ALL_A });
  clock.tick(1_000);
  r.restart();
  const twin = await r.join('p2', 'Mai');
  assert.equal(twin.body.rejoined, undefined);
  assert.ok(await player(r, 'p1'));
}));
