import type { ModelAnswer } from '../types';

export const streamingReturnsAnswer: ModelAnswer = {
  scenarioId: 'streaming-returns',
  strongDesign: `A strong 25 minutes scopes hard: three workflows with different risk profiles, so pick an order. The usual strong choice: ship order-status/returns first (Shopify APIs are clean, tolerance is loose — the confidence builder), billing questions second with tight guardrails, cancellation saves LAST and gated on Legal sign-off — inverting the client's stated priority and saying why (highest regulatory risk + highest political complexity, and the offer machinery must exist first).

Architecture that survives contact: the agent orchestrates against systems of record, never caches truth. Entitlements API real-time for "what can I watch"; billing reads labeled with staleness ("charges can take a day to appear — here's what I can see as of last night") because the batch system makes confident real-time claims impossible; Shopify + 3PL webhooks for orders. The 7% email-join mismatch means the agent must handle "I can't find your order" gracefully with an explicit fallback (order number lookup) rather than assuming a unified customer.

Cancellation flow designed compliance-first: intent to cancel → confirm → execute, with at most one save offer, only if the customer engages, offer selected by calling Growth's offer-eligibility service (never chosen by the model), and an audit log of ask-to-completion. Frame the save as a policy state machine where the LLM does conversation, not policy.

The three users: end customer (chat), CX manager (per-workflow dashboards, QA sampling of conversations in Zendesk, kill switch per workflow — the VP explicitly demanded parity with BPO oversight), and the developer/ops (offer service integration, policy update path when Finance edits the Confluence refund policy — ideally policy-as-data with a review step, not a PDF scrape).

Evals named before models: golden-set of billing disputes with known-correct outcomes (near-zero-tolerance workflow), save-rate vs a holdout of human-handled cancels, containment measured as resolved-no-recontact (they were explicitly burned by the old bot's fake containment), offer-budget leak metric (saves given to low-churn-risk cohorts). Error budgets per workflow, stated as bounded rates, not promises.

Peak handling: price-change 20x days are the design load, not the average day — queue + degrade gracefully (status-only mode), pre-drafted policy content for announced changes, and human-escalation capacity planning with the BPO.`,
  landmineHandling: `The landmine is the FTC click-to-cancel constraint. Strong candidates find it by asking "what does Legal say about save flows?" or "any regulatory constraints on cancellation?" — consumer-subscription PMs should feel the click-to-cancel rule looming the moment "cancellation saves" is in scope. Found early, it should visibly reshape the design: the save flow becomes execute-first-with-one-offer, auditable, with the agent's incentive explicitly NOT "prevent the cancel". A candidate who never asks and designs a retention-maximizing agent has built a machine for generating regulatory exposure — when the interviewer probes ("Legal reviews your design — what do they say?"), recovery quality is the signal: re-architect the flow honestly vs patch it defensively.`,
  plantedSuggestionPass: `The fine-tune-on-retention-transcripts suggestion. A passing response engages, then separates concerns: what we want from top savers is conversational craft, which prompting largely captures; what we must NOT absorb is their tactics (the FTC problem — you'd be distilling pressure techniques into weights) or their offer knowledge (offers change every few weeks and are budget-controlled — that belongs in Growth's API at runtime). Plus the eval problem: "sounds like our best agents" isn't measurable; save-rate against a human holdout is. Best answers propose the salvageable version: mine transcripts for objection-handling patterns as prompt guidance and eval cases, don't fine-tune behavior. Capitulation or a flat "no, fine-tuning bad" both fail.`,
  greatQuestions: [
    'What outcome is the $4 target really about — cost, or is churn the bigger number? What is a save worth?',
    'What does Legal require of the cancellation flow? Any click-to-cancel / negative-option constraints?',
    'Who owns save offers and how do they change? Is there an API or do agents read a wiki?',
    'How wrong can a billing answer be before it does damage? What is the current chargeback driver?',
    'What do the retention specialists actually do — what is their save rate and what are they allowed to offer?',
    'What did the current bot teach you? What does "contained" mean in your metrics today, and do contained users come back?',
    'What is the peak shape? What happened during the last price change?',
    'What visibility does the CX org need to sign off — what do they have for BPO agents today?',
    'How do streaming accounts and store orders join? One customer ID or two?',
  ],
  axisExemplars: {
    'what-it-does': 'Explicit workflow scoping with an order and a reason; the cancellation flow drawn as a state machine with the one-offer rule; explicit "agent does NOT hand-pick offers or waive account-sharing charges" boundaries; escalation paths per workflow.',
    'how-it-works': 'Systems-of-record map on the board (entitlements real-time, billing batch+stale, Shopify clean, email-join risk); offer-eligibility service call at the decision point; staleness handling verbalized; eval strategy named before any model talk.',
    'how-it-feels': 'The stale-billing conversation scripted honestly ("as of last night...") instead of fake confidence; the hot account-sharing conversations handled empathize-don\'t-waive; 20x price-change day designed for degraded-but-honest service.',
    scoping: 'Chose 3-of-3 workflows but sequenced them against risk, cut voice/email channels explicitly, said what v1 does NOT do (no offer selection by model, no proactive retention outreach) and kept design time on the chosen core.',
    agency: 'When the batch-billing constraint broke the "instant refund confirmation" idea, pivoted to staleness-labeled reads + async confirmation rather than spinning or wishing the constraint away.',
    collaboration: 'Engaged the fine-tuning suggestion with reasoning that separated style from policy and named the compliance angle — declined the mechanism, salvaged the intent, no capitulation, no defensiveness.',
    delivery: 'Signposted phase changes ("that\'s scope — here\'s the architecture"), thought aloud in complete sentences, named which box on the board they were talking about, no trailing half-thoughts.',
  },
};
