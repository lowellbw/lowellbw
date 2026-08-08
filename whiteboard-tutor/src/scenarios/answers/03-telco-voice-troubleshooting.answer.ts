import type { ModelAnswer } from '../types';

export const telcoVoiceTroubleshootingAnswer: ModelAnswer = {
  scenarioId: 'telco-voice-troubleshooting',
  strongDesign: `The load-bearing insight: telemetry inverts the whole interaction. The old bot asks the customer to be the sensor ("what color is the light?"); an agent with the telemetry API checks the line in the first ten seconds and TELLS the customer what it sees — which is faster, feels like competence, and sidesteps most of the LED-reading problem for 60% of the fleet. Strong designs open every call with: lookup account → pull telemetry → check outage signals, before the customer finishes describing the problem, and branch hard on telemetry-visible vs dark devices (dark devices get the guided-verbal path, with the SMS photo-assist as an opt-in).

Voice is designed as a first-class modality, not chat-with-audio: a stated latency budget per turn (~1s, with honest filler for lookups — "give me one second, I'm checking your line"), barge-in that actually stops the agent and re-plans, confirmation loops for anything ambiguous ("the box with the round cable from the wall — the modem"), one instruction at a time with verification, and an explicit non-account-holder path. Safety tripwire: downed line / sparks / smell → immediate priority human transfer, hard-coded, zero model discretion.

Outage handling is architected, not hoped for: the NOC feed is used but not trusted (15-min lag, undeclared node outages), so the system maintains its own call-clustering detector — a spike of similar symptoms from one area flips those calls into outage mode: acknowledge, inform, offer SMS status subscription, and stop per-device troubleshooting. This is also the 40x-surge answer: outage mode is the load-shedding design.

Truck-roll decisioning as an explicit policy: reboot/reseat verification first, telemetry-confirmed line faults dispatch straight away, ambiguous cases get the full diagnostic checklist — which the agent fills more completely than rushed humans, attacking the 32% no-fault-found rate from the data-quality side. Repeat callers are detected from history and treated differently by design: never repeat the same script, acknowledge the history, escalate faster (the 6x churn number makes under-dispatch the expensive error, so the tie-break leans toward the truck on repeat calls).

Three users: caller; support ops (recordings + transcripts into their QA tool, per-intent containment and repeat-call dashboards, per-workflow kill switch they can pull themselves); network ops (clustering signals as an outage-detection feed — the agent becomes a sensor for the NOC, a lovely two-way integration worth saying out loud). Evals: containment measured as no-repeat-call-in-7-days (their own repeat-call pathology makes naive containment a lie), truck-roll avoidance vs the no-fault-found rate as the balancing metric pair, latency and barge-in behavior in a voice-specific test harness, and a hated-bot regression suite: the top zero-out triggers replayed against the new agent.`,
  landmineHandling: `The landmine is outage blindness: the NOC feed lags 15 minutes and node-level outages often go undeclared, so a per-device troubleshooting agent will cheerfully walk a whole neighborhood through reboots during an outage. Found by asking "how does the agent know about outages?" or "what happens during a storm?" Strong handling: treat outage detection as the agent's own job (call clustering by geography + symptom), design an explicit outage mode, and treat the 40x surge as the same problem. Candidates who miss it get the storm probe — recovery means redesigning call-open logic (outage check before troubleshooting), not bolting an apology onto the existing flow.`,
  plantedSuggestionPass: `The move-it-all-to-web suggestion. A pass engages the real pain (voice IS hard) then defends the modality with the customer's reality: they called — many are older, not near a screen, or their internet (and the web page) is down; deflection-to-web is exactly the pattern that made them hate the IVR. Then salvage the good part: SMS assist as an optional enhancement (photos of cabling, link to status page) while the voice conversation remains able to complete the whole job — and telemetry means the agent rarely needs the customer to read lights anyway. Capitulating ("voice as a thin router to web") fails the brief; rejecting SMS assist outright without reasoning is the lesser fail.`,
  greatQuestions: [
    'What diagnostic data can you see remotely, and for what share of devices? Is there a telemetry API?',
    'How does the support side learn about outages today, and how fast? What happens to call volume during one?',
    'Why exactly do people hate the current bot — what does it do, and what are its containment and zero-out numbers?',
    'What makes a truck roll avoidable — what is the no-fault-found rate and what causes it?',
    'Which error is worse for the business: a wasted truck or a missed fault? What does the churn data say?',
    'Who is calling — how old is the base, are they near the equipment, are they the account holder?',
    'What do your best human agents do differently on these calls?',
    'What share of calls are repeats, and what happens to those callers today?',
    'What latency does a voice turn tolerate before it feels broken?',
  ],
  axisExemplars: {
    'what-it-does': 'Branching flow drawn for telemetry-visible vs dark devices; outage mode as a distinct state; explicit safety tripwire; truck-roll decision policy with the checklist as an artifact; repeat-caller path.',
    'how-it-works': 'Telemetry-first call-open sequence; own clustering detector layered over the laggy NOC feed; field-service API for scheduling; voice latency budget with filler strategy; the QA/kill-switch integration for ops.',
    'how-it-feels': '"Let me check your line" competence beats interrogation; one-instruction-at-a-time with confirmations; outage honesty instead of futile reboots; the third-call-this-week caller explicitly not re-scripted.',
    scoping: 'Scoped to troubleshooting + scheduling, kept billing/sales out; picked the telemetry-covered 60% as the v1 backbone and said what the dark-device experience is; deferred TV-box complexity if time got tight.',
    agency: 'When voice constraints kept breaking chat-shaped ideas, committed to redesigning around telemetry rather than polishing a doomed guided-script flow.',
    collaboration: 'Engaged the web-deflection suggestion, defended voice with the caller\'s reality, salvaged SMS-assist — reasoning, not compliance or defensiveness.',
    delivery: 'Spoke the actual 60-seconds-of-call script when probed instead of abstractions; signposted modality constraints before architecture; no half-thoughts during the latency discussion.',
  },
};
