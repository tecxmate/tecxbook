// Game 3, The Clinic: signed charts, the dentists' shared state, phones
// checking in, and the Game 3 part of the class score. Also the chart scoring.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POINTS, formatDuration, gradeFor, scoreRun } from '../src/demo/scoring.ts';
import { getScenario, type Answers } from '../src/demo/scenarios.ts';
import { HOST_KEY, withRoom } from './harness.ts';

test('/api/demo-results: POST checks the chart, GET lists, DELETE clears Game 3 only', () => withRoom(async (r) => {
  const first = await r.sign('1', 'Dr Mai', 800);
  assert.equal(first.status, 201);
  assert.equal(first.body.id, 1);
  assert.equal((await r.sign('4', 'Dr Mai', 800)).status, 400);
  assert.equal((await r.call('/api/demo-results', 'POST', { team: '1', station: 'x' })).status, 400, 'summary required');
  assert.equal((await r.call('/api/demo-results', 'POST', [1, 2])).status, 400, 'an array is not a body');
  assert.equal((await r.call('/api/demo-results', 'PUT', {})).status, 405);
  await r.call('/api/demo-results', 'POST', { team: '2', station: 'S'.repeat(60), summary: { points: 5 } });

  const list = (await r.call('/api/demo-results', 'GET')).body;
  assert.deepEqual(list.results.map((x: { id: number }) => x.id), [1, 2]);
  assert.equal(list.results[1].station.length, 40);
  assert.deepEqual(list.lineup, []);

  // No projector yet: anyone may clear.
  await r.join('p1', 'Mai');
  assert.equal((await r.call('/api/demo-results', 'DELETE')).status, 200);
  assert.deepEqual((await r.call('/api/demo-results', 'GET')).body.results, []);

  // Once a projector owns the room, only its key clears.
  await r.host('claim');
  await r.sign('1', 'Dr Mai', 800);
  assert.equal((await r.call('/api/demo-results', 'DELETE')).status, 403);
  assert.equal((await r.call('/api/demo-results', 'DELETE', undefined, '', { 'X-Host-Key': 'guess' })).status, 403);
  assert.equal((await r.call('/api/demo-results', 'DELETE', undefined, '', { 'X-Host-Key': HOST_KEY })).status, 200);
  assert.equal((await r.sign('1', 'Dr Mai', 800)).body.id, 1, 'numbering starts again');
  assert.equal((await r.board()).players.length, 1, 'players stay');
}));

test('/api/demo-team: a dentist state, with elapsedMs turned into a shared startedAt', () => withRoom(async (r, clock) => {
  const team = (t: string, body: unknown) => r.call('/api/demo-team', 'POST', body, `&team=${t}`);
  const res = await team('1', { dentist: ' Dr Mai ', scenarioId: 'c1', phase: 'chart', points: 412.6, elapsedMs: 15_000 });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.state, { scenarioId: 'c1', phase: 'chart', dentist: 'Dr Mai', points: 413, startedAt: clock.now - 15_000, updatedAt: clock.now });
  assert.equal(res.body.now, clock.now);

  assert.equal((await team('', { dentist: 'X' })).status, 400);
  assert.equal((await team('4', { dentist: 'X' })).status, 400);
  assert.equal((await team('1', { phase: 'chart' })).status, 400, 'dentist required');
  assert.equal((await r.call('/api/demo-team', 'GET', undefined, '&team=1')).status, 405);
  assert.equal((await team('1', { dentist: 'Dr An', elapsedMs: -5 })).body.state.startedAt, null);
  assert.equal((await team('1', { dentist: 'Dr An', elapsedMs: 9e9 })).body.state.startedAt, clock.now - 3_600_000);

  // One entry per dentist (any case), per team.
  await team('1', { dentist: 'dr mai', phase: 'list' });
  await team('2', { dentist: 'Dr Lan', phase: 'list' });
  const states = (await r.hello('1', { id: 'n1', job: 'nurse1' })).body.states;
  assert.deepEqual(states.map((s: { dentist: string }) => s.dentist).sort(), ['Dr An', 'dr mai']);

  // A dentist idle for 3 hours drops off the nurses' list.
  clock.tick(3 * 60 * 60 * 1000);
  assert.deepEqual((await r.hello('1', { id: 'n1', job: 'nurse1' })).body.states, []);
}));

test('/api/demo-hello: checks, who is online, and the player\'s clinic', () => withRoom(async (r, clock) => {
  assert.equal((await r.hello('', { id: 'p1', job: 'dentist' })).status, 400);
  assert.equal((await r.hello('1', { id: 'p1', job: 'surgeon' })).status, 400);
  assert.equal((await r.hello('1', { job: 'dentist' })).status, 400);
  assert.equal((await r.call('/api/demo-hello', 'GET', undefined, '&team=1')).status, 405);

  await r.join('p1', 'Mai');
  const hi = await r.hello('1', { id: 'p1', job: 'dentist', name: ' Dr Mai ' });
  assert.deepEqual(hi.body.phones.map((p: { id: string }) => p.id), ['p1']);
  assert.deepEqual((await r.board()).players[0].g3, { team: '1', job: 'dentist', name: 'Dr Mai', follow: '' });

  // A phone that switches team is moved, not counted twice. Phones that never joined are listed too.
  await r.hello('2', { id: 'p2', job: 'nurse1', name: 'An', follow: 'Dr Lan' });
  clock.tick(10_000);
  const moved = await r.hello('1', { id: 'p2', job: 'nurse2', name: 'An', follow: 'Dr Mai' });
  assert.deepEqual(moved.body.phones.map((p: { id: string }) => p.id), ['p1', 'p2']);
  assert.deepEqual((await r.hello('2', { id: 'p3', job: 'dentist', name: 'Dr Lan' })).body.phones.map((p: { id: string }) => p.id), ['p3']);

  // Silent for more than 30 s: gone from the lineup.
  clock.tick(25_000);
  const lineup = (await r.call('/api/demo-results', 'GET')).body.lineup;
  assert.deepEqual(lineup.map((p: { id: string }) => p.id), ['p2', 'p3']);
}));

