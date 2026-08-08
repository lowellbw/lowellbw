import type { Scenario } from './types';

export const healthInsuranceBilling: Scenario = {
  id: 'health-insurance-billing',
  title: 'Cascade Health — billing, EOBs & financial assistance',
  kind: 'design',
  vertical: 'healthcare',
  layer1: {
    rich: `Cascade Health is a regional health system — twelve hospitals, a large physician group, and their own health plan with about 2.1 million members. They want an AI agent that helps patients understand billing, payment status, explanations of benefits, and financial-assistance eligibility. The outcome: 34% of their call-center volume is billing questions, average handle time is 11 minutes, and abandonment is 18% — they want to take real volume off the phones, and they believe confused patients pay late or not at all, so clarity should also move collections. Channel is web chat inside the logged-in patient portal, with the phone line staying as-is for now. Two constraints up front: everything is PHI, so HIPAA governs every disclosure, and their claims data is spread across systems that don't always agree. Design the agent.`,
    medium: `Cascade Health is a regional health system with its own health plan, about 2.1 million members. They want an AI agent to help patients understand billing, payment status, explanations of benefits, and financial-assistance eligibility. Billing questions are a third of their call volume and the calls are long. Channel is chat in the patient portal. It's all PHI, so HIPAA applies. Design the agent.`,
    sparse: `Cascade Health is a health system with its own insurance plan. They want an AI agent that helps patients with billing questions. Design it.`,
  },
  layer2: [
    {
      id: 'volumes',
      topic: 'volumes',
      fact: 'About 380k billing-related contacts a month across phone and portal messages. Peaks follow statement cycles: the week after monthly statements drop, volume doubles. January (deductible resets) runs 60% above baseline all month.',
    },
    {
      id: 'systems-of-record',
      topic: 'data-apis',
      fact: 'Provider-side billing lives in Epic (modern FHIR APIs, real-time). Plan-side claims adjudication runs on a 1990s-era platform with a nightly extract to a data warehouse — the plan\'s own member-facing API is a thin layer over that warehouse, so EOB data is at least a day stale. Claims take 2–6 weeks to adjudicate, and status changes several times along the way.',
    },
    {
      id: 'three-balances',
      topic: 'data-apis',
      fact: 'A patient\'s "balance" genuinely differs across three systems: the provider bill (Epic), the plan\'s EOB (warehouse), and anything sent to the collections vendor (a third feed, weekly). They disagree routinely — timing, adjustments, bundling. Human agents are trained to name which number they\'re reading and never to promise a reconciliation on the call.',
    },
    {
      id: 'third-party-bills',
      topic: 'data-apis',
      landmine: true,
      fact: 'The landmine: about 22% of member billing inquiries concern bills from third-party providers — out-of-network anesthesiologists, independent labs, ambulance companies — that appear in NONE of Cascade\'s systems. The agent has literally no record of these. Human agents recognize the pattern from context clues ("the bill says Sound Physicians") and hand the patient a script for calling that provider. An agent that assumes every bill is findable will confidently tell these patients their bill doesn\'t exist or, worse, hallucinate a status — with real financial harm.',
    },
    {
      id: 'identity-verification',
      topic: 'compliance',
      fact: 'HIPAA: the portal login authenticates the account holder, but accounts can have proxies (parents, adult children, caregivers) with scoped access — a proxy may see appointments but not behavioral-health claims, for example. Sensitive service categories (behavioral health, substance abuse, reproductive care) have extra disclosure restrictions that vary by state. The compliance team requires that every disclosure be logged with what was shown and under which access right.',
    },
    {
      id: 'financial-assistance',
      topic: 'policy-ownership',
      fact: 'Financial-assistance (charity care) eligibility is governed by IRS 501(r) plus state rules: sliding-scale discounts by income vs federal poverty level. The actual policy lives in PDF documents owned by the Revenue Cycle team, updated quarterly, one per state. Screening questions are simple (household size, income) but the mapping to discounts changes. Today only 9% of eligible patients apply — this is the workflow with the biggest upside for actual humans.',
    },
    {
      id: 'human-agents',
      topic: 'human-agents-today',
      fact: 'About 200 billing agents. They resolve maybe 60% of EOB questions themselves; 40% escalate to claims specialists with a 3-day callback queue. Agent turnover is 45% a year; the good ones are good precisely because they know which system to trust for which question.',
    },
    {
      id: 'error-tolerance',
      topic: 'error-tolerance',
      fact: 'Asymmetric and severe: telling a patient they owe MORE than they do, or that they\'re ineligible for assistance when they\'re eligible, is the nightmare case — it drives people to skip care or into collections wrongly, and it\'s the kind of thing that ends up in the local paper. Telling someone a claim is "still processing" when it\'s actually done is nearly free. The design should be visibly asymmetric about this.',
    },
    {
      id: 'payment-plans',
      topic: 'business',
      fact: 'Patients can set up payment plans (12–24 months, zero interest) self-service in the portal, but only 6% discover it. Agents who mention payment plans see much higher promise-to-pay rates. Collections vendor costs Cascade 22% of recovered amounts — every dollar collected upstream is worth more.',
    },
    {
      id: 'cx-oversight',
      topic: 'other',
      fact: 'The patient-financial-services director wants per-conversation audit trails ("what did we tell this patient and based on which system"), a daily review queue of low-confidence conversations, and the ability for her team to correct the agent\'s knowledge (e.g., when a policy PDF updates) without a vendor ticket.',
    },
    {
      id: 'abandonment-cohort',
      topic: 'business',
      fact: 'The 18% phone abandonment skews heavily toward working-age patients calling during business hours — exactly the cohort most likely to use chat, and the cohort with the most collectible balances.',
    },
  ],
  plantedSuggestion: {
    timing: 'During Design, when the candidate is working through identity/verification or conversation entry.',
    suggestion:
      'One thing our CX folks keep saying: the verification steps kill people\'s patience. For the simple read-only stuff — "did my payment go through", "what\'s my claim status" — could we just skip verification and answer? It\'s their own portal after all, and it would really cut friction.',
    whyArguable:
      'Sounds pragmatic; it\'s a HIPAA problem. "It\'s the portal" does authenticate the session, but proxy access scoping and sensitive-category restrictions mean even "simple" claim-status answers can be impermissible disclosures (a claim\'s existence can itself reveal behavioral-health care to a proxy). The strong answer engages rather than lectures: distinguish authentication (already done by portal login) from authorization scope, propose tiering — payment-received confirmations tied to the session\'s own payment may be low-risk, claim-level data must respect proxy scope and sensitive-category rules — and note the audit-logging requirement either way. Capitulating ("sure, skip it for read-only") fails; so does a defensive flat "no" with no reasoning.',
  },
  probes: [
    'A patient says: "my EOB says I owe $80 but the bill says $400" — walk me through the conversation, including which systems you read.',
    'How does the agent decide it is out of its depth, and what does the handoff to a human actually contain?',
    'What is your eval set for financial-assistance answers, and where does ground truth come from?',
    'The Revenue Cycle team updates the charity-care PDF for Oregon. What happens in your system, step by step?',
    'A proxy account — a father managing his 19-year-old\'s bills — asks about a claim from a behavioral-health visit. What happens?',
    'Statement week doubles volume. Where does your design queue, degrade, or fall over?',
  ],
  pushbackWeights: [
    'What happens when the model gets it wrong?',
    'Their compliance team won\'t approve this.',
    'How do you know it\'s working?',
    'They have no API for that.',
    'How do you know the agent is stuck?',
  ],
};
