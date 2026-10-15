// Game 4, Build StyleMod's AI: picks and fixes through the server, the clocks,
// and the pure rules in src/demo/game4.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_SYSTEMS, BEFORE, BOXES, CHAOS, applyFix, beatsPercent, deriveTeams, majority, runSystem, scoreOf, strongCard, systemStats, type System,
} from '../src/demo/game4.ts';
import { withRoom, type TestRoom } from './harness.ts';

const pick = (r: TestRoom, id: string, box: string, card: string | null) => r.send(id, 'g4pick', { box, card });
const fix = (r: TestRoom, id: string, box: string, card: string | null = null) => r.send(id, 'g4fix', { box, card });
const teams = async (r: TestRoom) => (await r.board()).g4.teams as Array<{ team: string; system: System; fixBox: string | null; fixCard: string | null; members: number }>;

/** Three players in Group A (Team 1) and one in Group B (Team 2). */
async function fourPlayers(r: TestRoom) {
  for (const [id, note] of [['p1', 'A'], ['p2', 'A'], ['p3', 'A'], ['p4', 'B']]) await r.join(id, `N${id}`, note);
}

test('g4pick: only while building, unknown box or card refused, team majority', () => withRoom(async (r, clock) => {
  await fourPlayers(r);
  await r.phase('g4_intro');
  assert.equal((await pick(r, 'p1', '1', '1b')).body.closed, true);

  await r.phase('g4_build');
  assert.equal((await pick(r, 'p1', '9', '1b')).status, 400);
  assert.equal((await pick(r, 'p1', '1', '2a')).status, 400, "a card from another box");
  assert.equal((await pick(r, 'p1', '1', null)).status, 400);

  await pick(r, 'p1', '1', '1b');
  clock.tick(1_000);
  await pick(r, 'p2', '1', '1a');
  clock.tick(1_000);
  await pick(r, 'p3', '1', '1a');
  await pick(r, 'p4', '1', '1c');
  // A tie goes to the card picked first.
  await pick(r, 'p2', '2', '2b');
  clock.tick(1_000);
  await pick(r, 'p3', '2', '2c');

  const [t1, t2, t3] = await teams(r);
  assert.equal(t1.system['1'], '1a');
  assert.equal(t1.system['2'], '2b');
  assert.equal(t1.members, 3);
  assert.equal(t2.system['1'], '1c');
  assert.equal(t3.members, 0);
  // Phones see their own team's live counts only.
  const phone = (await r.phone('p1')).g4;
  assert.equal(phone.mine.team, '1');
  assert.deepEqual(phone.mine.counts['1'], { '1b': 1, '1a': 2 });
  assert.equal((await r.phone('p4')).g4.mine.team, '2');

  // The same picks, computed directly from the stored players.
  const derived = deriveTeams((await r.board()).players);
  assert.deepEqual(derived[0].system, t1.system);
  assert.equal(derived[0].decided, 2);
  assert.equal(derived[0].active, 3);

  // Moving on keeps every pick and closes picking.
  await r.phase('g4_run');
  assert.equal((await pick(r, 'p1', '1', '1c')).body.closed, true);
  assert.equal((await teams(r))[0].system['1'], '1a');
}));

test("g4fix: only in the fix step, and never the team's current card", () => withRoom(async (r, clock) => {
  await fourPlayers(r);
  await r.phase('g4_build');
  for (const id of ['p1', 'p2']) await pick(r, id, '4', '4b');
  assert.equal((await fix(r, 'p1', '4', '4c')).body.closed, true);

  await r.phase('g4_fix');
  assert.equal((await fix(r, 'p1', '0')).status, 400);
  const open = (await fix(r, 'p1', '4')).body.me.g4.fix;
  assert.deepEqual(open, { box: '4', at: clock.now, card: null, cardAt: 0 });
  const same = await fix(r, 'p1', '4', '4b');
  assert.equal(same.status, 400);
  assert.equal(same.body.error, 'Pick a different card');
  clock.tick(2_000);
  const chosen = (await fix(r, 'p1', '4', '4c')).body.me.g4.fix;
  assert.deepEqual(chosen, { box: '4', at: open.at, card: '4c', cardAt: clock.now });

  // p2 wants Box 7 instead: one vote each, so the box chosen first wins.
  await fix(r, 'p2', '7');
  const t1 = (await teams(r))[0];
  assert.equal(t1.fixBox, '4');
  assert.equal(t1.fixCard, '4c');
  assert.deepEqual(applyFix(t1.system, t1.fixBox, t1.fixCard)['4'], '4c');
}));

