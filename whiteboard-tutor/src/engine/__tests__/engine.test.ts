import { beforeEach, describe, expect, it } from 'vitest';
import { advance, createClock, describeClock, guidanceMinutes, nextPhase, readClock } from '../stateMachine';
import { INITIAL_DIFFICULTY, LADDER, ladderIndex, progress } from '../difficulty';
import { PERSONAS, pickPersona } from '../personas';
import {
  __resetMemoryStore,
  axisSessionCount,
  consecutiveFails,
  loadDifficulty,
  loadSessions,
  recordSession,
  weakestAxis,
  type SessionRecord,
} from '../sessionLog';
import { SCENARIOS } from '../../scenarios';

describe('phase clock', () => {
  it('advances forward only, and can skip phases', () => {
    let clock = createClock({ compressed: false, now: 0 });
    clock = advance(clock, 'scope', 1000);
    expect(clock.phase).toBe('scope');
    clock = advance(clock, 'brief', 2000); // backwards → ignored
    expect(clock.phase).toBe('scope');
    clock = advance(clock, 'pushback', 3000); // skipping design is allowed
    expect(clock.phase).toBe('pushback');
  });

  it('applies the runs-late persona design penalty with a floor', () => {
    const clock = createClock({ compressed: false, designPenaltyMin: 5 });
    expect(guidanceMinutes(clock, 'design')).toBe(20);
    const compressed = createClock({ compressed: true, designPenaltyMin: 5 });
    expect(guidanceMinutes(compressed, 'design')).toBe(2); // floor, never negative
  });

  it('flags being over guidance in the clock line', () => {
    const clock = createClock({ compressed: false, now: 0 });
    const readout = readClock({ ...clock, phase: 'brief' }, 6 * 60_000);
    expect(readout.overGuidanceMin).toBeGreaterThan(3);
    expect(describeClock(readout)).toContain('over');
  });

  it('walks the phase order', () => {
    expect(nextPhase('brief')).toBe('scope');
    expect(nextPhase('questions')).toBe('debrief');
    expect(nextPhase('debrief')).toBeNull();
  });
});

describe('difficulty ladder', () => {
  it('starts at level 1 × rich and climbs one rung per pass', () => {
    let state = INITIAL_DIFFICULTY;
    expect(ladderIndex(state)).toBe(0);
    state = progress(state, true, 0);
    expect(state).toEqual(LADDER[1]);
  });

  it('caps at the top rung (sparse × silent is the endgame)', () => {
    const top = LADDER[LADDER.length - 1];
    expect(top).toEqual({ interjectionLevel: 3, briefRichness: 'sparse' });
    expect(progress(top, true, 0)).toEqual(top);
  });

  it('drops back a rung only after two consecutive fails, never below the floor', () => {
    const mid = LADDER[2];
    expect(progress(mid, false, 1)).toEqual(mid);
    expect(progress(mid, false, 2)).toEqual(LADDER[1]);
    expect(progress(LADDER[0], false, 5)).toEqual(LADDER[0]);
  });
});

describe('personas', () => {
  it('never repeats the previous persona', () => {
    for (const p of PERSONAS) {
      for (let i = 0; i < 20; i++) {
        expect(pickPersona(p.id).id).not.toBe(p.id);
      }
    }
  });
});

function makeRecord(overrides: Partial<SessionRecord>): SessionRecord {
  return {
    id: `s${Math.random()}`,
    dateISO: '2026-08-08T00:00:00Z',
    scenarioId: SCENARIOS[0].id,
    personaId: 'collaborative',
    interjectionLevel: 1,
    briefRichness: 'rich',
    compressed: false,
    passed: true,
    axisResults: [
      { axisId: 'what-it-does', pass: true, evidenceQuote: 'q' },
      { axisId: 'how-it-works', pass: false, evidenceQuote: 'q' },
    ],
    gaps: ['g1', 'g2', 'g3'],
    carryForward: 'watch for x',
    ...overrides,
  };
}

describe('session log', () => {
  beforeEach(() => __resetMemoryStore());

  it('records sessions and advances the difficulty dial on a pass', () => {
    expect(loadSessions()).toEqual([]);
    recordSession(makeRecord({ passed: true }));
    expect(loadSessions()).toHaveLength(1);
    expect(loadDifficulty()).toEqual(LADDER[1]);
  });

  it('counts consecutive fails from the tail and drops the dial back after two', () => {
    recordSession(makeRecord({ passed: true }));
    recordSession(makeRecord({ passed: false }));
    expect(consecutiveFails()).toBe(1);
    expect(loadDifficulty()).toEqual(LADDER[1]); // one fail: hold
    recordSession(makeRecord({ passed: false }));
    expect(consecutiveFails()).toBe(2);
    expect(loadDifficulty()).toEqual(LADDER[0]); // two fails: drop back
  });

  it('targets the weakest axis, preferring never-scored axes', () => {
    expect(weakestAxis()).toBeNull(); // no sessions yet
    recordSession(makeRecord({}));
    // Only two axes ever scored — an unscored axis comes first.
    expect(weakestAxis()).toBe('how-it-feels');
    expect(axisSessionCount('what-it-does')).toBe(1);
    expect(axisSessionCount('how-it-feels')).toBe(0);
  });
});

describe('scenario integrity', () => {
  it('every scenario has exactly one landmine and all three brief richness levels', () => {
    for (const s of SCENARIOS) {
      expect(s.layer2.filter((f) => f.landmine)).toHaveLength(1);
      expect(s.layer1.rich.length).toBeGreaterThan(s.layer1.medium.length);
      expect(s.layer1.medium.length).toBeGreaterThan(s.layer1.sparse.length);
      expect(s.plantedSuggestion.suggestion.length).toBeGreaterThan(40);
      expect(s.probes.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('layer-2 fact ids are unique within each scenario', () => {
    for (const s of SCENARIOS) {
      const ids = s.layer2.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
