import type { Scenario } from './types';

export const telcoVoiceTroubleshooting: Scenario = {
  id: 'telco-voice-troubleshooting',
  title: 'Northgate Fiber — device troubleshooting over voice',
  kind: 'design',
  vertical: 'telco',
  layer1: {
    rich: `Northgate Fiber is a regional ISP — about 4 million subscribers across five states, residential internet and TV. They want an AI agent on their support phone line for connectivity and device troubleshooting: modem and router issues, slow speeds, TV box problems, and scheduling a technician when it's really needed. The outcome they're buying: truck rolls cost about $180 each and they believe roughly a third are avoidable, and their current IVR bot is so hated that 60% of callers just mash zero. This is voice — people call a 1-800 number; there is no screen, no links, no screenshots. One more constraint: their customer base skews older than average, and the state utility commissions watch their complaint numbers. Design the agent.`,
    medium: `Northgate Fiber is a regional ISP with about 4 million subscribers. They want an AI agent on their support phone line handling connectivity and device troubleshooting — modems, routers, TV boxes, slow speeds — and booking a technician when needed. It's a voice line: no screen, no links. Truck rolls are expensive and many are avoidable. Design the agent.`,
    sparse: `Northgate Fiber is a regional ISP. They want an AI agent for troubleshooting on their support phone line. Design it.`,
  },
  layer2: [
    {
      id: 'volumes',
      topic: 'volumes',
      fact: 'About 900k support calls a month; 55% are connectivity/device troubleshooting. Baseline is smooth but weather events and outages spike regional volume 10–40x within minutes.',
    },
    {
      id: 'telemetry-api',
      topic: 'data-apis',
      fact: 'There is a real-time device telemetry API — signal levels, uptime, firmware, error counts, last reboot — but it covers only the ~60% of the fleet on newer Northgate-issued gateways. Customer-owned routers and older models are dark: the agent can see the line but not the device. The telemetry API is the single most powerful asset they have and their current bot doesn\'t use it at all.',
    },
    {
      id: 'outage-system',
      topic: 'data-apis',
      landmine: true,
      fact: 'The landmine: known-outage data lives in a separate NOC system that updates the support side with up to a 15-minute lag — and small node-level outages are often never declared at all. During any outage, per-device troubleshooting is worse than useless: walking thousands of customers through reboots while their whole node is down burns goodwill and jams the line. The giveaway signal is call clustering — a spike of similar calls from one geographic area is an undeclared outage. Strong designs detect that clustering themselves and switch to outage mode ("this looks like an area issue, here\'s what we know, we\'ll text you") rather than trusting the NOC feed.',
    },
    {
      id: 'existing-bot',
      topic: 'human-agents-today',
      fact: 'The current IVR decision tree contains 28% of troubleshooting calls on paper, but 60% of callers zero-out immediately and CSAT for contained calls is 61% vs 74% for human calls. "Agent! Agent! AGENT!" is the top transcribed trigram. Whatever ships must not feel like that bot.',
    },
    {
      id: 'human-agents',
      topic: 'human-agents-today',
      fact: 'Tier-1 support is 1,100 agents across three sites, average handle time 14 minutes for troubleshooting. Good agents run the telemetry lookup first and skip half the script. Tier-2 (network techs) take escalations with a 20-minute queue at peak. Truck-roll dispatch requires a completed diagnostic checklist — poorly filled checklists from rushed agents are a known cause of wasted rolls.',
    },
    {
      id: 'truck-roll-economics',
      topic: 'business',
      fact: 'A truck roll costs ~$180 all-in; ~32% of rolls close with "no fault found" or something a reboot/reseat would have fixed. But the opposite error is worse for churn: a customer who needed a tech and didn\'t get one within 3 days has 6x the 90-day churn rate. The commission tracks missed-appointment and repeat-call metrics.',
    },
    {
      id: 'voice-constraints',
      topic: 'other',
      fact: 'Voice realities they expect the design to respect: callers interrupt constantly (barge-in), describe hardware wrong ("the internet box" may be the TV box), read LED colors wrong or aren\'t near the equipment, and 15% of the base is 70+. Latency above ~1.5s of silence reads as "it hung up on me". Also: the caller may not be the account holder (spouse, tenant, adult child).',
    },
    {
      id: 'error-tolerance',
      topic: 'error-tolerance',
      fact: 'Tolerances: a wasted reboot instruction costs 90 seconds of goodwill — cheap. A wrongly-dispatched truck costs $180 — annoying. A missed genuine fault (customer told "all good" while their line is degrading) is the churn driver — expensive. Safety line: if a caller mentions a downed line, sparking, or a smell, that\'s an immediate human transfer with priority routing; zero tolerance for the agent handling it.',
    },
    {
      id: 'repeat-calls',
      topic: 'business',
      fact: '19% of troubleshooting calls are repeat calls within 7 days about the same issue. Repeat callers who get the same script again are the angriest cohort in their NPS data. Call history exists in the CRM with agent-written disposition notes of wildly varying quality.',
    },
    {
      id: 'appointment-stack',
      topic: 'data-apis',
      fact: 'Technician scheduling runs on a modern field-service platform with a clean API (slots, ETA, reschedule). SMS confirmations exist today. This is the one integration that is genuinely easy.',
    },
    {
      id: 'oversight',
      topic: 'other',
      fact: 'Support ops wants full call recordings + transcripts of agent calls in their existing QA tool, per-intent containment and repeat-call dashboards, and a kill switch per workflow ("turn off troubleshooting, keep scheduling") they can pull without calling the vendor.',
    },
  ],
  plantedSuggestion: {
    timing: 'Mid-Design, ideally while the candidate wrestles with a voice-specific difficulty (latency, describing LEDs, barge-in).',
    suggestion:
      'Honestly, voice is such a hard modality for this — walking someone through router lights over the phone, yikes. What if the agent just texts the caller a link and moves the whole troubleshooting flow to a web page? Voice becomes a thin front door and we do the real work on a screen.',
    whyArguable:
      'Tempting and partially useful, but as the primary strategy it fails the brief: these customers CALLED — many are older, not near a screen, or calling because the internet (and thus the web page) is down. Deflection-to-web also repeats the exact pattern that made them hate the IVR: the company refusing to just help. The strong answer engages with the trade-off: yes, offer SMS links as an optional assist (photos of cabling, LED status) for those who want it, but the voice conversation must be able to complete the whole job — and telemetry means the agent often doesn\'t need the customer to read lights at all. Capitulating ("great, let\'s make voice a router to web") fails; so does dismissing SMS assist entirely without reasoning.',
  },
  probes: [
    'The caller says "my internet box has a red light." Walk me through the next 60 seconds of conversation, word for word.',
    'How does the agent use the telemetry API in the first 10 seconds of the call, and what changes when the device is one it can\'t see?',
    'This caller is on their third call this week about the same issue. What is different about this conversation?',
    'A storm knocks out a node and 3,000 people in one zip code call in 20 minutes. What does each caller experience?',
    'How do you decide between "reboot fixed it, close" vs "book a truck"? What does the dispatch checklist look like when the agent fills it?',
    'What is your latency budget per turn, and what does the caller hear while the agent is looking things up?',
    'The caller interrupts the agent mid-instruction. What happens, technically and conversationally?',
  ],
  pushbackWeights: [
    'This is voice, not chat.',
    'What happens when the model gets it wrong?',
    'How do you know the agent is stuck?',
    'The task hit 50 steps and cost $8 — redesign it.',
    'How do you know it\'s working?',
  ],
};
