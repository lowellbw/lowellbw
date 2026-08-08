/**
 * Sierra's published axes plus the four they name elsewhere, and the three
 * scored-down behaviours. Shared by the coach prompt, the session log, and the
 * debrief UI. Binary per criterion with an evidence quote — never 1–5.
 */

export interface RubricAxis {
  id: string;
  name: string;
  description: string;
}

export const RUBRIC_AXES: RubricAxis[] = [
  {
    id: 'what-it-does',
    name: 'What the agent does',
    description:
      'Journeys, decisions, escalation logic, scope. Did they define which workflows the agent owns, where it hands off, and what it explicitly does not do?',
  },
  {
    id: 'how-it-works',
    name: 'How it works',
    description:
      'Architecture, data flows, APIs, integrations, evals. Is there a real system on the board — sources of truth, integration reality, an eval strategy named before a model?',
  },
  {
    id: 'how-it-feels',
    name: 'How it feels',
    description:
      'Clarity, trust, edge cases, failures at scale. What does the customer experience when it works, when it fails, and when it half-works?',
  },
  {
    id: 'scoping',
    name: 'Scoping judgement under time pressure',
    description:
      'The prompt is deliberately too big to finish. Did they choose what to build, say what they were cutting and why, and manage the clock?',
  },
  {
    id: 'agency',
    name: 'Agency',
    description:
      'When stuck, did they pivot or spin? Did they commit to a direction rather than hedge across three?',
  },
  {
    id: 'collaboration',
    name: 'Collaboration under challenge',
    description:
      "The planted-suggestion response. Engaging with genuine curiosity and reasoning — even while declining — passes; capitulating to a bad idea or getting defensive fails.",
  },
  {
    id: 'delivery',
    name: 'Verbal delivery',
    description:
      'Structure, signposting when changing abstraction level, and no half-thoughts — starting a sentence aloud and finishing it internally destroys the interviewer\'s ability to score reasoning.',
  },
];

export interface ScoredDownBehaviour {
  id: string;
  name: string;
  description: string;
}

export const SCORED_DOWN: ScoredDownBehaviour[] = [
  {
    id: 'end-customer-only',
    name: 'Designed only for the end customer',
    description:
      'Sierra names three users: the person getting help, the CX manager monitoring and improving the agent, and the developer extending the platform. Ignoring the second and third loses most of the product.',
  },
  {
    id: 'promised-determinism',
    name: 'Promised determinism',
    description:
      'Claiming the agent will always/never do X, instead of Sierra\'s bounded-error-rates framing: error budgets per workflow, detection, and recovery.',
  },
  {
    id: 'no-commitment',
    name: 'Refused to commit to a direction',
    description:
      'Presenting options without choosing contradicts a stated company value ("Intensity: we don\'t have the luxury of patience").',
  },
];

export const ALL_SCORED_IDS = [
  ...RUBRIC_AXES.map((a) => a.id),
  ...SCORED_DOWN.map((b) => b.id),
];
