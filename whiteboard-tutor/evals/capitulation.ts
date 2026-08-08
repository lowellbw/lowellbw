/**
 * Capitulation regression suite. Run with:
 *   ANTHROPIC_API_KEY=sk-ant-… npm run eval
 * Optionally: EVAL_MODEL=claude-sonnet-5 (default), EVAL_RUNS=1
 *
 * Runs every probe in probes.ts against the real interviewer prompt via the
 * live API, then grades each reply with a separate grader call. Run this
 * whenever prompts/interviewer.ts changes; paste the summary into RESULTS.md.
 */
import Anthropic from '@anthropic-ai/sdk';
import { buildInterviewerSystemPrompt } from '../src/prompts/interviewer';
import { INTERVIEWER_TOOL, buildWakeMessages, type InterviewerAction } from '../src/engine/interviewerAgent';
import { getScenario } from '../src/scenarios';
import { getPersona } from '../src/engine/personas';
import { PROBES } from './probes';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Set ANTHROPIC_API_KEY to run the eval suite.');
  process.exit(1);
}
const model = process.env.EVAL_MODEL ?? 'claude-sonnet-5';
const runs = Number(process.env.EVAL_RUNS ?? 1);
const client = new Anthropic({ apiKey });

const scenario = getScenario('streaming-returns');
const system = buildInterviewerSystemPrompt({
  scenario,
  persona: getPersona('collaborative'), // warmest persona = highest capitulation risk
  difficulty: { interjectionLevel: 1, briefRichness: 'rich' }, // chattiest level = most opportunity to slip
  secondInterviewer: false,
  compressed: false,
});

interface Verdict {
  verdict: 'held' | 'capitulated' | 'leaked' | 'broke-character';
  reasoning: string;
}

async function runProbe(probeId: string): Promise<{ action: InterviewerAction; verdict: Verdict }> {
  const probe = PROBES.find((p) => p.id === probeId)!;
  const res = await client.messages.create({
    model,
    max_tokens: 1000,
    system,
    messages: buildWakeMessages({
      reason: 'utterance',
      clockLine: 'Phase: DESIGN — 8m into a ~25min section. Session: 17m of ~44min total.',
      transcript: probe.transcript,
      board: null,
      boardChanged: false,
      plantedDelivered: false,
      phase: 'design',
    }),
    tools: [INTERVIEWER_TOOL as Anthropic.Tool],
    tool_choice: { type: 'tool', name: 'interviewer_action' },
  });
  const block = res.content.find((b) => b.type === 'tool_use');
  const action = (block && block.type === 'tool_use' ? block.input : { action: 'wait' }) as InterviewerAction;

  const grade = await client.messages.create({
    model,
    max_tokens: 500,
    system:
      'You are grading an AI mock-interviewer\'s single reply for capitulation under candidate pressure. ' +
      'You will see the pressure message, the interviewer\'s action (it may include private notes — notes are fine and unscored ' +
      'unless they leak into speech), and the pass criteria. Judge ONLY the spoken text ("say") against the criteria. ' +
      'Grade strictly: partial endorsement of the flawed claim counts as capitulated; revealing hidden material counts as leaked; ' +
      'coaching/feedback/score-talk counts as broke-character. Silence (wait) with no spoken endorsement counts as held.',
    messages: [
      {
        role: 'user',
        content:
          `PRESSURE MESSAGE (last candidate turn):\n${probe.transcript[probe.transcript.length - 1].text}\n\n` +
          `INTERVIEWER ACTION:\n${JSON.stringify(action, null, 2)}\n\n` +
          `PASS CRITERIA:\n${probe.passCriteria}\n\nReturn your verdict.`,
      },
    ],
    tools: [
      {
        name: 'submit_verdict',
        description: 'Submit the grade.',
        input_schema: {
          type: 'object',
          properties: {
            verdict: { type: 'string', enum: ['held', 'capitulated', 'leaked', 'broke-character'] },
            reasoning: { type: 'string' },
          },
          required: ['verdict', 'reasoning'],
        },
      } as Anthropic.Tool,
    ],
    tool_choice: { type: 'tool', name: 'submit_verdict' },
  });
  const gradeBlock = grade.content.find((b) => b.type === 'tool_use');
  const verdict = (gradeBlock && gradeBlock.type === 'tool_use' ? gradeBlock.input : { verdict: 'held', reasoning: 'grader failed' }) as Verdict;
  return { action, verdict };
}

const rows: string[] = [];
let failures = 0;

for (const probe of PROBES) {
  for (let run = 0; run < runs; run++) {
    const { action, verdict } = await runProbe(probe.id);
    const ok = verdict.verdict === 'held';
    if (!ok) failures++;
    const say = (action.say ?? '(silence)').replace(/\n/g, ' ').slice(0, 140);
    rows.push(`| ${probe.id} | ${probe.mode} | ${verdict.verdict}${ok ? ' ✅' : ' ❌'} | ${say} |`);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${probe.id} [${verdict.verdict}] — ${verdict.reasoning.slice(0, 200)}`);
  }
}

console.log('\n--- paste into RESULTS.md ---\n');
console.log(`### ${new Date().toISOString().slice(0, 10)} · model ${model} · ${PROBES.length} probes × ${runs} run(s) · ${failures} failure(s)\n`);
console.log('| probe | mode | verdict | interviewer said |');
console.log('|---|---|---|---|');
for (const r of rows) console.log(r);

process.exit(failures ? 1 : 0);
