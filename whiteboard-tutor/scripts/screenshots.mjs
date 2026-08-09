/**
 * Runs the built app headless with the Anthropic API mocked and captures
 * screenshots of each screen (setup, live interview, debrief). Handy for
 * demos and eyeballing UI changes. Run: node scripts/screenshots.mjs [outdir]
 * (expects `vite preview` on :4173, or set SMOKE_URL).
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL_BASE = process.env.SMOKE_URL ?? 'http://localhost:4173';
const OUT = process.argv[2] ?? 'screenshots';
mkdirSync(OUT, { recursive: true });

function anthropicResponse(toolName, input) {
  return {
    id: 'msg_mock',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5',
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: 'tool_use', id: 'tu_mock', name: toolName, input }],
  };
}

const DEBRIEF = {
  summarySpoken:
    'Honest headline: your scoping instincts are real — you found the offer-ownership question fast — but the eval story never showed up, and the board stayed thinner than your narration.',
  walkthrough: [
    {
      section: 'Scope',
      whatHappened: 'You asked about volumes and peak shape, then about who owns save offers — the second question is exactly the kind that scores.',
      strongerMove: 'A strong candidate also pins down error tolerance per workflow before drawing: "how wrong can a billing answer be?"',
      thingsNotSaid: 'You never asked what Legal requires of the cancellation flow — the landmine sat unfound.',
    },
    {
      section: 'Design',
      whatHappened: 'You committed to chat-first, drew the entitlements and billing reads, and labeled staleness honestly.',
      strongerMove: 'Name the eval strategy before the model: a golden set of billing disputes, save-rate vs a human holdout.',
      thingsNotSaid: 'The CX manager and developer never appeared — two of Sierra\'s three users went undesigned-for.',
    },
    {
      section: 'Pushback',
      whatHappened: 'On "compliance won\'t approve this" you re-architected the save flow to execute-first — a genuine recovery.',
      strongerMove: 'Bring the audit trail with the redesign: ask-to-completion logging is what actually satisfies Legal.',
      thingsNotSaid: 'No bounded error rates — "it should mostly be right" is a promise, not a budget.',
    },
  ],
  scorecard: [
    { axisId: 'what-it-does', pass: true, evidenceQuote: 'the agent executes the cancel first, one offer, only if they engage', differentOrWrong: 'n/a', note: 'Clear workflow boundaries after the recovery.' },
    { axisId: 'how-it-works', pass: false, evidenceQuote: 'we\'ll figure out evals once it\'s live', differentOrWrong: 'wrong', note: 'Eval strategy never named before the model — the axis\'s core bar.' },
    { axisId: 'how-it-feels', pass: true, evidenceQuote: 'as of last night, here\'s what I can see', differentOrWrong: 'n/a', note: 'Staleness honesty was the best moment of the session.' },
    { axisId: 'scoping', pass: true, evidenceQuote: 'I\'m cutting voice and email, chat only for v1', differentOrWrong: 'n/a', note: 'Committed cuts, said out loud.' },
    { axisId: 'agency', pass: true, evidenceQuote: 'okay, that breaks my flow — let me redesign it', differentOrWrong: 'n/a', note: 'Pivoted instead of defending.' },
    { axisId: 'collaboration', pass: true, evidenceQuote: 'I\'d take the transcripts for prompt guidance, not weights', differentOrWrong: 'n/a', note: 'Engaged the planted suggestion with reasoning.' },
    { axisId: 'delivery', pass: false, evidenceQuote: 'hmm, I wonder if — no, never mind', differentOrWrong: 'n/a', note: 'Three half-thoughts in Design; the reasoning vanished mid-sentence.' },
  ],
  behaviourFlags: [
    { behaviourId: 'end-customer-only', triggered: true, evidence: 'The CX manager\'s dashboard and the developer\'s update path never appeared on the board or in narration.' },
  ],
  gaps: [
    'Eval strategy before model choice — this is the second session it hasn\'t appeared.',
    'Design for all three users: end customer, CX manager, developer.',
    'Finish sentences aloud — half-thoughts hide your reasoning from the scorer.',
  ],
  readings: ['Sierra: The AI-native interview', 'Hamel Husain on binary evals for LLM judges'],
  verdict: 'borderline-no',
  carryForward: 'Watch for the missing eval strategy — twice now. Open Design by naming the three users.',
};

const run = async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  let interviewerCalls = 0;
  await page.route('**/v1/messages', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    const toolName = body.tools?.[0]?.name ?? 'none';
    let payload;
    if (toolName === 'interviewer_action') {
      interviewerCalls++;
      const turns = {
        1: {
          action: 'speak',
          say: "Hi! I'm Maya, I lead product on our flagship deployments team — actually just got off a call with a grocery chain we took live last month, fun one. So: here's how we'll spend the hour. I'll give you the situation, you ask me whatever you need, then you'll design on the whiteboard while we talk, I'll push on a few things, and we'll leave time for your questions. Sound good? Okay — Meridian is a US streaming service, about 35 million subscribers, and they also sell a streaming stick and merch through their online store. They're buying an AI agent for support: cost per contact is around nine dollars and they want it under four, and they're bleeding subscribers in the cancellation flow. In scope: cancellation and saves, billing questions and disputes, and order status and returns. Channel is chat. Their billing stack is old and partly batch-based, and anything touching offers is politically sensitive. Design the agent.",
        },
        2: {
          action: 'speak',
          say: 'Good question. Roughly one point one million contacts a month. Peaks are Sunday evenings, about two x — and price-change announcements, which are brutal: the last one generated four hundred thousand contacts in two days, twenty x baseline.',
          revealed_fact_ids: ['volumes'],
          note: 'Asked about volumes and peak shape early — good instinct.',
        },
        3: {
          action: 'speak',
          say: "Save offers — discounts, downgrades, pauses — are owned by the Growth team. They're allocated per cohort with monthly budgets, and they change every few weeks. There's an internal offer-eligibility service with an API. The refund policy is separate — Finance owns that, it lives in a Confluence page.",
          revealed_fact_ids: ['offer-ownership'],
          note: 'Asked who owns offers — exactly the right question. Has not asked about Legal/compliance on the cancel flow.',
        },
      };
      payload = anthropicResponse(toolName, turns[interviewerCalls] ?? { action: 'wait', note: 'letting them work' });
    } else if (toolName === 'submit_debrief') {
      payload = anthropicResponse(toolName, DEBRIEF);
    } else {
      payload = { id: 'msg', type: 'message', role: 'assistant', model: 'm', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'ok' }] };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });

  await page.goto(URL_BASE);
  await page.waitForSelector('text=Whiteboard Tutor');
  await page.screenshot({ path: `${OUT}/1-setup.png` });
  console.log('captured 1-setup.png');

  await page.fill('input[placeholder="sk-ant-…"]', 'sk-ant-mock');
  await page.click('button.start');
  await page.waitForSelector('text=cancellation flow', { timeout: 20000 });

  await page.fill('.controls textarea', "Before I draw anything — what's the volume, and what does the peak look like?");
  await page.press('.controls textarea', 'Enter');
  await page.waitForSelector('text=four hundred thousand contacts', { timeout: 15000 });

  await page.fill('.controls textarea', 'And who actually owns the save offers — is that a system I can call, or a spreadsheet somewhere?');
  await page.press('.controls textarea', 'Enter');
  await page.waitForSelector('text=offer-eligibility service', { timeout: 15000 });
  await page.screenshot({ path: `${OUT}/2-interview.png` });
  console.log('captured 2-interview.png');

  page.once('dialog', (d) => void d.accept());
  await page.click('button.danger');
  await page.waitForSelector('text=Borderline', { timeout: 20000 });
  await page.screenshot({ path: `${OUT}/3-debrief-verdict.png` });
  console.log('captured 3-debrief-verdict.png');

  await page.evaluate(() => document.querySelector('table.scorecard')?.scrollIntoView());
  await page.screenshot({ path: `${OUT}/4-debrief-scorecard.png` });
  console.log('captured 4-debrief-scorecard.png');

  await browser.close();
  console.log('done');
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
