import type { ModelAnswer } from '../types';

export const metricDownAnswer: ModelAnswer = {
  scenarioId: 'metric-down',
  strongDesign: `A strong diagnosis runs a disciplined funnel instead of hypothesis roulette. First move: interrogate the metric itself — definition unchanged? (yes) — then ask for the DAILY raw series, not the rolling average. That reveals the cliff on Nov 24 and kills the "gradual decline" framing; everything downstream gets easier because you're now looking for what changed on a specific day. Second move: decompose — per-intent containment is the single most diagnostic cut, and it localizes the entire drop to returns (54%→31%) while everything else held. Third: what changed on/around the 24th — the KB migration — then verify mechanism in the retrieval logs (not-found spike in returns/warranty categories). Fourth: quantify the residual — December mix shift explains ~2 points blended even with nothing broken, so state the decomposition: roughly seven points broken retrieval, two points seasonal mix, and the seasonal part is a fact to staff for, not a bug to fix.

Equally important, a strong candidate widens the blast radius before declaring victory: contained-but-WRONG conversations (CSAT drop, the holiday-policy misstatements) mean the failure is worse than the containment number shows — the agent doesn't know the extended holiday return window exists. That's a second workstream: get the holiday policy into the grounding set today and find affected customers (query contained returns conversations since the 24th mentioning return windows) for proactive correction, because viral wrong-policy quotes are a trust fire.

Then the fix ladder with owners and times: tonight — re-run/repair the Contentful sync for the broken categories, add the holiday policy doc, verify with a canary set of returns questions; this week — alerting on retrieval result quality (not-found and thin-result rates per category) and per-intent containment deltas, because the two-week detection lag is itself a finding; ongoing — a content-change webhook from the client's CMS into re-indexing, and a migration checklist for customer-side content moves, because customers will do this again.

Finally the Friday narrative for the VP, delivered as a PM: what broke (their migration + our silent failure — no blame theater, shared ownership of the detection gap), the decomposed numbers, what's already recovered, and the alerting that makes recurrence a one-hour incident instead of a two-week slide. Strong candidates also name the relationship stakes (competitor evaluation) without being asked.`,
  landmineHandling: `The landmine is the rolling average masking the step change. Found by asking for daily/raw numbers — a reflex the whole scenario is built to test. Candidates who accept "gradual two-week decline" at face value anchor on gradual causes (drift, seasonality) and waste their window; the interviewer lets them, then probes ("what would the daily numbers show?"). Recovery: immediately re-cut the data, then be honest that the earlier hypotheses were built on an artifact. The meta-lesson a strong candidate says out loud: never diagnose a smoothed metric.`,
  plantedSuggestionPass: `The roll-back-the-model hunch. A pass is cheerful, fast, and evidence-shaped: "easy to check before we act — the model version log will say in thirty seconds" (it shows no change in 3 months), plus the localization argument: a model regression wouldn't crater exactly one intent while leaving the others flat, but broken retrieval in the returns KB categories would. Offer the general principle without condescension — verify cheap hypotheses instantly, act only on mechanisms that explain the data's shape. Capitulating ("sure, roll back tonight, it'll look decisive") fails; so does mocking the suggestion instead of giving the thirty-second verification path.`,
  greatQuestions: [
    'Has the definition of containment changed? Who owns the metric?',
    'Can I see the daily numbers, not the rolling average? When exactly did it start?',
    'What is containment per intent? Which workflows fell and which held?',
    'What changed around that date — on our side, and on Harbor & Main\'s side (content, policy, site, catalog)?',
    'What do the retrieval logs show for the failing intent — result counts, not-found rates?',
    'What are the handoff reasons in the fallen intent — agent-initiated vs customer rage-quit?',
    'Did CSAT on contained conversations move? Could we be contained-but-wrong?',
    'What seasonal shift is normal for December — what would containment be with nothing broken?',
    'Why didn\'t we catch this in a day — what alerting exists on retrieval quality and per-intent containment?',
  ],
  axisExemplars: {
    'what-it-does': 'Framed the agent\'s returns workflow end-to-end to locate where retrieval feeds it; distinguished agent-chose-to-escalate from customer-gave-up as different failures with different fixes.',
    'how-it-works': 'Ran the funnel: metric → raw series → per-intent cut → change correlation → mechanism verification in logs; decomposed the nine points quantitatively; designed the missing alert (per-category retrieval health + per-intent containment deltas).',
    'how-it-feels': 'Caught the contained-but-wrong problem and treated wrong-policy answers to gift buyers as the worse fire; proposed proactive correction to affected customers, not just a forward fix.',
    scoping: 'Time-boxed the investigation, committed to the two-workstream split (fix + narrative), and kept the Friday deliverable in view instead of diagnosing forever.',
    agency: 'Abandoned gradual-cause hypotheses the moment the daily data showed a cliff; drove to the retrieval logs for mechanism rather than stopping at correlation.',
    collaboration: 'Handled the boss\'s pet theory with instant-verification grace and a mechanism argument, keeping the relationship warm while killing the rollback.',
    delivery: 'Narrated the funnel as a numbered plan before diving; stated each finding as claim + evidence; the Friday story delivered in three crisp sentences when asked.',
  },
};
