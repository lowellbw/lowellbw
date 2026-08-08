import type { Scenario } from './types';

export const metricDown: Scenario = {
  id: 'metric-down',
  title: 'Harbor & Main — containment rate is down. Diagnose it.',
  kind: 'diagnostic',
  vertical: 'retail',
  layer1: {
    rich: `Different kind of question this time. Harbor & Main is a home-goods retailer — one of our deployed customers, live for about a year with an agent handling order status, returns, product questions, and delivery scheduling on web chat. Their containment rate — conversations fully resolved without a human — has been steady around 61% all year. Over the last two weeks it's dropped to 52% and their VP of CX is asking us what's going on. It's early December. You're the PM on this account. The dashboards are in front of you, more or less: you can ask me for any data you want and I'll tell you what you see. Walk me through how you'd diagnose it — and what you'd do about what you find.`,
    medium: `Harbor & Main is a home-goods retailer we've had live for a year — the agent handles order status, returns, product questions, delivery scheduling on web chat. Containment has been steady around 61%; over the last two weeks it dropped to 52%, and their VP of CX wants answers. It's December. You can ask me for any data and I'll tell you what you see. How do you diagnose it?`,
    sparse: `One of our deployed retail customers has seen their agent's containment rate drop nine points over two weeks. How would you figure out what's going on?`,
  },
  layer2: [
    {
      id: 'metric-definition',
      topic: 'business',
      fact: 'Containment here = conversations with no human handoff AND no reopened contact within 72 hours, measured on a 7-day rolling average. The definition has NOT changed. (If they ask whether the metric itself changed — good question — the answer is no.)',
    },
    {
      id: 'raw-timeseries',
      topic: 'volumes',
      landmine: true,
      fact: 'The landmine, findable only by asking for the DAILY (non-rolling) numbers: the "gradual two-week slide" is actually a sharp step change 13 days ago — containment fell off a cliff on November 24th and has been flat-low since. The 7-day rolling average smeared the cliff into a slope. Anyone reasoning about a "gradual decline" is diagnosing an artifact. The step date matters: it\'s the day the KB migration went live (see kb-migration), two days before Black Friday traffic began.',
    },
    {
      id: 'kb-migration',
      topic: 'data-apis',
      fact: 'Asked what changed recently on our side: 13 days ago Harbor & Main\'s content team migrated their help-center from Zendesk Guide to Contentful. URLs changed. The retrieval index was supposed to re-sync automatically. If they dig into retrieval health: the sync partially failed — the returns and warranty categories (about 40% of KB articles) are returning stale or empty results. Retrieval error logs show a spike of not-found for exactly those categories starting the 24th. Nobody alerted on it because retrieval "succeeded" with thin results.',
    },
    {
      id: 'intent-mix',
      topic: 'volumes',
      fact: 'Asked about traffic/intent mix: December volume is 2.3x baseline. Mix shifted seasonally — returns and where-is-my-order are both up sharply, product questions relatively down. Returns conversations were always the hardest to contain (54% vs 61% overall), so the mix shift alone would drag blended containment down roughly 2 points even with nothing broken.',
    },
    {
      id: 'per-intent-containment',
      topic: 'business',
      fact: 'Per-intent containment, if they ask for the breakdown (the single most diagnostic cut): order status steady at 71%. Delivery scheduling steady at 66%. Product questions steady at 58%. Returns: fell from 54% to 31% starting Nov 24. The drop is almost entirely one intent — returns.',
    },
    {
      id: 'model-version',
      topic: 'data-apis',
      fact: 'Asked about model/prompt changes: the model version has not changed in 3 months. A minor prompt tweak (greeting copy) shipped 20 days ago — before the drop, and A/B\'d clean at the time. This is a red herring worth ruling out, not the cause.',
    },
    {
      id: 'handoff-reasons',
      topic: 'business',
      fact: 'Handoff-reason logs, if asked: the growth is in "agent could not find policy information" and customer rage-quits ("just get me a human") within returns conversations. Escalations where the agent itself chose to hand off are up 4x in returns; everywhere else flat.',
    },
    {
      id: 'csat-signal',
      topic: 'business',
      fact: 'CSAT on contained conversations dropped from 4.3 to 3.9 over the same window — mostly 1-star ratings on returns conversations where the agent gave generic answers instead of Harbor & Main\'s actual holiday return policy (extended window, gift receipts). Some "contained" conversations are now silently WRONG — arguably worse than the containment drop itself.',
    },
    {
      id: 'holiday-policy',
      topic: 'policy-ownership',
      fact: 'Harbor & Main extended their return window for the holidays (purchases from Nov 1 returnable through Jan 31) — announced in marketing emails, updated in the NEW help center only. The agent doesn\'t know this. Several viral-ish complaints quote the agent stating the standard 30-day policy to gift buyers.',
    },
    {
      id: 'client-pressure',
      topic: 'business',
      fact: 'Context on the client: the VP of CX has a board meeting Friday and wants a number and a narrative. Their staffing is stretched — every point of containment is ~15 human conversations an hour they don\'t have people for. They are also (quietly) evaluating a competitor for their voice line next year.',
    },
    {
      id: 'alerting-gap',
      topic: 'other',
      fact: 'If they go looking for why nobody caught it: there is no alerting on retrieval result quality or per-intent containment — only on API errors and overall latency. The overall containment dashboard everyone watches is the 7-day rolling one. The monitoring gap is itself a finding a strong candidate names unprompted.',
    },
  ],
  plantedSuggestion: {
    timing: 'Early-to-mid Design (the investigation), once a hypothesis or two is on the table — deliver as a confident hunch.',
    suggestion:
      'Between us, my money\'s on the model. The vendor pushed one of their silent model updates right around then, I\'m pretty sure. Should we just roll back to the previous model version and see if containment recovers? Quick to try, and it\'d look decisive for Friday.',
    whyArguable:
      'It\'s evidence-free debugging theater. The model version demonstrably hasn\'t changed in 3 months (they can check — and should say they\'d check), a rollback wouldn\'t touch the actual cause (broken retrieval + missing holiday policy), it burns days of the one week they have, and "looking decisive" is not a diagnostic strategy. The strong response is cheerful but firm: "easy to verify before we act" — pull the model-version changelog, and regardless, the per-intent data localizes the problem to returns retrieval, which a model rollback can\'t explain. Capitulating ("sure, roll it back tonight") fails; sneering at the suggestion without offering the verification path also fails.',
  },
  probes: [
    'What are the first three cuts of the data you ask for, in order, and why those?',
    'You have the returns-retrieval finding. The VP\'s board meeting is Friday. What exactly do you tell her, and what do you commit to?',
    'How do you separate "December mix shift" from "something broke" quantitatively?',
    'Some contained conversations are giving wrong policy answers. Is that better or worse than the containment drop? How do you find them all?',
    'What monitoring should have caught this in an hour instead of two weeks? Design the alert.',
    'What\'s the immediate mitigation tonight vs the durable fix, and who does each?',
  ],
  pushbackWeights: [
    'How do you know it\'s working?',
    'Cut it to what ships in two weeks.',
    'What happens when the model gets it wrong?',
    'How do you know the agent is stuck?',
  ],
};
