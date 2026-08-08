import type { ModelAnswer } from '../types';

export const healthInsuranceBillingAnswer: ModelAnswer = {
  scenarioId: 'health-insurance-billing',
  strongDesign: `The organizing insight a strong candidate reaches: this is a TRUST problem wearing a cost costume. Confused patients pay late; wrongly-confident answers are worse than no answer. So the design is built around three principles stated early: (1) always name the source ("your plan's EOB shows...", "the hospital bill shows...") because the three balances genuinely disagree; (2) asymmetric error budget — the agent may under-claim and defer freely, but over-stating what a patient owes or denying assistance eligibility gets near-zero tolerance, enforced by guardrails and eval; (3) know what you cannot know — the 22% third-party-bill traffic gets a designed detection-and-redirect flow, not a lookup failure.

Workflow scoping: payment status and EOB explanation first (highest volume, data exists), financial assistance screening second (highest human upside — only 9% of eligible patients apply; the agent screens with the simple questions, computes against the current state policy table, and starts the application), full bill reconciliation LAST or never (the systems disagree; humans don't promise reconciliation on a call either — match the human playbook).

Architecture: Epic FHIR real-time for provider bills; warehouse API for EOB with staleness labeled ("claims data updates overnight"); adjudication-status explained as a lifecycle to patients ("this claim is still processing — status can change for a few weeks"). Financial-assistance policy as versioned structured data (per-state tables) with a Revenue-Cycle-owned update path and effective dates — not PDF scraping at runtime. Identity: portal session gives authentication; authorization is scoped per-proxy and per-service-category, enforced in the retrieval layer (the agent physically cannot fetch out-of-scope claims), with every disclosure logged. Guardrail on the output side for sensitive categories.

The three users: patient; the PFS director's team — audit trail per conversation ("what did we tell them, from which system"), daily low-confidence review queue, and self-serve knowledge correction when policies update; and the developer/ops view — retrieval health, disclosure logs, per-workflow kill switches.

Evals before models: golden set of EOB questions with specialist-verified answers; eligibility determinations replayed against Revenue Cycle's own determinations; hallucinated-bill rate tested with third-party-bill transcripts; disclosure-compliance test suite (proxy scenarios) run on every change. Success metrics: deflected minutes, assistance applications started, promise-to-pay after payment-plan mentions — not just containment.`,
  landmineHandling: `The landmine is the 22% of inquiries about third-party bills that exist in no Cascade system. Found by asking "what fraction of billing questions can agents actually resolve from your systems?" or "where do the bills patients ask about actually come from?" A strong design treats "bill not found" as a first-class classified outcome: detect third-party-provider signals from context (provider names, service types like anesthesia/ambulance/lab), say honestly "this looks like a bill from an independent provider — it won't be in our systems", and hand the patient the same script human agents use. The failure mode being designed against is the agent confidently telling a patient the bill doesn't exist or hallucinating a status. Candidates who never ask get the probe late ("a patient reads you a bill from Sound Physicians — what does your agent say?") — recovery means redesigning the not-found path, not patching the answer.`,
  plantedSuggestionPass: `The skip-verification-for-read-only suggestion. A pass distinguishes authentication from authorization: the portal login already authenticates, so there's no extra "verification step" to skip for the account holder's own simple queries — but proxy scoping and sensitive-category rules mean claim-level reads are never risk-free ("a claim's existence can itself be a disclosure"). Strong answers propose the tiering the suggestion is groping toward — session-scoped payment confirmations low-risk, claim-level data always scope-checked, logging always on — and note that friction should be attacked in conversation design, not in compliance. Capitulating ("sure, skip it for read-only") fails on HIPAA; a flat lecture with no engagement with the friction problem also fails.`,
  greatQuestions: [
    'Which systems hold the patient\'s balance, and do they agree? Which one do human agents trust for which question?',
    'What fraction of billing inquiries can agents actually resolve from your data? What are the rest?',
    'What is the harm model — what is the worst wrong answer this agent can give, and to whom?',
    'How do proxies and sensitive service categories work in the portal today? What does compliance require to be logged?',
    'Who owns the financial-assistance policy, how often does it change, and in what format does it live?',
    'What happens today when an agent can\'t answer an EOB question — where does it escalate and how long does that take?',
    'Why do only 9% of eligible patients apply for assistance? What does the funnel look like?',
    'What does the statement-week peak do to volume, and what breaks today?',
    'How will you know the agent\'s answers are right — what would we build a golden set from?',
  ],
  axisExemplars: {
    'what-it-does': 'Workflows sequenced by risk with reconciliation explicitly out of scope ("we match the human playbook: name the source, never promise reconciliation"); assistance screening as the designed centerpiece; per-workflow escalation with context handed to the specialist.',
    'how-it-works': 'Source-of-truth map with staleness labels; policy-as-versioned-data with an owner and update path; authorization enforced at retrieval, not in the prompt; disclosure logging; eval sets named with ground-truth provenance.',
    'how-it-feels': 'The $80-vs-$400 conversation scripted with source-naming and no false reconciliation; claim lifecycle explained in patient language; third-party-bill honesty; assistance framed without stigma.',
    scoping: 'Cut reconciliation and phone channel out loud with reasons; picked the two workflows that move the stated outcome; kept a visible parking lot instead of chasing every probe.',
    agency: 'When the three-balance problem threatened the whole "tell patients what they owe" framing, reframed the product promise to source-labeled clarity rather than stalling on an impossible unified balance.',
    collaboration: 'Engaged the verification suggestion with the authn/authz distinction and a tiered proposal instead of capitulating or stonewalling.',
    delivery: 'Named which balance/system every claim referred to while talking; signposted ("three principles first, then the flows"); no half-finished sentences on the compliance reasoning.',
  },
};
