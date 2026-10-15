// Cloudflare Worker for the classroom AI Scribe demo.
//
// Static files (the built page in dist-demo/) are served by Cloudflare before
// this code runs. Two dynamic routes, both per class room (?room=<name>):
//   /api/demo-results   GET list signed charts and who is in the room (the
//                       projector polls this), POST add one signed chart,
//                       DELETE clear the room
//   /api/demo-team      POST what a dentist is doing (patient, phase,
//                       countdown start), so their nurses' phones follow
//   /api/demo-hello     POST "this phone is here" every few seconds; answers
//                       with the team's dentists' states and who is online
//   /api/demo-flow      the lecturer-led flow (Games 1 and 2, Game 3, Game 4):
//                       GET the phase and this player (or everyone, for the
//                       projector), POST a player's answer or a host action
// Each room is one Durable Object, so every device reads and writes the same
// single copy of the data, with no database to set up.

import { isSpotted, scoreG1 } from '../src/demo/flow/content';
import { BOX_IDS, G4_PHASES, NEW_G4_CLOCK, deriveTeams, getCard, publicG4, teamOfGroup, type G4Clock, type G4PlayerState } from '../src/demo/game4';

interface Stub {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ROOMS: {
    idFromName(name: string): unknown;
    get(id: unknown): Stub;
  };
}

interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
  delete(key: string): Promise<boolean>;
  deleteAll(): Promise<void>;
}

interface StoredResult {
  id: number;
  team: string;
  station: string;
  summary: Record<string, unknown>;
  createdAt: string;
}

interface TeamState {
  scenarioId: string | null;
  phase: string;
  dentist: string;
  points: number | null;
  /** Server time the countdown started, so every phone shows the same clock. */
  startedAt: number | null;
  updatedAt: number;
}

/** One phone that said hello recently. Kept in memory only: if the room
 *  restarts, every phone says hello again within seconds. */
interface Phone {
  id: string;
  team: string;
  job: 'dentist' | 'nurse1' | 'nurse2';
  /** The player's name: a dentist's doctor name, a nurse's nickname. */
  name: string;
  /** The dentist a nurse is helping (empty for dentists, or not picked yet). */
  follow: string;
  at: number;
}
const JOBS = ['dentist', 'nurse1', 'nurse2'];
/** A phone that has not said hello for this long counts as gone. */
const ONLINE_MS = 30_000;

// ── Games 1 and 2 ──

const PHASES = ['lobby', 'g1_play', 'g1_reveal', 'g2_ready', 'g2_play', 'g2_reveal', 'g3', 'final', ...G4_PHASES];
const NOTE_IDS = ['A', 'B', 'C'];
const G1_GRACE_MS = 3_000;
const G2_GRACE_MS = 2_000;
const MAX_PLAYERS = 200;

interface Flow {
  phase: string;
  phaseStartedAt: number;
  /** Game 1 length, grows by 30 s per "extend". */
  g1Ms: number;
  /** Hints pushed to phones during Game 1 (0 to 3). */
  hints: number;
  /** Which reveal step the projector shows. */
  step: number;
  /** A quick class question open on phones, or null. */
  ask: string | null;
  joined: number;
  hostKey: string | null;
  settings: Settings;
  /** Game 4's build and fix clocks (started the first time each step opens). */
  g4: G4Clock;
  /** When answers were last cleared, with a copy kept for one undo (null: nothing to undo). */
  backupAt?: number | null;
  backupLabel?: string;
}

/** Everything a clear or a reset removes, kept once so the lecturer can undo it. */
interface Backup {
  at: number;
  label: string;
  players: Player[];
  results: StoredResult[];
  seq: number;
  joined: number;
}

/** A phone silent this long may be taken over by someone joining with the same name. */
const REJOIN_IDLE_MS = 20_000;

/** What the lecturer can change on the day (projector ⚙). */
interface Settings {
  g1Sec: number;
  g2ShowSec: number;
  g2VoteSec: number;
  /** Game 3 chart countdown. */
  chartSec: number;
  /** Game 3 patients the dentists may open (scenario ids, at least one). */
  patients: string[];
  /** The lecturer's names for the patients, by scenario id (empty = the built-in name). */
  names: Record<string, string>;
  /** False: nobody new can join (players already in can still reload). */
  joinOpen: boolean;
  /** Game 4 build and fix clocks. */
  g4BuildSec: number;
  g4FixSec: number;
}

