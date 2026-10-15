import type { ScoreSummary } from './scoring';

export interface DemoResult {
  id: number;
  team: string;
  station: string;
  summary: ScoreSummary;
  createdAt: string;
}

export async function submitResult(room: string, team: string, station: string, summary: ScoreSummary): Promise<void> {
  const res = await fetch(`/api/demo-results?room=${encodeURIComponent(room)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team, station, summary }),
  });
  if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
}

export async function fetchResults(room: string): Promise<DemoResult[]> {
  return (await fetchBoard(room)).results;
}

/** Signed charts plus every phone online right now (for the projector). */
export async function fetchBoard(room: string): Promise<{ results: DemoResult[]; lineup: Phone[] }> {
  const res = await fetch(`/api/demo-results?room=${encodeURIComponent(room)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Load failed: ${res.status}`);
  const data = await res.json();
  return { results: data.results ?? [], lineup: data.lineup ?? [] };
}

export async function clearResults(room: string, hostKey = ''): Promise<void> {
  const res = await fetch(`/api/demo-results?room=${encodeURIComponent(room)}`, { method: 'DELETE', headers: { 'X-Host-Key': hostKey } });
  if (!res.ok) throw new Error(`Clear failed: ${res.status}`);
}

/** What one dentist (a chart phone) is doing, shared with their nurses' phones. */
export interface TeamState {
  scenarioId: string | null;
  phase: string;
  dentist: string;
  points: number | null;
  startedAt: number | null;
  updatedAt: number;
}

export async function postTeamState(
  room: string,
  team: string,
  state: { scenarioId: string | null; phase: string; dentist: string; points?: number | null; elapsedMs?: number | null },
): Promise<void> {
  const res = await fetch(`/api/demo-team?room=${encodeURIComponent(room)}&team=${encodeURIComponent(team)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error(`Team update failed: ${res.status}`);
}

/** Every dentist on a team who played in the last few hours. */
export type Job = 'dentist' | 'nurse1' | 'nurse2';

/** A phone that is online, as the Worker last heard from it. */
export interface Phone {
  id: string;
  team: string;
  job: Job;
  /** The player's name: a dentist's doctor name, a nurse's nickname. */
  name: string;
  /** The dentist a nurse is helping (empty if not picked yet). */
  follow: string;
  at: number;
}

/** "This phone is here." Answers with the team's dentists and who is online. */
export async function sayHello(
  room: string,
  team: string,
  me: { id: string; job: Job; name: string; follow: string },
): Promise<{ states: TeamState[]; phones: Phone[]; now: number }> {
  const res = await fetch(`/api/demo-hello?room=${encodeURIComponent(room)}&team=${encodeURIComponent(team)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(me),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Hello failed: ${res.status}`);
  return res.json();
}
