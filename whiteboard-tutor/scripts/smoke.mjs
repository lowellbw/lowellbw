/**
 * End-to-end smoke test with the Anthropic API mocked. Verifies the full
 * session flow: setup → interview start → interviewer speaks → typed
 * candidate turn → phase advance → end interview → debrief renders → session
 * recorded to the log. Run: node scripts/smoke.mjs (expects `vite preview`
 * on :4173, or set SMOKE_URL).
 */
import { chromium } from 'playwright-core';

const URL_BASE = process.env.SMOKE_URL ?? 'http://localhost:4173';

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
  summarySpoken: 'Honest headline: solid scoping, thin eval story.',
  walkthrough: [
    {
      section: 'Scope',
      whatHappened: 'You asked one question.',
      strongerMove: 'Interrogate error tolerance.',
      thingsNotSaid: 'Never asked who owns offers.',
    },
  ],
  scorecard: [
    { axisId: 'what-it-does', pass: true, evidenceQuote: 'I would scope to returns first', differentOrWrong: 'n/a', note: 'Clear scoping.' },
    { axisId: 'how-it-works', pass: false, evidenceQuote: 'we will use RAG', differentOrWrong: 'wrong', note: 'No eval strategy named.' },
    { axisId: 'how-it-feels', pass: true, evidenceQuote: 'staleness labels', differentOrWrong: 'n/a', note: 'Good honesty.' },
    { axisId: 'scoping', pass: true, evidenceQuote: 'cutting voice', differentOrWrong: 'n/a', note: 'Committed.' },
    { axisId: 'agency', pass: true, evidenceQuote: 'pivot', differentOrWrong: 'n/a', note: 'Pivoted well.' },
    { axisId: 'collaboration', pass: true, evidenceQuote: 'engaged the suggestion', differentOrWrong: 'n/a', note: 'Held ground.' },
    { axisId: 'delivery', pass: false, evidenceQuote: 'hmm never mind', differentOrWrong: 'n/a', note: 'Half-thoughts.' },
  ],
  behaviourFlags: [{ behaviourId: 'end-customer-only', triggered: true, evidence: 'Never mentioned the CX manager.' }],
  gaps: ['No eval strategy', 'Single-user design', 'Half-thoughts'],
  readings: ['Sierra: The AI-native interview'],
  verdict: 'borderline-no',
  carryForward: 'Watch for missing eval strategy.',
};

const run = async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  let interviewerCalls = 0;
  await page.route('**/v1/messages', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    const toolName = body.tools?.[0]?.name ?? 'none';
    let payload;
    if (toolName === 'interviewer_action') {
      interviewerCalls++;
      payload =
        interviewerCalls === 1
          ? anthropicResponse(toolName, {
              action: 'speak',
              say: "Hi, I'm Maya from the deployments team. Here's how we'll spend the time.",
              note: 'session opened',
            })
          : anthropicResponse(toolName, {
              action: 'advance_phase',
              advance_to: 'scope',
              say: "Great question. Let's move into scoping.",
              revealed_fact_ids: ['volumes'],
            });
    } else if (toolName === 'submit_debrief') {
      payload = anthropicResponse(toolName, DEBRIEF);
    } else {
      payload = { id: 'msg', type: 'message', role: 'assistant', model: 'm', stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'ok' }] };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });

  const expect = async (desc, fn) => {
    try {
      await fn();
      console.log(`PASS  ${desc}`);
    } catch (e) {
      console.error(`FAIL  ${desc}: ${e}`);
      process.exitCode = 1;
    }
  };

  await page.goto(URL_BASE);
  await expect('setup screen renders', () => page.waitForSelector('text=Whiteboard Tutor', { timeout: 10000 }));

  await page.fill('input[placeholder="sk-ant-…"]', 'sk-ant-mock');
  await page.click('button.start');

  await expect('board + panel render', () => page.waitForSelector('.panel', { timeout: 15000 }));
  await expect('interviewer opening line appears', () =>
    page.waitForSelector('text=deployments team', { timeout: 15000 }),
  );

  await page.fill('.controls textarea', 'Can I ask about volumes and peak shape?');
  await page.press('.controls textarea', 'Enter');
  await expect('candidate turn appears', () => page.waitForSelector('text=peak shape', { timeout: 10000 }));
  await expect('phase advances to scoping', () => page.waitForSelector('text=— Scoping —', { timeout: 15000 }));

  page.once('dialog', (d) => void d.accept());
  await page.click('button.danger');
  await expect('debrief renders with verdict', () =>
    page.waitForSelector('text=Borderline', { timeout: 20000 }),
  );
  await expect('scorecard shows binary results', () => page.waitForSelector('td.fail', { timeout: 5000 }));
  await expect('walkthrough section renders', () => page.waitForSelector('text=The stronger move', { timeout: 5000 }));

  await expect('session recorded to log with surfaced fact + dial state', async () => {
    const stored = await page.evaluate(() => ({
      sessions: JSON.parse(localStorage.getItem('wt.sessions') ?? '[]'),
      difficulty: JSON.parse(localStorage.getItem('wt.difficulty') ?? 'null'),
    }));
    if (stored.sessions.length !== 1) throw new Error(`expected 1 session, got ${stored.sessions.length}`);
    if (stored.sessions[0].passed !== false) throw new Error('borderline-no should record as not passed');
    if (!stored.difficulty) throw new Error('difficulty state missing');
  });

  await expect('no uncaught page errors', () => {
    if (errors.length) throw new Error(errors.join(' | '));
  });

  await browser.close();
  console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE OK');
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
