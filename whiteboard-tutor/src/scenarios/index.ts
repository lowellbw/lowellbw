import type { Scenario } from './types';
import { streamingReturns } from './01-streaming-returns';
import { healthInsuranceBilling } from './02-health-insurance-billing';
import { telcoVoiceTroubleshooting } from './03-telco-voice-troubleshooting';
import { metricDown } from './04-metric-down';
import { oneEngineerOneWeek } from './05-one-engineer-one-week';

export const SCENARIOS: Scenario[] = [
  streamingReturns,
  healthInsuranceBilling,
  telcoVoiceTroubleshooting,
  metricDown,
  oneEngineerOneWeek,
];

export function getScenario(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scenario: ${id}`);
  return s;
}
