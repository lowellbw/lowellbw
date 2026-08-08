import type { Scenario } from './types';

export const streamingReturns: Scenario = {
  id: 'streaming-returns',
  title: 'Meridian — streaming support & cancellation saves',
  kind: 'design',
  vertical: 'media / streaming',
  layer1: {
    rich: `Meridian is a US streaming service — about 35 million subscribers — that also sells a streaming stick and branded merch through its online store. They're buying an AI agent for customer support. The outcome they care about: cost per contact is around $9 and they want it under $4, and they're bleeding subscribers in the cancellation flow — the retention team thinks a lot of those cancels are saveable. In scope: subscription cancellation and saves, billing questions and disputes, and order status and returns for the hardware and merch. Channel is chat, in the app and on the web. Two constraints to know up front: their billing stack is old and partly batch-based, and anything touching saves and offers is politically sensitive — the Growth team owns offers. Design the agent.`,
    medium: `Meridian is a US streaming service, about 35 million subscribers, which also sells a streaming stick and merch online. They want an AI agent for customer support — the big drivers are support cost and churn in the cancellation flow. In scope: cancellation and saves, billing questions and disputes, and order status and returns for physical goods. Channel is chat. Design the agent.`,
    sparse: `Meridian is a big US streaming service that also sells some hardware. They want an AI agent for their customer support. Design it.`,
  },
  layer2: [
    {
      id: 'outcome-numbers',
      topic: 'business',
      fact: 'Cost per contact is $9.10 blended; target is under $4. Monthly voluntary churn is 4.1%, and exit surveys say ~30% of cancellers were "persuadable". A saved subscriber is worth ~$140 in expected LTV; the retention team\'s budget per save is $25.',
    },
    {
      id: 'volumes',
      topic: 'volumes',
      fact: 'Roughly 1.1M support contacts a month. Peaks: Sunday evenings (2x), and price-change or content-removal announcements (up to 20x for 48 hours — the last price change generated 400k contacts in two days).',
    },
    {
      id: 'billing-stack',
      topic: 'data-apis',
      fact: 'Subscriptions and billing run on a homegrown 2011 system. Charges post via nightly batch, so "was I charged?" can be up to 24h stale. There is a real-time entitlements API (what the account can watch) and a modern payments gateway, but refunds go through the batch system and take 3–5 days to appear.',
    },
    {
      id: 'commerce-stack',
      topic: 'data-apis',
      fact: 'The store (stick + merch) runs on Shopify — modern APIs, real-time order status, returns handled by a 3PL with a webhook feed. Completely separate stack from streaming.',
    },
    {
      id: 'identity-join',
      topic: 'data-apis',
      fact: 'There is no unified customer ID between streaming accounts and store orders — they join on email, and about 7% of store customers used a different email than their streaming account.',
    },
    {
      id: 'ftc-cancellation',
      topic: 'compliance',
      landmine: true,
      fact: 'Legal constraint the retention team downplays: under the FTC\'s click-to-cancel (Negative Option) rule and California law, cancellation must be as easy as signup. Once a customer states they want to cancel, the agent must execute it without obstruction — at most ONE save offer, and only if the customer engages with it. An agent designed to "make saves" by adding steps, repeating offers, or feigning confusion creates regulatory exposure Legal will not accept. Any save flow needs an auditable "customer asked → cancellation completed" trail.',
    },
    {
      id: 'offer-ownership',
      topic: 'policy-ownership',
      fact: 'Save offers (discounts, plan downgrades, pause) are owned by the Growth team, allocated per-cohort with monthly budgets, and change every few weeks. They live in an internal "offer eligibility service" with an API. The refund policy is owned by Finance and lives in a Confluence page updated roughly monthly — support agents work from a copy that is sometimes stale.',
    },
    {
      id: 'human-agents',
      topic: 'human-agents-today',
      fact: 'Support is ~400 outsourced BPO agents across two vendors. CSAT 68%. Average handle time 9 minutes. A specialist retention desk of 40 agents takes cancellation calls with a 22% save rate; regular agents are not allowed to make offers at all.',
    },
    {
      id: 'error-tolerance',
      topic: 'error-tolerance',
      fact: 'Tolerance varies sharply by workflow: billing disputes are near-zero-tolerance (a wrong refund amount or a wrong "you weren\'t charged" is the top driver of chargebacks and 1-star reviews). Order-status answers can be a bit wrong without much damage. Save-offer mistakes are budget leaks: an agent offering discounts to customers who weren\'t going to cancel is negative-value.',
    },
    {
      id: 'password-sharing',
      topic: 'business',
      fact: 'A wrinkle nobody mentions up front: ~12% of "billing" contacts are actually account-sharing crackdown fallout — people charged for extra-member slots they don\'t understand. These conversations are emotionally hot and the policy is deliberately strict; the human playbook is empathize-but-don\'t-waive.',
    },
    {
      id: 'existing-bot',
      topic: 'human-agents-today',
      fact: 'They already have a keyword FAQ bot in the chat entry point. It "contains" 31% of contacts, but a third of those users just leave — nobody has measured whether contained means resolved.',
    },
    {
      id: 'cx-tooling',
      topic: 'other',
      fact: 'The CX org runs on Zendesk. The VP of CX has said whatever agent they buy must give her team "the same visibility they have into BPO agents today": QA sampling, conversation review, and per-workflow dashboards, or she won\'t sign off.',
    },
  ],
  plantedSuggestion: {
    timing: 'Mid-Design, once the candidate is discussing the cancellation-save flow.',
    suggestion:
      'You know what we could do — we have thousands of transcripts from our best retention specialists, the 22%-save-rate people. Why not just fine-tune the model on those transcripts so the agent naturally talks like our best savers? Feels like we\'d get their skills for free.',
    whyArguable:
      'Superficially plausible, actually bad: (1) top-saver transcripts encode exactly the pressure tactics the FTC rule prohibits — you\'d be distilling compliance risk into weights; (2) offers change every few weeks, so offer knowledge belongs in the offer-eligibility API at runtime, not baked into a model; (3) it confuses style with policy — you can get tone via prompting, but what the agent may offer must be externally controlled and auditable; (4) no eval story: "sounds like our best agents" is not a measurable target. A strong candidate separates conversational competence (model) from offer policy (service) and flags the compliance angle. Capitulating ("great idea, we\'ll fine-tune") or hand-waving agreement fails.',
  },
  probes: [
    'How does the agent know which save offer it is allowed to make to this specific customer?',
    'A customer says they were double-charged, and your billing data is up to 24 hours stale — walk me through the conversation.',
    'The CEO announces a price increase tomorrow morning and volume goes 20x for two days. What breaks first?',
    'What does the CX manager see on Monday morning? Show me the dashboard.',
    'A customer says "cancel my account" in their first message. What happens, step by step?',
    'How would you know the agent is leaking offer budget — saving people who were never going to leave?',
  ],
  pushbackWeights: [
    'Their compliance team won\'t approve this.',
    'What happens when the model gets it wrong?',
    'How do you know it\'s working?',
    'Cut it to what ships in two weeks.',
    'They have no API for that.',
  ],
};