const CASE_IDS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
const DEFAULT_SETTINGS: Settings = { g1Sec: 180, g2ShowSec: 8, g2VoteSec: 10, chartSec: 90, patients: ['c1', 'c2', 'c3'], names: {}, joinOpen: true, g4BuildSec: 480, g4FixSec: 240 };
const clampInt = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fallback;

function cleanSettings(raw: unknown, base: Settings): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    g1Sec: clampInt(r.g1Sec, 30, 300, base.g1Sec),
    g2ShowSec: clampInt(r.g2ShowSec, 3, 30, base.g2ShowSec),
    g2VoteSec: clampInt(r.g2VoteSec, 5, 30, base.g2VoteSec),
    chartSec: clampInt(r.chartSec, 30, 300, base.chartSec),
    patients: (() => {
      const list = Array.isArray(r.patients) ? r.patients.filter((x): x is string => CASE_IDS.includes(String(x))) : base.patients;
      // Never none: an empty list means the three main patients.
      return list.length ? [...new Set(list)] : DEFAULT_SETTINGS.patients;
    })(),
    names: (() => {
      const raw = r.names && typeof r.names === 'object' && !Array.isArray(r.names) ? (r.names as Record<string, unknown>) : base.names ?? {};
      const out: Record<string, string> = {};
      for (const id of CASE_IDS) {
        const v = raw[id];
        const name = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 24) : '';
        if (name) out[id] = name;
      }
      return out;
    })(),
    joinOpen: typeof r.joinOpen === 'boolean' ? r.joinOpen : base.joinOpen,
    g4BuildSec: clampInt(r.g4BuildSec, 60, 1800, base.g4BuildSec ?? DEFAULT_SETTINGS.g4BuildSec),
    g4FixSec: clampInt(r.g4FixSec, 60, 900, base.g4FixSec ?? DEFAULT_SETTINGS.g4FixSec),
  };
}

interface Player {
  id: string;
  nickname: string;
  joinedAt: number;
  g1NoteId: string;
  /** Set when the lecturer moves a player after Game 1: the note their Game 1 answers belong to. */
  g1Note?: string;
  g1Selected: string[];
  g1Version: number;
  g1SubmittedAt: number | null;
  g2Signed: boolean | null;
  /** True when the vote timed out and counted as a rubber-stamp "Sign". */
  g2Auto: boolean;
  /** When the sign vote landed; the second question gets 10 s from here. */
  g2SignedAt: number | null;
  g2Spotted: string | null;
  asks: Record<string, string>;
  /** Game 3 team and job, from the phone's check-ins. */
  g3: { team: string; job: string; name: string; follow: string } | null;
  /** Game 4 picks (the team is the Game 1 group). Missing in rooms from before Game 4. */
  g4?: G4PlayerState | null;
  /** Ids this player had on earlier phones or browsers (rejoined by name), so an undo finds them. */
  prevIds?: string[];
}

interface Room {
  flow: Flow;
  players: Map<string, Player>;
  results: StoredResult[];
  seq: number;
  teams: Map<string, TeamState>;
}

const newFlow = (settings: Settings = DEFAULT_SETTINGS): Flow => ({ phase: 'lobby', phaseStartedAt: Date.now(), g1Ms: settings.g1Sec * 1000, hints: 0, step: 0, ask: null, joined: 0, hostKey: null, settings, g4: { ...NEW_G4_CLOCK } });
/** The flow as phones and the projector see it: no host key. */
const publicFlow = ({ hostKey, ...open }: Flow) => ({ ...open, settings: open.settings ?? DEFAULT_SETTINGS, g4: open.g4 ?? NEW_G4_CLOCK, hosted: !!hostKey });
const short = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

const MAX_RESULTS = 1000;
const TEAM_IDS = ['1', '2', '3'];
/** A dentist idle this long drops off the nurses' list. */
const TEAM_STATE_TTL_MS = 3 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16_000;

/** A JSON object body, or a throw: `null`, arrays and numbers are not bodies. */
function parseObject(text: string): Record<string, unknown> {
  const v: unknown = JSON.parse(text);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
  return v as Record<string, unknown>;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function cleanRoom(value: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'class';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!['/api/demo-results', '/api/demo-team', '/api/demo-hello', '/api/demo-flow'].includes(url.pathname)) return json({ error: 'Not found' }, 404);
    const room = env.ROOMS.get(env.ROOMS.idFromName(cleanRoom(url.searchParams.get('room'))));
    return room.fetch(request);
  },
};

