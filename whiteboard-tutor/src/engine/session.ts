import type Anthropic from '@anthropic-ai/sdk';
import { makeClient } from '../llm/anthropic';
import { SpeechListener } from '../speech/stt';
import { Voice } from '../speech/tts';
import { buildInterviewerSystemPrompt } from '../prompts/interviewer';
import type { Scenario } from '../scenarios/types';
import type { DifficultyState } from './difficulty';
import type { Persona } from './personas';
import {
  wakeInterviewer,
  type BoardSnapshot,
  type InterviewerAction,
  type TranscriptEvent,
  type WakeReason,
} from './interviewerAgent';
import { advance, createClock, describeClock, nextPhase, readClock, type PhaseClockState } from './stateMachine';
import { coachReply, runDebrief, scorecardToAxisResults, type DebriefResult } from './debrief';
import { recordSession, type SessionRecord } from './sessionLog';

/**
 * The session engine: a heartbeat, not a script. It wakes the interviewer
 * agent on utterance-end, long silence, or session start, hands it the room,
 * and carries out whichever action it chooses.
 */

export type SessionStatus = 'idle' | 'interviewing' | 'generating-debrief' | 'debriefing' | 'error';

/** Silence before the agent is woken, by interjection level. */
const SILENCE_THRESHOLD_SEC: Record<number, number> = { 1: 25, 2: 50, 3: 120 };

export interface SessionConfig {
  anthropicKey: string;
  openaiKey: string | null;
  model: string;
  scenario: Scenario;
  persona: Persona;
  difficulty: DifficultyState;
  secondInterviewer: boolean;
  compressed: boolean;
}

export interface SessionHooks {
  /** Grab the current whiteboard as PNG + inventory + hash (null if empty). */
  getBoard: () => Promise<BoardSnapshot | null>;
  /** Current board scene as compact JSON, for the debrief. */
  getSceneJSON: () => string | null;
  /** Any state changed — re-render. */
  onUpdate: () => void;
}

export interface CoachChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export class SessionEngine {
  readonly config: SessionConfig;
  private hooks: SessionHooks;
  private client: Anthropic;
  private systemPrompt: string;
  private voice: Voice;
  private listener: SpeechListener | null = null;

  status: SessionStatus = 'idle';
  clock: PhaseClockState;
  transcript: TranscriptEvent[] = [];
  notebook: string[] = [];
  surfacedFactIds = new Set<string>();
  plantedDelivered = false;
  interimText = '';
  interviewerSpeaking = false;
  micAvailable = true;
  micNotice: string | null = null;
  lastError: string | null = null;
  debrief: DebriefResult | null = null;
  coachChat: CoachChatMessage[] = [];
  coachThinking = false;
  sessionRecorded = false;

  private inflight = false;
  private pendingWake: WakeReason | null = null;
  private lastActivityMs = Date.now();
  private silenceNudged = false;
  private silenceTimer: ReturnType<typeof setInterval> | null = null;
  private lastBoardHash: string | null = null;
  private latestBoard: BoardSnapshot | null = null;
  private debriefSystem: string | null = null;
  private debriefFirstMessage: Anthropic.MessageParam | null = null;

  constructor(config: SessionConfig, hooks: SessionHooks) {
    this.config = config;
    this.hooks = hooks;
    this.client = makeClient(config.anthropicKey);
    this.voice = new Voice({ openaiKey: config.openaiKey });
    this.voice.onStateChange = (speaking) => {
      this.interviewerSpeaking = speaking;
      if (!speaking) this.lastActivityMs = Date.now();
      hooks.onUpdate();
    };
    this.systemPrompt = buildInterviewerSystemPrompt({
      scenario: config.scenario,
      persona: config.persona,
      difficulty: config.difficulty,
      secondInterviewer: config.secondInterviewer,
      compressed: config.compressed,
    });
    this.clock = createClock({
      compressed: config.compressed,
      designPenaltyMin: config.persona.designPenaltyMin,
    });
  }

  private atMin(): number {
    return (Date.now() - this.clock.sessionStartMs) / 60_000;
  }

