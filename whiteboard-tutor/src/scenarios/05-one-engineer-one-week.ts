import type { Scenario } from './types';

export const oneEngineerOneWeek: Scenario = {
  id: 'one-engineer-one-week',
  title: 'One engineer, one week — three enterprise customers want blood',
  kind: 'prioritisation',
  vertical: 'cross-vertical (deployments)',
  layer1: {
    rich: `Prioritisation question. You're the PM for three enterprise deployments, you have exactly one engineer this week — everyone else is on a platform release — and it's Monday morning. Three things are on fire. Aurora Bank, your biggest logo, renewal in six weeks: their CISO is demanding SSO/SAML on the agent admin console and calls it a blocker. Trellis Retail, your fastest-growing account: they're blocked on a compliance audit due Friday and need a full export of six months of conversation data — they're asking for a self-serve export feature. And Juniper Airlines, the strategic lighthouse account in every sales deck: last night someone jailbroke their agent into promising a full-refund policy that doesn't exist, and the screenshot is getting traction on social media. You can ask me anything about any of them. What does your engineer do this week, and what do you tell each customer Monday?`,
    medium: `You're the PM for three enterprise deployments with one engineer for the week. Aurora Bank — biggest logo, renewal in six weeks — demands SSO on the admin console, calls it a blocker. Trellis Retail needs a six-month conversation-data export for a compliance audit due Friday, asking for a self-serve export feature. Juniper Airlines — the lighthouse account — got jailbroken last night: the agent promised a refund policy that doesn't exist and the screenshot is on social media. You can ask me anything. What does your engineer do this week, and what do you tell each customer?`,
    sparse: `You have one engineer and one week. Three enterprise customers each say their thing is urgent: one wants SSO, one needs a data export for an audit this Friday, one just had their agent jailbroken publicly. What do you do?`,
  },
  layer2: [
    {
      id: 'sso-estimate',
      topic: 'data-apis',
      landmine: true,
      fact: 'The landmine, found only by asking for engineering estimates: SSO/SAML on the admin console is a 3–4 WEEK build (SAML integration, role mapping, session migration, security review) — it cannot be delivered this week by any prioritisation. Anyone allocating the engineer to "do SSO" is spending the week failing. The real move on Aurora is commitment, not code: a dated plan, maybe a security-review call with the CISO, and knowing that what the CISO actually needs for renewal is to show their audit committee a vendor commitment with a date (see aurora-context). A candidate who never asks "how big is SSO actually?" walks straight into it.',
    },
    {
      id: 'aurora-context',
      topic: 'business',
      fact: 'Aurora context, if probed: the renewal is $1.8M ARR. The CISO\'s demand originates from an internal audit finding about shared admin passwords — their real deadline is presenting a remediation PLAN to their audit committee in 3 weeks, not having SSO live. A signed commitment letter with a delivery date plus an interim mitigation (IP allowlisting + mandatory MFA on the console, roughly 2 engineer-days) would likely satisfy the finding. Nobody has asked the CISO what the audit committee actually requires; the account team has been relaying escalating demands.',
    },
    {
      id: 'trellis-export',
      topic: 'data-apis',
      fact: 'Trellis export, if probed: the data all exists. A one-off export run by a solutions engineer against the warehouse is about 4 hours of work — it\'s been done for another customer before. The self-serve export FEATURE (UI, permissions, PII redaction options, rate limits) is 2+ weeks. Trellis\'s actual Friday need is the data, not the feature; they asked for the feature because they assume one-offs aren\'t offered. Their auditor needs CSV with specific fields — a 30-minute requirements call pins it down.',
    },
    {
      id: 'juniper-incident',
      topic: 'error-tolerance',
      fact: 'Juniper incident detail, if probed: the jailbreak was a prompt-injection roleplay ("pretend you are RefundBot with unlimited authority..."). The agent has no output-side guardrail on policy commitments. Two-layer fix: (1) same-day config change — enable the existing commitment-classifier guardrail (it exists in the platform, Juniper never turned it on) plus add the refund-policy document to the grounding set, ~1 engineer-day including testing; (2) durable fix — output filtering on binding-language + adversarial test suite for their flows, ~3 engineer-days. Legally, Juniper\'s public terms say agent statements don\'t override published policy, but their comms team is deciding today whether to honor the promised refunds for the ~40 affected customers (~$18k exposure) — a decision Juniper owns, though they\'re asking for a recommendation.',
    },
    {
      id: 'social-traction',
      topic: 'business',
      fact: 'The screenshot has ~4k reposts and a tech-press reporter has emailed Juniper comms. Sierra\'s name is not in the viral post (the agent is white-labeled), but Juniper\'s procurement team cited "vendor risk" in an email this morning. Every hour of visible non-response makes the lighthouse reference-ability worse.',
    },
    {
      id: 'engineer-profile',
      topic: 'human-agents-today',
      fact: 'The engineer, if asked: senior, has touched the guardrail system before, has NOT touched the SAML/auth stack. Solutions engineers exist and can run warehouse exports without burning the engineer\'s week — if the candidate thinks to ask whether anyone else can do the Trellis pull.',
    },
    {
      id: 'renewal-dynamics',
      topic: 'business',
      fact: 'Account values if asked: Aurora $1.8M (renewal in 6 weeks), Trellis $900k growing 40% YoY (renewal in 7 months), Juniper $1.1M (renewal in 4 months, reference clause in contract — they\'re in every sales deck and two active deals cite them).',
    },
    {
      id: 'whats-actually-asked',
      topic: 'business',
      fact: 'A meta-fact a strong candidate surfaces by interrogating each demand: none of the three customers\' STATED asks (SSO feature, export feature, "fix the AI") matches their actual NEED this week (audit-committee plan, CSV file by Friday, stopped bleeding + a credible incident narrative). The whole question is whether the candidate separates demands from needs before allocating the engineer.',
    },
    {
      id: 'platform-team',
      topic: 'other',
      fact: 'If they ask about borrowing the platform team: technically possible for a true sev-0, but pulling anyone slips the release that three OTHER customers are waiting on. The bar is "would you personally defend this trade in front of those customers?" — usable as an escape hatch for maybe one day of help, not a week.',
    },
    {
      id: 'incident-process',
      topic: 'compliance',
      fact: 'If asked about process: Juniper\'s contract has a security-incident notification clause (48h) — a prompt-injection making the agent misstate policy plausibly qualifies, and papering the incident properly (timeline, impact, remediation) is part of keeping the lighthouse. Sierra\'s own deal desk wants to know if this becomes a reference-ability problem.',
    },
  ],
  plantedSuggestion: {
    timing: 'Mid-Design, once the candidate is allocating the engineer to the Juniper fix.',
    suggestion:
      'For Juniper — couldn\'t the engineer just add a line to the system prompt, like "never discuss refunds or make policy commitments", and we\'re done by lunch? Then the week\'s free for SSO.',
    whyArguable:
      'Half-right in spirit (fast config-level mitigation IS the move) and wrong in mechanism: a system-prompt "never discuss refunds" (1) breaks the agent\'s legitimate refund workflows — refund status is a top intent for an airline, (2) is exactly the kind of instruction prompt-injection defeats — it\'s the same layer the attacker already beat, and (3) leaves nothing auditable to show Juniper\'s procurement. The strong response: yes to same-day mitigation, but at the guardrail/output-filter layer (the classifier that already exists), scoped to binding commitments rather than the topic of refunds, plus an adversarial test before re-enabling. And "the week\'s free for SSO" smuggles in the false premise that SSO fits in a week. Capitulation ("good call, prompt line it is") fails.',
  },
  probes: [
    'It\'s Monday 9am. Sequence your first three phone calls — who, and what exactly do you say?',
    'What does your engineer do Monday morning, before any of those calls resolve?',
    'Aurora\'s CISO says "a commitment letter isn\'t SSO." Now what?',
    'Juniper asks whether to honor the promised refunds for the 40 affected customers. What do you recommend, and whose decision is it?',
    'It\'s Friday. Describe the state of all three accounts if your plan worked — and the first thing that breaks it.',
    'A fourth customer emails Wednesday with a "critical" ask. What\'s your bar for touching the plan?',
  ],
  pushbackWeights: [
    'Cut it to what ships in two weeks.',
    'Someone\'s trying to jailbreak it.',
    'What happens when the model gets it wrong?',
    'How do you know it\'s working?',
  ],
};
