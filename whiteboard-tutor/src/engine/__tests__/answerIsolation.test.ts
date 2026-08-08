import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInterviewerSystemPrompt } from '../../prompts/interviewer';
import { buildWakeMessages } from '../interviewerAgent';
import { SCENARIOS } from '../../scenarios';
import { allAnswers } from '../../scenarios/answers';
import { PERSONAS } from '../personas';

/**
 * The anti-sycophancy architecture, enforced: the interviewer must be unable
 * to hold the model answer. Two layers — the import graph (only debrief.ts
 * may import answers/) and the actual assembled interviewer context (no
 * answer content can appear in it).
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('answer isolation', () => {
  it('only engine/debrief.ts imports the answers module', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (file.includes(`${join('scenarios', 'answers')}`)) continue; // the module itself
      const source = readFileSync(file, 'utf8');
      if (/from\s+['"][^'"]*answers/.test(source)) {
        if (!file.endsWith(join('engine', 'debrief.ts'))) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no answer content appears in any interviewer system prompt or wake message', () => {
    // Distinctive fragments: every sentence over 40 chars from every answer field.
    const fragments = allAnswers().flatMap((a) =>
      [a.strongDesign, a.landmineHandling, a.plantedSuggestionPass, ...a.greatQuestions, ...Object.values(a.axisExemplars)]
        .flatMap((text) => text.split(/(?<=[.!?])\s+/))
        .map((s) => s.trim())
        .filter((s) => s.length > 40),
    );
    expect(fragments.length).toBeGreaterThan(50);

    for (const scenario of SCENARIOS) {
      for (const persona of PERSONAS) {
        const system = buildInterviewerSystemPrompt({
          scenario,
          persona,
          difficulty: { interjectionLevel: 2, briefRichness: 'rich' },
          secondInterviewer: true,
          compressed: false,
        });
        const wake = JSON.stringify(
          buildWakeMessages({
            reason: 'utterance',
            clockLine: 'Phase: DESIGN',
            transcript: [{ kind: 'candidate', text: 'walk me through it', atMin: 10 }],
            board: null,
            boardChanged: false,
            plantedDelivered: false,
            phase: 'design',
          }),
        );
        const context = system + wake;
        for (const fragment of fragments) {
          expect(context).not.toContain(fragment);
        }
      }
    }
  });
});