export class ResultsRoom {
  storage: Storage;
  phones = new Map<string, Phone>();
  /** When each Games 1-4 phone last asked (in memory): a quiet one can be taken back by name. */
  seen = new Map<string, number>();
  /** When this copy of the room started. Phones not heard from since count as seen then, so
   *  right after a restart nobody's name can be taken until they have had time to ask again. */
  startedAt = Date.now();
  /** The whole room, kept in memory: polls cost no storage reads. Every write
   *  goes to both, and a restarted room loads it back from storage once. */
  room: Room | null = null;
  loading: Promise<Room> | null = null;

  constructor(state: { storage: Storage }) {
    this.storage = state.storage;
  }

  load(): Promise<Room> {
    if (this.room) return Promise.resolve(this.room);
    this.loading ??= (async () => {
      const list = async <T>(prefix: string) => this.storage.list<T>({ prefix });
      const room: Room = {
        flow: await (async () => {
          const f = (await this.storage.get<Flow>('flow')) ?? newFlow();
          f.settings = cleanSettings(f.settings, DEFAULT_SETTINGS);
          f.g4 ??= { ...NEW_G4_CLOCK };
          return f;
        })(),
        players: new Map([...(await list<Player>('p:')).values()].map((p) => [p.id, p])),
        results: [...(await list<StoredResult>('r:')).values()],
        seq: (await this.storage.get<number>('seq')) ?? 0,
        teams: await list<TeamState>('team:'),
      };
      this.room = room;
      return room;
    })().catch((e) => {
      this.loading = null;
      throw e;
    });
    return this.loading;
  }

  async savePlayer(room: Room, p: Player) {
    room.players.set(p.id, p);
    await this.storage.put(`p:${p.id}`, p);
  }

  /** Keeps a copy of every player and Game 3 result before answers are cleared (one level of undo). */
  async saveBackup(room: Room, flow: Flow, label: string, now: number) {
    const backup: Backup = {
      at: now,
      label,
      players: [...room.players.values()].map((p) => structuredClone(p)),
      results: room.results.map((r) => structuredClone(r)),
      seq: room.seq,
      joined: flow.joined,
    };
    await this.storage.put('backup', backup);
    flow.backupAt = now;
    flow.backupLabel = label;
  }

  async saveFlow(room: Room, flow: Flow) {
    room.flow = flow;
    await this.storage.put('flow', flow);
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const room = await this.load();
    if (path === '/api/demo-team') return this.team(request, room);
    if (path === '/api/demo-hello') return this.hello(request, room);
    if (path === '/api/demo-flow') return this.flow(request, room);

    if (request.method === 'GET') return json({ results: room.results, lineup: this.online() });

    if (request.method === 'POST') {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) return json({ error: 'Too large' }, 413);
      let body: { team?: unknown; station?: unknown; summary?: unknown };
      try {
        body = parseObject(text);
      } catch {
        return json({ error: 'Invalid JSON' }, 400);
      }
      if (!['1', '2', '3'].includes(String(body.team)) || !body.summary || typeof body.summary !== 'object') {
        return json({ error: 'team and summary required' }, 400);
      }
      const id = room.seq + 1;
      if (id > MAX_RESULTS) return json({ error: 'Room is full' }, 409);
      const row: StoredResult = {
        id,
        team: String(body.team),
        station: typeof body.station === 'string' ? body.station.slice(0, 40) : '',
        summary: body.summary as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      };
      room.seq = id;
      room.results.push(row);
      await this.storage.put('seq', id);
      await this.storage.put(`r:${String(id).padStart(6, '0')}`, row);
      return json({ ok: true, id }, 201);
    }

    if (request.method === 'DELETE') {
      if (room.flow.hostKey && request.headers.get('X-Host-Key') !== room.flow.hostKey) return json({ error: 'Only the projector can clear results' }, 403);
      // Clears Game 3 only; the flow and its players stay.
      const keys = [...room.results.map((r) => `r:${String(r.id).padStart(6, '0')}`), ...room.teams.keys(), 'seq'];
      room.results = [];
      room.teams.clear();
      room.seq = 0;
      for (const k of keys) await this.storage.delete(k);
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  }

