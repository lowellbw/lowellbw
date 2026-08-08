/**
 * Model answers. This module is imported ONLY by src/engine/debrief.ts —
 * the interviewer must never be able to hold these in context. A test in
 * src/engine/__tests__ enforces both the import graph and content isolation.
 */
import type { ModelAnswer } from '../types';
import { streamingReturnsAnswer } from './01-streaming-returns.answer';
import { healthInsuranceBillingAnswer } from './02-health-insurance-billing.answer';
import { telcoVoiceTroubleshootingAnswer } from './03-telco-voice-troubleshooting.answer';
import { metricDownAnswer } from './04-metric-down.answer';
import { oneEngineerOneWeekAnswer } from './05-one-engineer-one-week.answer';

const ANSWERS: ModelAnswer[] = [
  streamingReturnsAnswer,
  healthInsuranceBillingAnswer,
  telcoVoiceTroubleshootingAnswer,
  metricDownAnswer,
  oneEngineerOneWeekAnswer,
];

export function getAnswer(scenarioId: string): ModelAnswer {
  const a = ANSWERS.find((x) => x.scenarioId === scenarioId);
  if (!a) throw new Error(`No model answer for scenario: ${scenarioId}`);
  return a;
}

export function allAnswers(): ModelAnswer[] {
  return ANSWERS;
}