  private push(event: Omit<TranscriptEvent, 'atMin'>): void {
    this.transcript.push({ ...event, atMin: this.atMin() });
    this.hooks.onUpdate();
  }

  start(): void {
    this.status = 'interviewing';
    this.clock = createClock({
      compressed: this.config.compressed,
      designPenaltyMin: this.config.persona.designPenaltyMin,
    });
    this.startListening();
    this.silenceTimer = setInterval(() => this.checkSilence(), 5000);
    void this.wake('session-start');
  }

  private startListening(): void {
    if (!SpeechListener.isSupported()) {
      this.micAvailable = false;
      this.micNotice = 'Speech recognition not supported in this browser — use Chrome, or type below.';
      this.hooks.onUpdate();
      return;
    }
    this.listener = new SpeechListener({
      onInterim: (text) => {
        this.interimText = text;
        if (text) this.lastActivityMs = Date.now();
        this.hooks.onUpdate();
      },
      onUtterance: (text) => this.handleCandidateText(text),
      onSpeechStart: () => {
        // Barge-in: the candidate talking stops the interviewer mid-line.
        this.voice.cancel();
      },
      onUnavailable: (reason) => {
        this.micAvailable = false;
        this.micNotice = reason;
        this.hooks.onUpdate();
      },
    });
    this.listener.start();
  }

  /** Shared path for spoken utterances and typed input. */
  handleCandidateText(text: string): void {
    if (this.status !== 'interviewing' || !text.trim()) return;
    this.interimText = '';
    this.lastActivityMs = Date.now();
    this.silenceNudged = false;
    this.push({ kind: 'candidate', text: text.trim() });
    void this.wake('utterance');
  }

  /** The candidate explicitly hands the interviewer the floor. */
  requestInterviewer(): void {
    if (this.status !== 'interviewing') return;
    void this.wake('manual');
  }

  private checkSilence(): void {
    if (this.status !== 'interviewing' || this.inflight || this.interviewerSpeaking || this.silenceNudged) return;
    if (this.clock.phase === 'brief') return; // opening is the interviewer's job, not a silence event
    const silentSec = (Date.now() - this.lastActivityMs) / 1000;
    if (silentSec >= SILENCE_THRESHOLD_SEC[this.config.difficulty.interjectionLevel]) {
      this.silenceNudged = true; // one nudge per stretch of silence
      void this.wake('silence');
    }
  }

  private async wake(reason: WakeReason): Promise<void> {
    if (this.status !== 'interviewing') return;
    if (this.inflight) {
      // Coalesce: an utterance outranks a silence nudge.
      if (reason === 'utterance' || this.pendingWake === null) this.pendingWake = reason;
      return;
    }
    this.inflight = true;
    this.lastError = null;
    this.hooks.onUpdate();
    try {
      const boardRelevant = this.clock.phase !== 'brief';
      let boardChanged = false;
      if (boardRelevant) {
        const board = await this.hooks.getBoard();
        if (board && board.hash !== this.lastBoardHash) {
          boardChanged = true;
          this.lastBoardHash = board.hash;
          this.latestBoard = board;
          this.push({ kind: 'board', text: board.inventory });
        }
      }
      const silenceSec = (Date.now() - this.lastActivityMs) / 1000;
      const action = await wakeInterviewer(this.client, this.config.model, this.systemPrompt, {
        reason,
        silenceSec,
        clockLine: describeClock(readClock(this.clock)),
        transcript: this.transcript,
        board: this.latestBoard,
        boardChanged,
        plantedDelivered: this.plantedDelivered,
        phase: this.clock.phase,
      });
      this.applyAction(action);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    } finally {
      this.inflight = false;
      this.hooks.onUpdate();
      const pending = this.pendingWake;
      this.pendingWake = null;
      if (pending && this.status === 'interviewing') void this.wake(pending);
    }
  }

