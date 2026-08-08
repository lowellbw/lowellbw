import type Anthropic from '@anthropic-ai/sdk';
import { callWithTool, callText, imageBlock, type ToolSpec } from '../llm/anthropic';
import { buildCoachSystemPrompt } from '../prompts/coach';
import { getAnswer } from '../scenarios/answers'; // the ONLY import of the answers module anywhere
import type { Scenario } from '../scenarios/types';
import { serializeTranscript, type BoardSnapshot, type TranscriptEvent } from './interviewerAgent';
import { axisSessionCount, recentCarryForwards, type AxisResult } from './sessionLog';
import { RUBRIC_AXES } from './rubric';

/**
 * The debrief: a real evaluator. Section-by-section walkthrough with
 * alternatives and things-never-said, then the binary scorecard, then an open
 * coach conversation. The model answer enters context here for the first time.
 */

export interface WalkthroughSection {
  section: string;
  whatHappened: string;
  strongerMove: string;
  thingsNotSaid: string;
}

export interface ScorecardEntry {
  axisId: string;
  pass: boolean;
  evidenceQuote: string;
  differentOrWrong: 'different' | 'wrong' | 'n/a';
  note: string;
}

export interface BehaviourFlag {
  behaviourId: string;
  triggered: boolean;
  evidence: string;
}

export interface DebriefResult {
  summarySpoken: string;
  walkthrough: WalkthroughSection[];
  scorecard: ScorecardEntry[];
  behaviourFlags: BehaviourFlag[];
  gaps: string[];
  readings: string[];
  verdict: 'pass' | 'borderline-no' | 'no';
  carryForward: string;
}

const DEBRIEF_TOOL: ToolSpec = {
  name: 'submit_debrief',
  description: 'Submit the complete structured debrief.',
  input_schema: {
    type: 'object',
    properties: {
      summarySpoken: {
        type: 'string',
        description: 'Your opening line, spoken aloud: the honest headline of how the session went, two or three sentences, spoken register.',
      },
      walkthrough: {
        type: 'array',
        description: 'One entry per interview section (Scope, Design, Pushback, Questions).',
        items: {
          type: 'object',
          properties: {
            section: { type: 'string' },
            whatHappened: { type: 'string', description: 'What the candidate actually did, with quotes/board references.' },
            strongerMove: { type: 'string', description: 'What a strong candidate would have done at that moment; stronger alternatives for the choices made.' },
            thingsNotSaid: { type: 'string', description: 'Questions never asked, users never designed for, trade-offs taken silently.' },
          },
          required: ['section', 'whatHappened', 'strongerMove', 'thingsNotSaid'],
        },
      },
      scorecard: {
        type: 'array',
        description: 'Exactly one entry per rubric axis.',
        items: {
          type: 'object',
          properties: {
            axisId: { type: 'string', enum: RUBRIC_AXES.map((a) => a.id) },
            pass: { type: 'boolean' },
            evidenceQuote: { type: 'string', description: 'Verbatim quote or concrete board reference.' },
            differentOrWrong: {
              type: 'string',
              enum: ['different', 'wrong', 'n/a'],
              description: 'For any fail on a design choice: was it wrong (breaks under scenario constraints) or merely different from the model answer? Different never fails.',
            },
            note: { type: 'string' },
          },
          required: ['axisId', 'pass', 'evidenceQuote', 'differentOrWrong', 'note'],
        },
      },
      behaviourFlags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            behaviourId: { type: 'string' },
            triggered: { type: 'boolean' },
            evidence: { type: 'string' },
          },
          required: ['behaviourId', 'triggered', 'evidence'],
        },
      },
      gaps: { type: 'array', items: { type: 'string' }, description: 'Exactly the three most important gaps.' },
      readings: { type: 'array', items: { type: 'string' }, description: 'Two or three specific readings (posts, docs, talks) matched to the gaps.' },
      verdict: { type: 'string', enum: ['pass', 'borderline-no', 'no'] },
      carryForward: {
        type: 'string',
        description: 'One or two sentences the next session\'s coach should know: the pattern to watch for.',
      },
    },
    required: ['summarySpoken', 'walkthrough', 'scorecard', 'behaviourFlags', 'gaps', 'readings', 'verdict', 'carryForward'],
  },
};

export interface DebriefContext {
  scenario: Scenario;
  transcript: TranscriptEvent[];
  notebook: string[];
  surfacedFactIds: Set<string>;
  finalBoard: BoardSnapshot | null;
  boardSceneJSON: string | null;
}

export function buildDebriefSystem(ctx: DebriefContext): string {
  const answer = getAnswer(ctx.scenario.id);
  const unsurfacedFacts = ctx.scenario.layer2.filter((f) => !ctx.surfacedFactIds.has(f.id));
  const axisSessionCounts = Object.fromEntries(RUBRIC_AXES.map((a) => [a.id, axisSessionCount(a.id)]));
  return buildCoachSystemPrompt({
    scenario: ctx.scenario,
    answer,
    unsurfacedFacts,
    axisSessionCounts,
    carryForwards: recentCarryForwards(),
  });
}

function debriefUserMessage(ctx: DebriefContext): Anthropic.MessageParam {
  const parts: Anthropic.ContentBlockParam[] = [];
  let text = `FULL TRANSCRIPT\n${serializeTranscript(ctx.transcript)}\n\n`;
  text += `THE INTERVIEWER'S PRIVATE NOTEBOOK\n${ctx.notebook.length ? ctx.notebook.map((n) => `- ${n}`).join('\n') : '(no notes were taken)'}\n\n`;
  if (ctx.finalBoard) {
    text += `FINAL BOARD\nInventory: ${ctx.finalBoard.inventory}. Image attached.\n\n`;
  } else {
    text += `FINAL BOARD\nThe candidate never drew anything. That itself is signal.\n\n`;
  }
  if (ctx.boardSceneJSON) {
    text += `BOARD SCENE DATA (element structure)\n${ctx.boardSceneJSON}\n\n`;
  }
  text += `Produce the full debrief now via submit_debrief.`;
  parts.push({ type: 'text', text });
  if (ctx.finalBoard?.pngBase64) parts.push(imageBlock(ctx.finalBoard.pngBase64));
  return { role: 'user', content: parts };
}

export async function runDebrief(
  client: Anthropic,
  model: string,
  ctx: DebriefContext,
): Promise<{ result: DebriefResult; system: string; firstUserMessage: Anthropic.MessageParam }> {
  const system = buildDebriefSystem(ctx);
  const firstUserMessage = debriefUserMessage(ctx);
  const result = await callWithTool<DebriefResult>(client, {
    model,
    system,
    messages: [firstUserMessage],
    tool: DEBRIEF_TOOL,
    maxTokens: 6000,
  });
  return { result, system, firstUserMessage };
}

/** The open coach conversation after the scorecard has landed. */
export async function coachReply(
  client: Anthropic,
  model: string,
  system: string,
  firstUserMessage: Anthropic.MessageParam,
  debriefJSON: string,
  chat: Array<{ role: 'user' | 'assistant'; text: string }>,
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    firstUserMessage,
    { role: 'assistant', content: `Here is the debrief I delivered:\n${debriefJSON}` },
    ...chat.map((m) => ({ role: m.role, content: m.text }) as Anthropic.MessageParam),
  ];
  return callText(client, { model, system, messages, maxTokens: 1500 });
}

export function scorecardToAxisResults(result: DebriefResult): AxisResult[] {
  return result.scorecard.map((s) => ({ axisId: s.axisId, pass: s.pass, evidenceQuote: s.evidenceQuote }));
}
