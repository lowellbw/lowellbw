import type Anthropic from '@anthropic-ai/sdk';
import { callWithTool, imageBlock, type ToolSpec } from '../llm/anthropic';
import type { Phase } from './stateMachine';
import { PHASE_ORDER } from './stateMachine';

/**
 * The agentic interviewer call. One wake → one action. The engine is a
 * heartbeat; this module gives the model the room (transcript, clock, board)
 * and the tools a real interviewer has: speak, stay silent, move the
 * interview along, take a private note.
 *
 * Never import scenarios/answers/ here (enforced by test) — the interviewer
 * must not be able to hold the model answer.
 */

export type WakeReason = 'session-start' | 'utterance' | 'silence' | 'manual';

export interface TranscriptEvent {
  kind: 'candidate' | 'interviewer' | 'phase' | 'board' | 'note' | 'engine';
  text: string;
  atMin: number;
}

export interface BoardSnapshot {
  pngBase64: string | null;
  inventory: string;
  hash: string;
}

export interface InterviewerAction {
  action: 'speak' | 'wait' | 'advance_phase';
  say?: string;
  advance_to?: Phase;
  note?: string;
  revealed_fact_ids?: string[];
  planted_suggestion_delivered?: boolean;
}

export const INTERVIEWER_TOOL: ToolSpec = {
  name: 'interviewer_action',
  description: 'Your single action for this wake of the interview.',
  input_schema: {
    type: 'object',
    properties: {
      note: {
        type: 'string',
        description:
          'Private notebook entry — observations, verbatim quotes, gaps you are letting stand. Never shown to the candidate; feeds the debrief.',
      },
      revealed_fact_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ids of Layer-2 facts your speech in this turn discloses.',
      },
      planted_suggestion_delivered: {
        type: 'boolean',
        description: 'Set true on the turn where you deliver the planted suggestion.',
      },
      action: {
        type: 'string',
        enum: ['speak', 'wait', 'advance_phase'],
        description: 'speak = say something now; wait = deliberately stay silent; advance_phase = move the interview to its next section.',
      },
      say: {
        type: 'string',
        description: 'What you say out loud (spoken register — it goes to TTS). Required for speak and advance_phase.',
      },
      advance_to: {
        type: 'string',
        enum: PHASE_ORDER,
        description: 'The phase to move to (advance_phase only). Moving to "debrief" ends the interview.',
      },
    },
    required: ['action'],
  },
};

function describeWake(reason: WakeReason, silenceSec?: number): string {
  switch (reason) {
    case 'session-start':
      return 'The session is starting. The candidate has just joined the call. Open the interview.';
    case 'utterance':
      return 'The candidate has just finished speaking (last transcript entry).';
    case 'silence':
      return `The candidate has been silent for ~${Math.round(silenceSec ?? 0)}s. They may be drawing, thinking, or stuck — the board tells you which. Act per your interjection policy (waiting is often right).`;
    case 'manual':
      return 'The candidate pressed the "interviewer, go ahead" button — they are explicitly handing you the floor.';
  }
}

export function serializeTranscript(events: TranscriptEvent[]): string {
  if (!events.length) return '(nothing yet)';
  const fmt = (m: number) => `${String(Math.floor(m)).padStart(2, '0')}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`;
  return events
    .map((e) => {
      switch (e.kind) {
        case 'candidate':
          return `[${fmt(e.atMin)}] CANDIDATE: ${e.text}`;
        case 'interviewer':
          return `[${fmt(e.atMin)}] YOU: ${e.text}`;
        case 'phase':
          return `[${fmt(e.atMin)}] — phase → ${e.text} —`;
        case 'board':
          return `[${fmt(e.atMin)}] (board updated: ${e.text})`;
        case 'note':
          return `[${fmt(e.atMin)}] (your private note: ${e.text})`;
        case 'engine':
          return `[${fmt(e.atMin)}] (engine: ${e.text})`;
      }
    })
    .join('\n');
}

export interface WakeContext {
  reason: WakeReason;
  silenceSec?: number;
  clockLine: string;
  transcript: TranscriptEvent[];
  board: BoardSnapshot | null;
  boardChanged: boolean;
  plantedDelivered: boolean;
  phase: Phase;
}

export function buildWakeMessages(ctx: WakeContext): Anthropic.MessageParam[] {
  const parts: Anthropic.ContentBlockParam[] = [];

  let text = `TRANSCRIPT SO FAR\n${serializeTranscript(ctx.transcript)}\n\n`;
  text += `CLOCK\n${ctx.clockLine}\n\n`;
  text += `WAKE\n${describeWake(ctx.reason, ctx.silenceSec)}\n`;
  if (ctx.phase !== 'brief' && !ctx.plantedDelivered && (ctx.phase === 'pushback' || ctx.phase === 'questions')) {
    text += `\n(Reminder: you have not yet delivered the planted suggestion — land it naturally before the interview ends.)\n`;
  }
  if (ctx.board) {
    text += ctx.boardChanged
      ? `\nBOARD\nThe whiteboard has changed since you last looked. Current element inventory: ${ctx.board.inventory}. The image is attached.\n`
      : `\nBOARD\nUnchanged since your last look. Inventory: ${ctx.board.inventory}\n`;
  } else {
    text += `\nBOARD\nStill empty.\n`;
  }
  text += `\nRespond with exactly one interviewer_action.`;

  parts.push({ type: 'text', text });
  if (ctx.board?.pngBase64 && ctx.boardChanged) {
    parts.push(imageBlock(ctx.board.pngBase64));
  }
  return [{ role: 'user', content: parts }];
}

export async function wakeInterviewer(
  client: Anthropic,
  model: string,
  systemPrompt: string,
  ctx: WakeContext,
): Promise<InterviewerAction> {
  const action = await callWithTool<InterviewerAction>(client, {
    model,
    system: systemPrompt,
    messages: buildWakeMessages(ctx),
    tool: INTERVIEWER_TOOL,
    maxTokens: 1000,
  });
  // Defensive normalization — a speak with no text becomes a wait.
  if ((action.action === 'speak' || action.action === 'advance_phase') && !action.say?.trim()) {
    if (action.action === 'speak') return { ...action, action: 'wait' };
  }
  return action;
}
