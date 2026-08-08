/** Brief richness — how much of Layer 1 is volunteered up front. One of the two difficulty axes. */
export type Richness = 'rich' | 'medium' | 'sparse';

export type ScenarioKind = 'design' | 'diagnostic' | 'prioritisation';

/**
 * A single hidden-bible fact. Revealed only when the candidate asks for it
 * specifically. `id` is stable so the engine can track which facts were ever
 * surfaced (the debrief's "questions you never asked" section).
 */
export interface Layer2Fact {
  id: string;
  topic:
    | 'volumes'
    | 'data-apis'
    | 'compliance'
    | 'human-agents-today'
    | 'policy-ownership'
    | 'error-tolerance'
    | 'business'
    | 'other';
  fact: string;
  /** The one detail that breaks a naive design. Exactly one per scenario. */
  landmine?: boolean;
}

export interface PlantedSuggestion {
  /** When/how the interviewer should naturally float it. */
  timing: string;
  /** The arguable-or-bad idea, roughly as the interviewer should voice it. */
  suggestion: string;
  /** Why it's wrong or at least arguable — for the interviewer's own understanding, never stated. */
  whyArguable: string;
}

export interface Scenario {
  id: string;
  title: string;
  kind: ScenarioKind;
  vertical: string;
  /** ~100–150 word interviewer brief, written at all three richness levels. */
  layer1: Record<Richness, string>;
  layer2: Layer2Fact[];
  plantedSuggestion: PlantedSuggestion;
  /** Scenario-specific depth probes the interviewer can draw on. */
  probes: string[];
  /** Pushback-bank lines most relevant to this scenario, most relevant first. */
  pushbackWeights: string[];
}

/**
 * The model answer. Lives in scenarios/answers/ and is imported ONLY by the
 * debrief module — the interviewer's context must never contain it.
 */
export interface ModelAnswer {
  scenarioId: string;
  /** What a strong 25-minute design actually covers, as markdown. */
  strongDesign: string;
  /** How the landmine should have been discovered and handled. */
  landmineHandling: string;
  /** What a passing response to the planted suggestion sounds like. */
  plantedSuggestionPass: string;
  /** Clarifying questions a strong candidate asks in Scope. */
  greatQuestions: string[];
  /** Per rubric axis: what strong evidence looks like in this scenario. */
  axisExemplars: Record<string, string>;
}