  async team(request: Request, room: Room): Promise<Response> {
    const team = new URL(request.url).searchParams.get('team') ?? '';
    if (!TEAM_IDS.includes(team)) return json({ error: 'team required' }, 400);

    if (request.method === 'POST') {
      const text = await request.text();
      if (text.length > 2000) return json({ error: 'Too large' }, 413);
      let body: { scenarioId?: unknown; phase?: unknown; dentist?: unknown; points?: unknown; elapsedMs?: unknown };
      try {
        body = parseObject(text);
      } catch {
        return json({ error: 'Invalid JSON' }, 400);
      }
      const dentist = typeof body.dentist === 'string' ? body.dentist.trim().slice(0, 40) : '';
      if (!dentist) return json({ error: 'dentist required' }, 400);
      const now = Date.now();
      // The chart phone sends how long its countdown has run; turning that into
      // a server time keeps every phone's clock the same whatever their own time.
      const elapsed = typeof body.elapsedMs === 'number' && body.elapsedMs >= 0 ? Math.min(body.elapsedMs, 3_600_000) : null;
      const state: TeamState = {
        scenarioId: typeof body.scenarioId === 'string' ? body.scenarioId.slice(0, 8) : null,
        phase: typeof body.phase === 'string' ? body.phase.slice(0, 12) : 'idle',
        dentist,
        points: typeof body.points === 'number' ? Math.round(body.points) : null,
        startedAt: elapsed === null ? null : now - elapsed,
        updatedAt: now,
      };
      // One entry per dentist, so a team can run two clinics side by side.
      const key = `team:${team}:${dentist.toLowerCase()}`;
      room.teams.set(key, state);
      await this.storage.put(key, state);
      return json({ state, now });
    }

    return json({ error: 'Method not allowed' }, 405);
  }

  // ── Games 1 and 2, and the running score ──

