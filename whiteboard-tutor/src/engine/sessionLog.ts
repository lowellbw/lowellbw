import type { DifficultyState } from './difficulty';
import { INITIAL_DIFFICULTY, progress } from './difficulty';
import { RUBRIC_AXES } from './rubric';

/**
 * Session memory: read at session start (scenario targeting, dial progression,
 * persona rotation, fading specificity), appended at session end.
 * localStorage-backed with an in-memory fallback so the engine is testable.
 */

export interface AxisResult {
  axisId: string;
  pass: boolean;
  evidenceQuote: string;
}

export interface SessionRecord {
  id: string;
  dateISO: string;
  scenarioId: string;
  personaId: string;
  interjectionLevel: number;
  briefRichness: string;
  compressed: boolean;
  passed: boolean;
  axisResults: AxisResult[];
  gaps: string[];
  carryForward: string;
}

const KEYS = {
  sessions: 'wt.sessions',
  difficulty: 'wt.difficulty',
  lastPersona: 'wt.lastPersona',
};

const memoryStore = new Map<string, string>();

function storage(): Pick<Storage, 'getItem' | 'setItem'> {
  if (typeof localStorage !== 'undefined') return localStorage;
  return {
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => void memoryStore.set(k, v),
  };
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadSessions(): SessionRecord[] {
  return readJSON<SessionRecord[]>(KEYS.sessions, []);
}

export function loadDifficulty(): DifficultyState {
  return readJSON<DifficultyState>(KEYS.difficulty, INITIAL_DIFFICULTY);
}

export function loadLastPersonaId(): string | null {
  return readJSON<string | null>(KEYS.lastPersona, null);
}

/** Consecutive fails at the tail of the log, for the drop-back rule. */
export function consecutiveFails(sessions: SessionRecord[] = loadSessions()): number {
  let n = 0;
  for (let i = sessions.length - 1; i >= 0 && !sessions[i].passed; i--) n++;
  return n;
}

/** Append the session, advance the dial, remember the persona. */
export function recordSession(record: SessionRecord): void {
  const sessions = [...loadSessions(), record];
  storage().setItem(KEYS.sessions, JSON.stringify(sessions));
  const next = progress(loadDifficulty(), record.passed, consecutiveFails(sessions));
  storage().setItem(KEYS.difficulty, JSON.stringify(next));
  storage().setItem(KEYS.lastPersona, JSON.stringify(record.personaId));
}

/** Pass-rate per axis across the log; null when an axis has never been scored. */
export function axisPassRates(sessions: SessionRecord[] = loadSessions()): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const axis of RUBRIC_AXES) {
    const results = sessions.flatMap((s) => s.axisResults.filter((r) => r.axisId === axis.id));
    out[axis.id] = results.length ? results.filter((r) => r.pass).length / results.length : null;
  }
  return out;
}

/** The axis to target next: lowest pass rate, unscored axes first. */
export function weakestAxis(sessions: SessionRecord[] = loadSessions()): string | null {
  if (!sessions.length) return null;
  const rates = axisPassRates(sessions);
  let worst: string | null = null;
  let worstRate = Infinity;
  for (const axis of RUBRIC_AXES) {
    const rate = rates[axis.id];
    if (rate === null) return axis.id;
    if (rate < worstRate) {
      worstRate = rate;
      worst = axis.id;
    }
  }
  return worst;
}

/** How many sessions have scored a given axis — drives fading specificity. */
export function axisSessionCount(axisId: string, sessions: SessionRecord[] = loadSessions()): number {
  return sessions.filter((s) => s.axisResults.some((r) => r.axisId === axisId)).length;
}

/** Carry-forward notes from the last few sessions, for the interviewer-agnostic coach context. */
export function recentCarryForwards(limit = 3, sessions: SessionRecord[] = loadSessions()): string[] {
  return sessions
    .slice(-limit)
    .map((s) => s.carryForward)
    .filter(Boolean);
}

export function exportLogJSON(): string {
  return JSON.stringify(
    { sessions: loadSessions(), difficulty: loadDifficulty(), lastPersona: loadLastPersonaId() },
    null,
    2,
  );
}

export function importLogJSON(json: string): void {
  const parsed = JSON.parse(json) as {
    sessions?: SessionRecord[];
    difficulty?: DifficultyState;
    lastPersona?: string | null;
  };
  if (parsed.sessions) storage().setItem(KEYS.sessions, JSON.stringify(parsed.sessions));
  if (parsed.difficulty) storage().setItem(KEYS.difficulty, JSON.stringify(parsed.difficulty));
  if (parsed.lastPersona !== undefined) storage().setItem(KEYS.lastPersona, JSON.stringify(parsed.lastPersona));
}

/** Test hook: wipe the in-memory fallback store. */
export function __resetMemoryStore(): void {
  memoryStore.clear();
}
