// Runs the game server (demo/worker.ts) in memory: one room, a fake clock and
// an in-memory Durable Object storage, so tests need no Cloudflare or network.

import { ResultsRoom } from '../demo/worker.ts';

export class MemoryStorage {
  data = new Map<string, unknown>();
  async get<T>(key: string) { return structuredClone(this.data.get(key)) as T | undefined; }
  async put(key: string, value: unknown) { this.data.set(key, structuredClone(value)); }
  async list<T>({ prefix }: { prefix: string }) {
    const out = new Map<string, T>();
    for (const k of [...this.data.keys()].sort()) if (k.startsWith(prefix)) out.set(k, structuredClone(this.data.get(k)) as T);
    return out;
  }
  async delete(key: string) { return this.data.delete(key); }
  async deleteAll() { this.data.clear(); }
}

/** A fake clock: `clock.tick(ms)` moves Date.now() forward. Call `clock.restore()` when done. */
export function fakeClock(start = 1_760_000_000_000) {
  const real = Date.now;
  let t = start;
  Date.now = () => t;
  return {
    get now() { return t; },
    tick(ms: number) { t += ms; },
    restore() { Date.now = real; },
  };
}

export const HOST_KEY = 'projector-key';

/** One room. `storage` is shared, so `restart()` gives a fresh in-memory object over the same data. */
export function makeRoom(storage = new MemoryStorage()) {
  let room = new ResultsRoom({ storage });
  const call = async (path: string, method: string, body?: unknown, query = '', headers: Record<string, string> = {}) => {
    const res = await room.fetch(new Request(`https://x${path}?room=test${query}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json() as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const api = {
    storage,
    get room() { return room; },
    /** A new server object over the same storage (the Durable Object restarted). */
    restart() { room = new ResultsRoom({ storage }); },
    call,
    /** GET the flow as the projector sees it (every player and score). */
    board: () => call('/api/demo-flow', 'GET', undefined, '&all=1').then((r) => r.body),
    /** GET the flow as one phone sees it. */
    phone: (id: string) => call('/api/demo-flow', 'GET', undefined, `&me=${encodeURIComponent(id)}`).then((r) => r.body),
    /** A projector button. */
    host: (action: string, extra: Record<string, unknown> = {}, key = HOST_KEY) => call('/api/demo-flow', 'POST', { type: 'host', key, action, ...extra }),
    phase: (phase: string) => api.host('phase', { phase }),
    /** A phone sends something (join, g1, g2sign, g2spot, g4pick, g4fix, ask). */
    send: (id: string, type: string, extra: Record<string, unknown> = {}) => call('/api/demo-flow', 'POST', { type, id, ...extra }),
    join: (id: string, nickname: string, note?: string) => api.send(id, 'join', { nickname, ...(note ? { note } : {}) }),
    /** Game 3: a phone's check-in. */
    hello: (team: string, body: Record<string, unknown>) => call('/api/demo-hello', 'POST', body, `&team=${team}`),
    /** Game 3: a dentist signs a chart. */
    sign: (team: string, station: string, points: number) => call('/api/demo-results', 'POST', { team, station, summary: { points } }),
  };
  return api;
}