  async flow(request: Request, room: Room): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const all = [...room.players.values()];
      const me = room.players.get(url.searchParams.get('me') ?? '') ?? null;
      if (me) this.seen.set(me.id, Date.now());
      const board = scoreboard(all, room.results);
      const mine = me ? board.find((x) => x.id === me.id) : undefined;
      return json({
        flow: publicFlow(room.flow),
        me,
        myScore: mine ? { ...mine, rank: 1 + board.filter((x) => x.total > mine.total).length, of: board.length } : null,
        // Phones get counts only; the projector asks for everyone.
        players: url.searchParams.get('all') === '1' ? all : undefined,
        scores: url.searchParams.get('all') === '1' ? board : undefined,
        counts: {
          players: all.length,
          g1Done: all.filter((p) => p.g1SubmittedAt !== null).length,
          notes: Object.fromEntries(NOTE_IDS.map((n) => [n, all.filter((p) => p.g1NoteId === n).length])),
        },
        // Game 4 only: every team's system, and live counts for this phone's team.
        g4: room.flow.phase.startsWith('g4_') ? publicG4(deriveTeams(all), me ? teamOfGroup(me.g1NoteId) : null) : undefined,
        now: Date.now(),
      });
    }
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const text = await request.text();
    if (text.length > 2000) return json({ error: 'Too large' }, 413);
    let body: Record<string, unknown>;
    try {
      body = parseObject(text);
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    const flow = room.flow;
    const now = Date.now();
    const elapsed = now - flow.phaseStartedAt;

    if (body.type === 'host') return this.host(room, body, now);

    const id = short(body.id, 40);
    if (!id) return json({ error: 'id required' }, 400);
    let me = room.players.get(id);
    // Any message from a phone (joining too) means it is in use: nobody else may take its name.
    this.seen.set(id, now);

    if (body.type === 'join') {
      const nickname = short(body.nickname, 16);
      if (!nickname) return json({ error: 'nickname required' }, 400);
      const wanted = short(body.note, 1);
      if (me) {
        const others = [...room.players.values()].filter((p) => p.id !== me!.id);
        me.nickname = uniqueName(nickname, others);
        // A group can still be changed until Game 1 starts.
        // Not after Game 1 was played: the answers belong to the old note.
        if (NOTE_IDS.includes(wanted) && flow.phase === 'lobby' && me.g1Version === 0 && me.g1SubmittedAt === null) me.g1NoteId = wanted;
      } else {
        // Back with a new phone or browser: the same name takes back the old
        // player (team, answers, score) if that phone has gone quiet.
        const back = [...room.players.values()].find((p) => sameName(p.nickname, nickname) && now - (this.seen.get(p.id) ?? this.startedAt) > REJOIN_IDLE_MS);
        if (back) {
          room.players.delete(back.id);
          await this.storage.delete(`p:${back.id}`);
          this.seen.delete(back.id);
          me = { ...back, id, prevIds: [...(back.prevIds ?? []), back.id] };
          await this.savePlayer(room, me);
          return json({ me, now, rejoined: true });
        }
        if (flow.joined >= MAX_PLAYERS) return json({ error: 'Room is full' }, 409);
        if (!flow.settings.joinOpen) return json({ error: 'Room is locked' }, 423);
        // No group picked: the smallest one, so the three stay even (A, B, C in
        // join order when nobody picks).
        const all = [...room.players.values()];
        const smallest = [...NOTE_IDS].sort((x, y) => all.filter((p) => p.g1NoteId === x).length - all.filter((p) => p.g1NoteId === y).length)[0];
        me = {
          id,
          nickname: uniqueName(nickname, all),
          joinedAt: now,
          // The group the player sits with.
          g1NoteId: NOTE_IDS.includes(wanted) ? wanted : smallest,
          g1Selected: [],
          g1Version: 0,
          g1SubmittedAt: null,
          g2Signed: null,
          g2Auto: false,
          g2SignedAt: null,
          g2Spotted: null,
          asks: {},
          g3: null,
          g4: null,
        };
        flow.joined += 1;
        await this.saveFlow(room, flow);
      }
      await this.savePlayer(room, me);
      return json({ me, now });
    }

    if (!me) return json({ error: 'join first' }, 404);

    // Answers carry the run they belong to (when that game started). One from
    // an earlier run, after the lecturer restarted the game, is ignored.
    const stale = typeof body.round === 'number' && body.round !== flow.phaseStartedAt;
    if (stale && (body.type === 'g1' || body.type === 'g2sign' || body.type === 'g2spot')) return json({ me, now, stale: true });

    if (body.type === 'g1') {
      const open = flow.phase === 'g1_play' && elapsed <= flow.g1Ms + G1_GRACE_MS;
      const version = typeof body.version === 'number' ? body.version : 0;
      if (open && me.g1SubmittedAt === null && version > me.g1Version) {
        me.g1Selected = (Array.isArray(body.selected) ? body.selected : []).map((x) => short(x, 12)).filter(Boolean).slice(0, 8);
        me.g1Version = version;
        if (body.submit === true) me.g1SubmittedAt = Math.min(now, flow.phaseStartedAt + flow.g1Ms);
        await this.savePlayer(room, me);
      }
      return json({ me, now });
    }

    if (body.type === 'g2sign') {
      const show = flow.settings.g2ShowSec * 1000;
      if (flow.phase === 'g2_play' && elapsed >= show && elapsed <= show + flow.settings.g2VoteSec * 1000 + G2_GRACE_MS && me.g2Signed === null) {
        me.g2Signed = body.signed === true;
        me.g2Auto = body.auto === true;
        me.g2SignedAt = now;
        await this.savePlayer(room, me);
      }
      return json({ me, now });
    }

    if (body.type === 'g2spot') {
      const open = me.g2SignedAt !== null && now <= me.g2SignedAt + flow.settings.g2VoteSec * 1000 + G2_GRACE_MS;
      if (flow.phase === 'g2_play' && open && me.g2Spotted === null) {
        me.g2Spotted = short(body.line, 12) || 'none';
        await this.savePlayer(room, me);
      }
      return json({ me, now });
    }

    if (body.type === 'g4pick' || body.type === 'g4fix') return this.g4Answer(room, me, body, now);

    if (body.type === 'ask') {
      const ask = short(body.ask, 20);
      if (flow.ask && ask === flow.ask && !me.asks[ask]) {
        me.asks[ask] = short(body.answer, 20);
        await this.savePlayer(room, me);
      }
      return json({ me, now });
    }

    return json({ error: 'Unknown type' }, 400);
  }

  /**
   * Game 4 answers. Building and fixing are self-paced: a phone may change its
   * picks for as long as the projector shows that step, and nothing is ever
   * cleared by moving between steps. An unknown box or card is refused.
   */
  async g4Answer(room: Room, me: Player, body: Record<string, unknown>, now: number): Promise<Response> {
    const flow = room.flow;
    const box = short(body.box, 2);
    if (!BOX_IDS.includes(box)) return json({ error: 'Unknown box' }, 400);
    const card = body.card === null || body.card === undefined ? null : short(body.card, 4);
    if (card !== null && !getCard(box, card)) return json({ error: 'Unknown card' }, 400);
    const reply = () => json({ me, now, g4: publicG4(deriveTeams([...room.players.values()]), teamOfGroup(me.g1NoteId)) });
    const state: G4PlayerState = me.g4 ?? { picks: {}, fix: null };

    if (body.type === 'g4pick') {
      if (!card) return json({ error: 'card required' }, 400);
      // Not building now (the projector moved on): kept as it was.
      if (flow.phase !== 'g4_build') return json({ me, now, closed: true });
      if (state.picks[box]?.card !== card) {
        state.picks = { ...state.picks, [box]: { card, at: now } };
        me.g4 = state;
        await this.savePlayer(room, me);
      }
      return reply();
    }

    // g4fix: the box this player wants to fix, then its new card.
    if (flow.phase !== 'g4_fix') return json({ me, now, closed: true });
    if (card !== null) {
      const team = deriveTeams([...room.players.values()]).find((t) => t.team === teamOfGroup(me.g1NoteId));
      if (team && team.system[box] === card) return json({ error: 'Pick a different card' }, 400);
    }
    const old = state.fix;
    const sameBox = old?.box === box;
    state.fix = {
      box,
      at: sameBox ? old!.at : now,
      card: card ?? (sameBox ? old!.card : null),
      cardAt: card !== null ? (sameBox && old!.card === card ? old!.cardAt : now) : sameBox ? old!.cardAt : 0,
    };
    me.g4 = state;
    await this.savePlayer(room, me);
    return reply();
  }

  async clearAnswers(room: Room, clear: (p: Player) => void) {
    for (const p of room.players.values()) {
      clear(p);
      // g1Version is kept, so a toggle sent before the restart cannot win.
      await this.savePlayer(room, p);
    }
  }

  /** The projector's buttons. The first screen to press one owns the room. */
  async host(room: Room, body: Record<string, unknown>, now: number): Promise<Response> {
    let flow = room.flow;
    const key = short(body.key, 64);
    if (!key) return json({ error: 'key required' }, 400);
    if (flow.hostKey && flow.hostKey !== key) return json({ error: 'This room is run from another screen' }, 403);
    if (!['phase', 'extend', 'claim', 'hint', 'step', 'ask', 'reset', 'settings', 'kick', 'move', 'g4clock', 'g4reset', 'restore'].includes(String(body.action))) return json({ error: 'Unknown action' }, 400);
    flow.hostKey = key;

    switch (body.action) {
      case 'phase': {
        const phase = short(body.phase, 12);
        if (!PHASES.includes(phase)) return json({ error: 'Unknown phase' }, 400);
        flow.phase = phase;
        flow.phaseStartedAt = now;
        flow.step = 0;
        flow.ask = null;
        // Starting a game (again) gives everyone a clean slate for it.
        if (phase === 'g1_play') {
          flow.g1Ms = flow.settings.g1Sec * 1000;
          flow.hints = 0;
          if ([...room.players.values()].some((p) => p.g1SubmittedAt !== null || p.g1Selected.length > 0)) await this.saveBackup(room, flow, 'Game 1 restarted', now);
          await this.clearAnswers(room, (p) => {
            p.g1Selected = [];
            p.g1SubmittedAt = null;
            // The replay is played on the note of the group the player is in now.
            delete p.g1Note;
            delete p.asks.g1_predict;
          });
        }
        // Game 4's clocks start the first time each step opens; going back and
        // forth keeps the clock and every pick.
        flow.g4 ??= { ...NEW_G4_CLOCK };
        if (phase === 'g4_build' && flow.g4.buildAt === null) flow.g4.buildAt = now;
        if (phase === 'g4_fix' && flow.g4.fixAt === null) flow.g4.fixAt = now;
        if (phase === 'g2_play') {
          if ([...room.players.values()].some((p) => p.g2Signed !== null)) await this.saveBackup(room, flow, 'Game 2 restarted', now);
          await this.clearAnswers(room, (p) => {
            p.g2Signed = null;
            p.g2Auto = false;
            p.g2SignedAt = null;
            p.g2Spotted = null;
            delete p.asks.g2_who;
          });
        }
        break;
      }
      case 'extend':
        if (flow.phase === 'g1_play') {
          // Phones handed in by the clock at the old end get the extra time too.
          const oldEnd = flow.phaseStartedAt + flow.g1Ms;
          flow.g1Ms += 30_000;
          await this.clearAnswers(room, (p) => { if (p.g1SubmittedAt === oldEnd) p.g1SubmittedAt = null; });
        }
        break;
      case 'claim':
        break;
      case 'settings':
        flow.settings = cleanSettings(body.settings, flow.settings);
        break;
      case 'move': {
        // The lecturer moves a player to another group (a phone that joined the
        // wrong team). Game 1 stays graded against the note they played.
        const p = room.players.get(short(body.id, 40));
        const note = short(body.note, 1);
        if (p && NOTE_IDS.includes(note) && note !== p.g1NoteId) {
          if (!p.g1Note && (p.g1SubmittedAt !== null || p.g1Selected.length > 0)) p.g1Note = p.g1NoteId;
          p.g1NoteId = note;
          p.g4 = null; // Game 4 picks belonged to the old team
          await this.savePlayer(room, p);
        }
        break;
      }
      case 'restore': {
        // Undo the last clear or reset, once: every player and Game 3 result as they were.
        const backup = await this.storage.get<Backup>('backup');
        if (!backup) return json({ error: 'Nothing to restore' }, 404);
        // A student who came back on a new browser after the copy was kept has a
        // new id: their answers go to the phone they use now, not to a second player.
        const kept = new Set(backup.players.map((p) => p.id));
        const taken = new Set<string>();
        for (const old of backup.players) {
          const all = [...room.players.values()].filter((p) => !taken.has(p.id));
          const byName = all.filter((p) => !kept.has(p.id) && sameName(p.nickname, old.nickname));
          const current = room.players.get(old.id) ?? all.find((p) => p.prevIds?.includes(old.id)) ?? (byName.length === 1 ? byName[0] : undefined);
          const id = current?.id ?? old.id;
          taken.add(id);
          const prevIds = [...new Set([...(old.prevIds ?? []), ...(current?.prevIds ?? []), ...(id === old.id ? [] : [old.id])])];
          await this.savePlayer(room, { ...old, id, ...(prevIds.length ? { prevIds } : {}) });
        }
        const have = new Set(room.results.map((r) => r.id));
        for (const r of backup.results) {
          if (have.has(r.id)) continue;
          room.results.push(r);
          await this.storage.put(`r:${String(r.id).padStart(6, '0')}`, r);
        }
        room.results.sort((a, b) => a.id - b.id);
        room.seq = Math.max(room.seq, backup.seq);
        await this.storage.put('seq', room.seq);
        flow.joined = Math.max(flow.joined, backup.joined);
        await this.storage.delete('backup');
        flow.backupAt = null;
        flow.backupLabel = undefined;
        break;
      }
      case 'kick': {
        // Remove a player (a test phone, a duplicate, a rude name). Their phone
        // goes back to the join screen and can join again.
        const id = short(body.id, 40);
        if (room.players.delete(id)) await this.storage.delete(`p:${id}`);
        this.phones.delete(id);
        break;
      }
      case 'hint':
        flow.hints = Math.min(3, flow.hints + 1);
        break;
      case 'g4clock': {
        // +1 minute or a fresh clock for the step on screen. Never moves a phone.
        flow.g4 ??= { ...NEW_G4_CLOCK };
        const which = flow.phase === 'g4_fix' ? 'fix' : flow.phase === 'g4_build' ? 'build' : null;
        if (which && body.op === 'extend') flow.g4[`${which}ExtraMs`] = Math.min(flow.g4[`${which}ExtraMs`] + 60_000, 3_600_000);
        if (which && body.op === 'restart') {
          flow.g4[`${which}At`] = now;
          flow.g4[`${which}ExtraMs`] = 0;
        }
        break;
      }
      case 'g4reset':
        // Start Game 4 again: every team's picks and fixes, and both clocks.
        // The projector asks first.
        await this.saveBackup(room, flow, 'Game 4 restarted', now);
        flow.g4 = { ...NEW_G4_CLOCK };
        if (flow.phase === 'g4_build') flow.g4.buildAt = now;
        if (flow.phase === 'g4_fix') flow.g4.fixAt = now;
        await this.clearAnswers(room, (p) => { p.g4 = null; });
        break;
      case 'step':
        flow.step = typeof body.step === 'number' ? Math.max(0, Math.min(20, Math.round(body.step))) : 0;
        break;
      case 'ask':
        flow.ask = short(body.ask, 20) || null;
        break;
      case 'reset': {
        // Keep one copy, so a reset pressed by mistake can be undone.
        const copy: Backup = {
          at: now,
          label: 'Room started again',
          players: [...room.players.values()],
          results: room.results,
          seq: room.seq,
          joined: flow.joined,
        };
        await this.storage.deleteAll();
        this.phones.clear();
        // Settings survive a reset: the lecturer set them for this class.
        flow = { ...newFlow(flow.settings), hostKey: key, backupAt: copy.players.length ? now : null, backupLabel: copy.players.length ? copy.label : undefined };
        if (copy.players.length) await this.storage.put('backup', copy);
        room.players.clear();
        room.results = [];
        room.teams.clear();
        room.seq = 0;
        break;
      }
      default:
        return json({ error: 'Unknown action' }, 400);
    }
    await this.saveFlow(room, flow);
    return json({ flow: publicFlow(flow), now });
  }

  /** Phones still saying hello, oldest first. */
  online(team?: string): Phone[] {
    const now = Date.now();
    for (const [id, p] of this.phones) if (now - p.at > ONLINE_MS) this.phones.delete(id);
    return [...this.phones.values()].filter((p) => !team || p.team === team);
  }

  async hello(request: Request, room: Room): Promise<Response> {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const team = new URL(request.url).searchParams.get('team') ?? '';
    if (!TEAM_IDS.includes(team)) return json({ error: 'team required' }, 400);
    const text = await request.text();
    if (text.length > 1000) return json({ error: 'Too large' }, 413);
    let body: { id?: unknown; job?: unknown; name?: unknown; follow?: unknown };
    try {
      body = parseObject(text);
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    const id = typeof body.id === 'string' ? body.id.slice(0, 40) : '';
    if (!id || !JOBS.includes(String(body.job))) return json({ error: 'id and job required' }, 400);
    const now = Date.now();
    const str = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 40) : '');
    const phone: Phone = { id, team, job: body.job as Phone['job'], name: str(body.name), follow: str(body.follow), at: now };
    // A phone that switched team is moved, not counted twice.
    this.phones.delete(id);
    this.phones.set(id, phone);

    // Remember the player's Game 3 clinic for the running score (written only
    // when it changes).
    const player = room.players.get(id);
    if (player) {
      const g3 = { team, job: phone.job, name: phone.name, follow: phone.follow };
      if (JSON.stringify(player.g3) !== JSON.stringify(g3)) {
        player.g3 = g3;
        await this.savePlayer(room, player);
      }
    }

    const states = [...room.teams.entries()].filter(([k, s]) => k.startsWith(`team:${team}:`) && now - s.updatedAt < TEAM_STATE_TTL_MS).map(([, s]) => s);
    return json({ states, phones: this.online(team), now });
  }
}