  private applyAction(action: InterviewerAction): void {
    if (action.note?.trim()) {
      this.notebook.push(`[${this.clock.phase}] ${action.note.trim()}`);
      this.push({ kind: 'note', text: action.note.trim() });
    }
    for (const id of action.revealed_fact_ids ?? []) this.surfacedFactIds.add(id);
    if (action.planted_suggestion_delivered) this.plantedDelivered = true;

    if (action.action === 'advance_phase') {
      const to = action.advance_to ?? nextPhase(this.clock.phase);
      if (to === 'debrief') {
        if (action.say?.trim()) this.speak(action.say.trim());
        void this.finishInterview();
        return;
      }
      if (to) {
        this.clock = advance(this.clock, to);
        this.push({ kind: 'phase', text: to });
      }
      if (action.say?.trim()) this.speak(action.say.trim());
      return;
    }
    if (action.action === 'speak' && action.say?.trim()) {
      this.speak(action.say.trim());
    }
    // 'wait' — silence is a first-class move; nothing to do.
  }

  private speak(text: string): void {
    this.push({ kind: 'interviewer', text });
    this.voice.speak(text);
    this.lastActivityMs = Date.now();
    this.silenceNudged = false;
  }

  /** Candidate (or interviewer via advance_phase→debrief) ends the interview. */
  async finishInterview(): Promise<void> {
    if (this.status !== 'interviewing') return;
    this.status = 'generating-debrief';
    this.listener?.stop();
    this.listener = null;
    if (this.silenceTimer) clearInterval(this.silenceTimer);
    this.push({ kind: 'phase', text: 'debrief' });
    this.hooks.onUpdate();
    try {
      const finalBoard = (await this.hooks.getBoard()) ?? this.latestBoard;
      const { result, system, firstUserMessage } = await runDebrief(this.client, this.config.model, {
        scenario: this.config.scenario,
        transcript: this.transcript,
        notebook: this.notebook,
        surfacedFactIds: this.surfacedFactIds,
        finalBoard,
        boardSceneJSON: this.hooks.getSceneJSON(),
      });
      this.debrief = result;
      this.debriefSystem = system;
      this.debriefFirstMessage = firstUserMessage;
      this.status = 'debriefing';
      this.voice.speak(result.summarySpoken);
      this.recordToLog(result);
    } catch (err) {
      this.lastError = `Debrief failed: ${err instanceof Error ? err.message : String(err)}. Press "Retry debrief".`;
      this.status = 'error';
    }
    this.hooks.onUpdate();
  }

  async retryDebrief(): Promise<void> {
    if (this.status !== 'error') return;
    this.status = 'interviewing'; // finishInterview() gates on this
    await this.finishInterview();
  }

  private recordToLog(result: DebriefResult): void {
    if (this.sessionRecorded) return;
    this.sessionRecorded = true;
    const record: SessionRecord = {
      id: `s${Date.now()}`,
      dateISO: new Date().toISOString(),
      scenarioId: this.config.scenario.id,
      personaId: this.config.persona.id,
      interjectionLevel: this.config.difficulty.interjectionLevel,
      briefRichness: this.config.difficulty.briefRichness,
      compressed: this.config.compressed,
      passed: result.verdict === 'pass',
      axisResults: scorecardToAxisResults(result),
      gaps: result.gaps,
      carryForward: result.carryForward,
    };
    recordSession(record);
  }

  async askCoach(text: string): Promise<void> {
    if (this.status !== 'debriefing' || !this.debrief || !this.debriefSystem || !this.debriefFirstMessage) return;
    this.coachChat.push({ role: 'user', text });
    this.coachThinking = true;
    this.hooks.onUpdate();
    try {
      const reply = await coachReply(
        this.client,
        this.config.model,
        this.debriefSystem,
        this.debriefFirstMessage,
        JSON.stringify(this.debrief),
        this.coachChat,
      );
      this.coachChat.push({ role: 'assistant', text: reply });
    } catch (err) {
      // Drop the unanswered user turn so a retry re-sends it cleanly.
      this.coachChat.pop();
      this.lastError = `Coach call failed: ${err instanceof Error ? err.message : String(err)} — ask again.`;
    }
    this.coachThinking = false;
    this.hooks.onUpdate();
  }

  /** Stop everything (leaving the page / abandoning the session). */
  dispose(): void {
    this.listener?.stop();
    this.voice.cancel();
    if (this.silenceTimer) clearInterval(this.silenceTimer);
  }
}