test('build and fix clocks start once, survive moving around; g4clock extend and restart', () => withRoom(async (r, clock) => {
  const g4 = async () => (await r.board()).flow.g4;
  await r.phase('g4_intro');
  assert.deepEqual(await g4(), { buildAt: null, fixAt: null, buildExtraMs: 0, fixExtraMs: 0 });
  const built = clock.now;
  await r.phase('g4_build');
  clock.tick(60_000);
  await r.phase('g4_intro');
  clock.tick(60_000);
  await r.phase('g4_build');
  assert.equal((await g4()).buildAt, built);

  await r.host('g4clock', { op: 'extend' });
  await r.host('g4clock', { op: 'extend' });
  assert.equal((await g4()).buildExtraMs, 120_000);
  for (let i = 0; i < 70; i++) await r.host('g4clock', { op: 'extend' });
  assert.equal((await g4()).buildExtraMs, 3_600_000, 'capped at an hour');
  await r.host('g4clock', { op: 'restart' });
  assert.deepEqual(await g4(), { buildAt: clock.now, fixAt: null, buildExtraMs: 0, fixExtraMs: 0 });

  const fixed = clock.now;
  await r.phase('g4_fix');
  await r.host('g4clock', { op: 'extend' });
  clock.tick(30_000);
  await r.phase('g4_chaos');
  await r.host('g4clock', { op: 'extend' }); // not a clock step: nothing happens
  await r.phase('g4_fix');
  assert.deepEqual(await g4(), { buildAt: fixed, fixAt: fixed, buildExtraMs: 0, fixExtraMs: 60_000 });
}));

test('g4reset clears every pick and both clocks, with a copy to restore', () => withRoom(async (r, clock) => {
  await fourPlayers(r);
  await r.phase('g4_build');
  await pick(r, 'p1', '3', '3c');
  await pick(r, 'p4', '3', '3a');
  await r.host('g4clock', { op: 'extend' });
  clock.tick(5_000);
  const reset = await r.host('g4reset');
  assert.equal(reset.body.flow.backupLabel, 'Game 4 restarted');
  assert.deepEqual(reset.body.flow.g4, { buildAt: clock.now, fixAt: null, buildExtraMs: 0, fixExtraMs: 0 });
  assert.ok((await r.board()).players.every((p: { g4: unknown }) => p.g4 === null));
  assert.deepEqual((await teams(r)).map((t) => t.system['3']), [null, null, null]);

  await r.host('restore');
  assert.deepEqual((await teams(r)).map((t) => t.system['3']), ['3c', '3a', null]);
}));

// ── Pure rules ──

const strong: System = Object.fromEntries(BOXES.map((b) => [b.id, strongCard(b).id]));
const grade = (box: string, g: 'S' | 'T' | 'W') => BOXES.find((b) => b.id === box)!.cards.find((c) => c.grade === g)!.id;

test('scoreOf: StyleMod before the AI scores 62, the best system 100', () => {
  assert.equal(scoreOf(BEFORE.m, BEFORE.e, BEFORE.b), 62);
  assert.equal(scoreOf(90, 6, 0), 62);
  assert.equal(scoreOf(48, 0, -20), 100);
  assert.equal(scoreOf(400, 50, 100), 0, 'never below 0');
  const best = runSystem(strong, true);
  assert.deepEqual({ m: best.m, e: best.e, b: best.b, score: best.score }, { m: 48, e: 0, b: -20, score: 100 });
  assert.deepEqual(best.stories, []);
  assert.deepEqual(best.chaos.map((h) => [h.id, h.broke, h.line]), CHAOS.map((c) => [c.id, null, c.survive]));
});

test('runSystem: empty boxes count as weak, and the chaos cards break the weak spot', () => {
  const empty = runSystem({}, false);
  assert.equal(empty.stories.length, 7);
  assert.match(empty.stories[0].text, /^Nobody decided Box 4/);
  assert.deepEqual(empty.chaos, []);

  const calm = runSystem({ ...strong, '4': grade('4', 'T') }, false);
  const hit = runSystem({ ...strong, '4': grade('4', 'T') }, true);
  assert.equal(hit.chaos[0].broke, '4');
  assert.equal(hit.e, calm.e + 5);
  assert.equal(hit.chaos[1].broke, null);

  // Box 4 strong but everything AUTO: automation bias breaks Box 5.
  assert.equal(runSystem({ ...strong, '5': grade('5', 'W') }, true).chaos[0].broke, '5');
  // Box 7 strong but "more clicks" as the goal: wrong KPI breaks Box 1.
  const kpi = runSystem({ ...strong, '1': grade('1', 'T') }, true);
  assert.equal(kpi.chaos[1].broke, '1');
  assert.equal(kpi.b, runSystem({ ...strong, '1': grade('1', 'T') }, false).b + 15);
  assert.equal(runSystem({ ...strong, '7': grade('7', 'W') }, true).chaos[1].broke, '7');
});

test('applyFix, majority, and the space of all systems', () => {
  const v1: System = { ...strong, '4': '4b' };
  assert.equal(applyFix(v1, '4', '4c')['4'], '4c');
  assert.equal(v1['4'], '4b', 'version 1 is not changed');
  assert.equal(applyFix(v1, '4', '7c'), v1, 'a card from another box is no fix');
  assert.equal(applyFix(v1, null, '4c'), v1);

  assert.equal(majority([]), null);
  assert.equal(majority([{ card: 'x', at: 5 }, { card: 'y', at: 1 }, { card: 'x', at: 9 }]), 'x');
  assert.equal(majority([{ card: 'x', at: 5 }, { card: 'y', at: 1 }]), 'y');

  assert.equal(ALL_SYSTEMS, 3 ** 7);
  assert.equal(ALL_SYSTEMS, 2187);
  const stats = systemStats();
  assert.equal(stats.top, 100);
  assert.equal(stats.atTop, 1, 'only the all-strong system scores 100');
  assert.equal(beatsPercent(100), 99);
  assert.equal(beatsPercent(0), 0);
});
