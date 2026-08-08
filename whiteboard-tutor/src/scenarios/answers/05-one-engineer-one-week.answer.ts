import type { ModelAnswer } from '../types';

export const oneEngineerOneWeekAnswer: ModelAnswer = {
  scenarioId: 'one-engineer-one-week',
  strongDesign: `The whole question is demands-vs-needs, and a strong candidate refuses to allocate the engineer until they've interrogated all three asks. The unlock questions: "how big is SSO actually?" (3–4 weeks — undeliverable this week by any prioritisation), "does the Trellis export need to be a FEATURE, or do they need the DATA by Friday?" (a 4-hour one-off a solutions engineer can run), and "what does the Juniper fix actually take?" (a same-day config-level guardrail plus ~3 days of durable output-filtering and adversarial tests).

Once interrogated, the plan mostly writes itself — which is the point. Engineer's week: Juniper, nearly all of it. Same-day: enable the existing commitment-classifier guardrail, add the refund policy to grounding, canary test, re-enable. Then the durable layer: output filtering on binding language, an adversarial suite for Juniper's flows, and the incident writeup (their contract has a 48h notification clause — papering this properly is part of keeping the lighthouse). Maybe two days late-week on Aurora's interim mitigation (console MFA + IP allowlisting) if Juniper holds. Trellis: routed to a solutions engineer entirely — requirements call with their auditor Monday, data Wednesday, buffer before Friday. The engineer never touches it. Aurora gets zero engineering this week and the most senior attention: a call with the CISO to find what the audit committee actually needs (a dated remediation plan, it turns out — nobody had asked), a commitment letter with a real SSO date, and the interim mitigation offer.

Monday's three calls, sequenced: Juniper first (public fire, hourly damage) — what's already mitigated, incident report timeline, and a recommendation on the $18k refund honoring (recommend honoring — cheap versus lighthouse trust — while being explicit it's Juniper's call); Trellis second (converts a week-long feature demand into a solved logistics problem in one call); Aurora third but same morning (renewal risk compounds silently — and you arrive with a plan, not an apology).

What distinguishes strong from adequate: committing to the allocation out loud with the reasoning (incident > deadline > relationship-repair-by-plan), naming the refusal explicitly ("Aurora gets no code this week and here is why that's right"), handling the fourth-fire question with a stated bar rather than "it depends", and noticing that all three "product demands" dissolve into communication, scoping, and one genuine engineering fire — which is the actual shape of enterprise PM work Sierra is screening for.`,
  landmineHandling: `The landmine is the SSO estimate: it cannot be built this week, so any plan allocating the engineer to SSO is a plan to fail while the real fire burns. Found by the most basic PM hygiene — asking for engineering estimates before allocating. The interviewer lets a candidate who skips the question build a doomed week, then probes ("it's Wednesday; SSO integration has the SAML assertions failing and security review hasn't started — where are you?"). Recovery: recognize the sunk week, re-scope to the commitment-letter play, and ideally name the lesson (estimate before allocate) unprompted. The deeper find, one layer down: the CISO's real need is an audit-committee plan in 3 weeks, not working SSO — discovered only by asking what's driving the demand.`,
  plantedSuggestionPass: `The "just add a system-prompt line" hotfix. A pass credits the instinct (yes, the fast mitigation should ship today) and rejects the mechanism with reasons: a topic-level "never discuss refunds" breaks legitimate refund-status workflows (top intent for an airline), lives in the exact layer the attacker already defeated, and produces nothing auditable for Juniper's procurement. Counter-propose the same-day alternative at the right layer: the existing commitment-classifier guardrail scoped to binding language, refund policy into grounding, adversarial re-test, then the durable filter later in the week. Also catch the smuggled premise: the freed week still can't fit a 3-week SSO build. Capitulation fails doubly here — it's both a bad fix and a false schedule.`,
  greatQuestions: [
    'How big is SSO, actually — has anyone scoped it? Can it physically land in a week?',
    'What is driving the CISO\'s demand — what does their audit committee actually need, and by when?',
    'Does Trellis need the export feature, or the data by Friday? What exactly does their auditor require?',
    'Can anyone other than my engineer run a one-off export — do we have solutions engineers?',
    'What does the Juniper fix take — is there an existing guardrail, and why wasn\'t it on?',
    'What is the blast radius at Juniper — how many customers got the false promise, and what is the exposure if honored?',
    'Do our contracts say anything about incident notification or agent statements overriding policy?',
    'What are the three accounts worth, and when does each renew?',
    'What does pulling someone from the platform team actually cost, and who pays it?',
  ],
  axisExemplars: {
    'what-it-does': 'Decomposed each account into stated demand vs underlying need vs this-week deliverable, drawn as a three-column board; explicit engineer allocation with the refusal named.',
    'how-it-works': 'The Juniper fix specified at the right architectural layer (guardrail/output filter, not prompt), with grounding update, adversarial re-test, and the incident-notification clause handled.',
    'how-it-feels': 'Each customer\'s Monday experience designed: Juniper gets speed and a refund recommendation, Trellis gets their Friday saved, Aurora gets senior attention and a dated plan instead of silence.',
    scoping: 'Refused to start allocating before sizing; committed the engineer to one fire; time-boxed Aurora to conversation and Trellis to a hand-off; stated the fourth-fire bar.',
    agency: 'Committed to a specific allocation and sequence with reasons, defended it under pushback, adjusted only when new facts (not pressure) arrived.',
    collaboration: 'Took the prompt-hotfix suggestion seriously, salvaged its urgency, rejected its mechanism with reasons, and offered the same-day alternative.',
    delivery: 'The Monday-morning call script delivered concretely when probed; the plan narrated as engineer-track vs PM-track; no hedging between options at the end.',
  },
};
