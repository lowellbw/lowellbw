import type { Richness } from '../scenarios/types';

/**
 * Two difficulty axes from the brief:
 *  - Interjection level: 1 proactively points at gaps → 2 occasional → 3 silent-and-penalise-silence
 *  - Brief richness: rich → medium → sparse (how much of Layer 1 is volunteered)
 *
 * Progression ladder: interjection climbs before the brief thins fully;
 * sparse × silent is the earned endgame.
 */

export type InterjectionLevel = 1 | 2 | 3;

export interface DifficultyState {
  interjectionLevel: InterjectionLevel;
  briefRichness: Richness;
}

export const LADDER: DifficultyState[] = [
  { interjectionLevel: 1, briefRichness: 'rich' },
  { interjectionLevel: 2, briefRichness: 'rich' },
  { interjectionLevel: 2, briefRichness: 'medium' },
  { interjectionLevel: 3, briefRichness: 'medium' },
  { interjectionLevel: 3, briefRichness: 'sparse' },
];

export function ladderIndex(state: DifficultyState): number {
  const i = LADDER.findIndex(
    (s) => s.interjectionLevel === state.interjectionLevel && s.briefRichness === state.briefRichness,
  );
  return i === -1 ? 0 : i;
}

/**
 * Advance one rung after a session that clears the rubric bar; drop back one
 * rung after two consecutive fails (never below the first rung).
 */
export function progress(state: DifficultyState, passed: boolean, consecutiveFails: number): DifficultyState {
  const i = ladderIndex(state);
  if (passed) return LADDER[Math.min(i + 1, LADDER.length - 1)];
  if (consecutiveFails >= 2) return LADDER[Math.max(i - 1, 0)];
  return LADDER[i];
}

export const INITIAL_DIFFICULTY: DifficultyState = LADDER[0];

export function describeInterjectionLevel(level: InterjectionLevel): string {
  switch (level) {
    case 1:
      return (
        'Level 1 (mid-level calibration): be proactive. When you see a gap forming, point at it with a ' +
        'question or a new constraint reasonably soon. Keep the candidate moving; do not let them flounder long.'
      );
    case 2:
      return (
        'Level 2: interject occasionally. Let stretches of independent work run. Probe at natural pauses ' +
        'and when something load-bearing goes unexamined, but let small gaps stand to see if the candidate catches them.'
      );
    case 3:
      return (
        'Level 3 (senior calibration): go quiet. Speak only when spoken to, at phase transitions, or when the ' +
        'design has been silent-dead for a long time. Let silence and gaps stand — noticing and filling them is ' +
        "the candidate's job, and failing to is scored. Use wait liberally; note what they miss."
      );
  }
}
