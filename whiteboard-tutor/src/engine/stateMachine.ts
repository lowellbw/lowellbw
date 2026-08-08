/**
 * Phase tracking. Timings are ADVISORY — the interviewer agent controls
 * transitions like a human would, running sections long or cutting them short.
 * The engine only reports how far over guidance the interviewer is so the
 * prompt can nudge.
 */

export type Phase = 'brief' | 'scope' | 'design' | 'pushback' | 'questions' | 'debrief';

export const PHASE_ORDER: Phase[] = ['brief', 'scope', 'design', 'pushback', 'questions', 'debrief'];

/** Guidance minutes per phase (debrief is untimed). */
const FULL_MINUTES: Record<Phase, number> = {
  brief: 2,
  scope: 7,
  design: 25,
  pushback: 7,
  questions: 3,
  debrief: 0,
};

/** Compressed practice session, ~15 minutes total. */
const COMPRESSED_MINUTES: Record<Phase, number> = {
  brief: 1,
  scope: 3,
  design: 7,
  pushback: 3,
  questions: 1,
  debrief: 0,
};

export interface PhaseClockState {
  phase: Phase;
  sessionStartMs: number;
  phaseStartMs: number;
  compressed: boolean;
  /** Minutes shaved off Design guidance (e.g. the runs-late persona burns time). */
  designPenaltyMin: number;
}

export function createClock(opts: { compressed: boolean; designPenaltyMin?: number; now?: number }): PhaseClockState {
  const now = opts.now ?? Date.now();
  return {
    phase: 'brief',
    sessionStartMs: now,
    phaseStartMs: now,
    compressed: opts.compressed,
    designPenaltyMin: opts.designPenaltyMin ?? 0,
  };
}

export function guidanceMinutes(state: PhaseClockState, phase: Phase): number {
  const base = (state.compressed ? COMPRESSED_MINUTES : FULL_MINUTES)[phase];
  if (phase === 'design' && state.designPenaltyMin > 0) {
    return Math.max(2, base - state.designPenaltyMin);
  }
  return base;
}

export function nextPhase(phase: Phase): Phase | null {
  const i = PHASE_ORDER.indexOf(phase);
  return i >= 0 && i < PHASE_ORDER.length - 1 ? PHASE_ORDER[i + 1] : null;
}

export function advance(state: PhaseClockState, to: Phase, now = Date.now()): PhaseClockState {
  const fromIdx = PHASE_ORDER.indexOf(state.phase);
  const toIdx = PHASE_ORDER.indexOf(to);
  // Forward-only; skipping phases is allowed (a real interviewer may cut Questions).
  if (toIdx <= fromIdx) return state;
  return { ...state, phase: to, phaseStartMs: now };
}

export interface ClockReadout {
  phase: Phase;
  sessionElapsedMin: number;
  phaseElapsedMin: number;
  phaseGuidanceMin: number;
  /** Positive when over guidance. */
  overGuidanceMin: number;
  totalGuidanceMin: number;
}

export function readClock(state: PhaseClockState, now = Date.now()): ClockReadout {
  const phaseGuidanceMin = guidanceMinutes(state, state.phase);
  const phaseElapsedMin = (now - state.phaseStartMs) / 60_000;
  const totalGuidanceMin = PHASE_ORDER.reduce((sum, p) => sum + guidanceMinutes(state, p), 0);
  return {
    phase: state.phase,
    sessionElapsedMin: (now - state.sessionStartMs) / 60_000,
    phaseElapsedMin,
    phaseGuidanceMin,
    overGuidanceMin: Math.max(0, phaseElapsedMin - phaseGuidanceMin),
    totalGuidanceMin,
  };
}

/** Human-readable clock line for the interviewer's context. */
export function describeClock(r: ClockReadout): string {
  const fmt = (m: number) => `${Math.floor(m)}m${Math.round((m % 1) * 60).toString().padStart(2, '0')}s`;
  let line =
    `Phase: ${r.phase.toUpperCase()} — ${fmt(r.phaseElapsedMin)} into a ~${r.phaseGuidanceMin}min section. ` +
    `Session: ${fmt(r.sessionElapsedMin)} of ~${r.totalGuidanceMin}min total.`;
  if (r.overGuidanceMin > 1.5) {
    line += ` You are ${fmt(r.overGuidanceMin)} over this section's guidance — a real interviewer would be moving things along.`;
  }
  return line;
}