// ── The running score across the three games ──

interface Score {
  id: string;
  nickname: string;
  /** Game 3 team and job, once the player picked them. */
  team: string | null;
  job: string | null;
  g1: number;
  g2: number;
  g3: number;
  total: number;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** "Mai", or "Mai 2" if someone already has that name. */
function uniqueName(name: string, others: Player[]): string {
  const taken = (n: string) => others.some((p) => sameName(p.nickname, n));
  if (!taken(name)) return name;
  for (let i = 2; i < 100; i++) {
    const n = `${name.slice(0, 13)} ${i}`;
    if (!taken(n)) return n;
  }
  return name;
}

/**
 * Each game is worth about 300:
 *   Game 1  100 per mistake found, minus 100 per correct line circled (0 to 300)
 *   Game 2  100 for not signing, 200 for tapping Allergy or Medicine (0 to 300)
 *   Game 3  the clinic's average chart points / 4, the same for the dentist
 *           and both nurses (about 0 to 300)
 */
function scoreboard(players: Player[], results: StoredResult[]): Score[] {
  return players
    .map((p) => {
      const played = p.g1SubmittedAt !== null || p.g1Selected.length > 0;
      const g1 = played ? scoreG1(p.g1Note ?? p.g1NoteId, p.g1Selected).score * 100 : 0;
      const g2 = (p.g2Signed === false ? 100 : 0) + (isSpotted(p.g2Spotted) ? 200 : 0);
      let g3 = 0;
      const c = p.g3;
      const dentist = c ? (c.job === 'dentist' ? c.name : c.follow) : '';
      if (c && dentist) {
        const charts = results.filter((r) => r.team === c.team && sameName(r.station, dentist));
        const points = charts.map((r) => Number((r.summary as { points?: unknown }).points) || 0);
        if (points.length) g3 = Math.max(0, Math.round(points.reduce((a, b) => a + b, 0) / points.length / 4));
      }
      return { id: p.id, nickname: p.nickname, team: c?.team ?? null, job: c?.job ?? null, g1, g2, g3, total: g1 + g2 + g3 };
    })
    .sort((a, b) => b.total - a.total || a.nickname.localeCompare(b.nickname));
}