test('class score: Game 3 is the clinic\'s average chart points / 4, shared by its nurses', () => withRoom(async (r) => {
  const people: Array<[string, string, Record<string, string>]> = [
    ['p1', '1', { job: 'dentist', name: 'Dr Mai' }],
    ['p2', '1', { job: 'nurse1', name: 'An', follow: 'dr mai' }],
    ['p3', '1', { job: 'nurse2', name: 'Binh' }], // never picked a dentist
    ['p4', '2', { job: 'dentist', name: 'Dr Lan' }],
    ['p5', '2', { job: 'nurse1', name: 'Chi', follow: 'Dr Mai' }], // a Dr Mai, but in the other team
  ];
  for (const [id, team, body] of people) {
    await r.join(id, body.name);
    await r.hello(team, { id, ...body });
  }
  await r.sign('1', 'Dr Mai', 800);
  await r.sign('1', 'DR MAI', 1001);
  await r.sign('1', 'Dr Lan', 5000); // the chart belongs to team 1's station, not to team 2's Dr Lan
  await r.sign('2', 'Dr Lan', -400);

  const g3 = async () => Object.fromEntries((await r.board()).scores.map((s: { id: string; g3: number }) => [s.id, s.g3]));
  // (800 + 1001) / 2 / 4 = 225.1
  assert.deepEqual(await g3(), { p1: 225, p2: 225, p3: 0, p4: 0, p5: 0 });
  const mine = (await r.phone('p2')).myScore;
  assert.equal(mine.team, '1');
  assert.equal(mine.job, 'nurse1');
  assert.equal(mine.total, 225);
  assert.equal(mine.rank, 1);

  await r.call('/api/demo-results', 'DELETE');
  assert.deepEqual(await g3(), { p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 });
}));

// ── src/demo/scoring.ts ──

const c1 = getScenario('c1')!;
const c2 = getScenario('c2')!;
const pick = (s: typeof c1, side: 'truth' | 'ai'): Answers => Object.fromEntries(s.cards.map((c) => [c.key, c[side]]));
const all = (s: typeof c1) => Object.fromEntries(s.cards.map((c) => [c.key, true]));
const labels = (r: ReturnType<typeof scoreRun>) => r.badges.map((b) => b.label);

test('gradeFor and formatDuration', () => {
  assert.deepEqual([1100, 1099, 900, 899, 650, 649, 400, 399, 0].map(gradeFor), ['S', 'A', 'A', 'B', 'B', 'C', 'C', 'D', 'D']);
  assert.deepEqual([0, 9, 65, 59.6, -5, 600].map(formatDuration), ['0:00', '0:09', '1:05', '1:00', '0:00', '10:00']);
});

test('scoreRun: careful manual charting, and the parts add up', () => {
  const r = scoreRun(c1, 'manual', pick(c1, 'truth'), all(c1), 30, false);
  const critical = c1.cards.filter((c) => c.critical).length;
  assert.equal(r.breakdown.cards, c1.cards.length * POINTS.card);
  assert.equal(r.breakdown.safety, critical * POINTS.safetyCard);
  assert.equal(r.breakdown.speed, 60 * POINTS.perSecondLeft);
  assert.equal(r.points, r.breakdown.cards + r.breakdown.safety + r.breakdown.speed + r.breakdown.hearts);
  assert.equal(r.points, 1120);
  assert.equal(r.grade, 'S');
  assert.equal(r.hearts, 3);
  assert.deepEqual(labels(r), ['CAREFUL HANDS', 'PERFECT NOTES', 'SPEED DEMON']);
  assert.equal(r.aiErrorsTotal, 0, 'manual teams have no AI errors to catch');
});

test('scoreRun: points only for checked cards; rubber stamps and wrong safety cards cost', () => {
  // Signing Scribby's draft without pressing NEXT on anything earns nothing,
  // and the wrong tooth still hurts the patient (never below 0).
  const unchecked = scoreRun(c1, 'ai', pick(c1, 'ai'), {}, 20, false);
  assert.equal(unchecked.breakdown.cards, 0);
  assert.equal(unchecked.points, 0);
  assert.equal(unchecked.hearts, 2);
  assert.deepEqual(unchecked.missedErrorIds, ['c1-teeth']);
  assert.equal(unchecked.rubberStamps, 0);

  // Confirming every one of Scribby's three mistakes on George: a rubber stamp.
  const stamped = scoreRun(c2, 'ai', pick(c2, 'ai'), all(c2), 20, false);
  assert.equal(stamped.rubberStamps, 3);
  assert.equal(stamped.hearts, 0);
  assert.equal(stamped.points, 290);
  assert.ok(labels(stamped).includes('RUBBER STAMP'));

  // Catching all of them, but out of time.
  const late = scoreRun(c2, 'ai-check', pick(c2, 'truth'), all(c2), 120, true);
  assert.equal(late.durationSec, 90);
  assert.equal(late.breakdown.speed, 0);
  assert.deepEqual(late.caughtErrorIds, ['c2-history', 'c2-inr', 'c2-rx']);
  assert.deepEqual(labels(late), ['CAREFUL HANDS', 'EAGLE EYE', 'OUT OF TIME']);
  assert.equal(late.grade, 'A');
});
