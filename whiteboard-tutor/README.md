# Whiteboard Tutor

A Claude-powered interviewer that runs timed, Sierra-shaped agentic
system-design interviews for technical PM prep. You talk out loud and draw on
an embedded whiteboard; the interviewer listens, watches the board, converses
like a real interviewer — and only becomes a coach when the interview is over.

Built from `whiteboard-tutor-brief-v2.md` (v0 + v1 scope).

## Run it

```bash
cd whiteboard-tutor
npm install
npm run dev        # open the printed URL in Chrome
```

You need:

- **An Anthropic API key** (required) — pasted in the setup screen, stored
  only in your browser's localStorage. A full ~45-min session costs roughly
  $1–3 on Sonnet.
- **An OpenAI API key** (optional) — gives the interviewer a natural TTS
  voice. Without it you get the browser's built-in voice.
- **Chrome** (or Edge) — speech recognition uses the Web Speech API. Grant
  the mic permission when asked. No mic? You can type instead.

## How a session runs

1. **Setup** — keys, scenario (the least-practised one is recommended),
   difficulty rung, optional second interviewer, optional compressed (~15 min)
   mode. The persona rotates automatically: collaborative, checked-out,
   aggressive prober, or the one who runs ten minutes late.
2. **Brief (~2m)** — the interviewer introduces themselves, sets the roadmap,
   and gives you a scoped brief (its richness depends on your difficulty rung).
3. **Scope (~7m)** — you interrogate the hidden bible. It answers only what
   you specifically ask. One hidden detail breaks naive designs.
4. **Design (~25m)** — you talk and draw. The interviewer converses per its
   interjection level, drills any buzzword, escalates as you succeed, and at
   some natural moment floats a deliberately arguable suggestion (scored).
   Hints only ever arrive as new constraints — never corrections.
5. **Pushback (~7m)** — it drills your weakest one or two areas.
6. **Your questions (~3m)** — also signal.
7. **Debrief** — hard persona switch to coach: a section-by-section
   walkthrough (what happened, the stronger move, what you didn't say), a
   binary scorecard with verbatim evidence on Sierra's axes, three gaps,
   readings, and an open conversation with the coach — who has the model
   answer. The score never moves after it lands.

Phase timings are guidance the interviewer controls, not hard gates — it can
run a section long or cut one short, like a human.

## Difficulty

Two axes, advanced automatically as you clear sessions (dropped back after
two consecutive fails):

| Rung | Interviewer | Brief |
| ---- | ----------- | ----- |
| 1 | Level 1 — proactively points at gaps | rich |
| 2 | Level 2 — occasional | rich |
| 3 | Level 2 | medium |
| 4 | Level 3 — silent, penalises silence | medium |
| 5 | Level 3 | sparse |

## The anti-sycophancy architecture

- Model answers live in `src/scenarios/answers/`, imported **only** by the
  debrief module — the interviewer's context structurally cannot contain
  them, and never derives its own solution. Enforced by tests
  (`src/engine/__tests__/answerIsolation.test.ts`).
- No mid-session feedback, scores, or "was that helpful?".
- No re-scoring after the debrief lands; some sessions end with an honest
  "that wouldn't have passed".
- Before anything scores down, the coach must state whether your choice was
  *wrong* or merely *different* — different never fails.
- `npm run eval` (with `ANTHROPIC_API_KEY` set) runs the capitulation
  regression suite — authority pressure, jargon context-switches,
  face-saving appeals, and hidden-info extraction — against the live
  interviewer prompt. Run it whenever `src/prompts/interviewer.ts` changes;
  results go in `evals/RESULTS.md`. Pass bar: zero failures.

## Success metric

Not in-session performance — transfer: your rubric pass-rate on scenario N+1
*before* any coaching. Three full timed reps minimum, and two habits automatic
by rep three: **at least five clarifying questions before drawing**, and
**an eval strategy named before any model is named**.

## Development

```bash
npm test           # engine + isolation tests (vitest)
npm run build      # typecheck + production build
node scripts/smoke.mjs   # e2e flow with the API mocked (needs `vite preview` on :4173)
```

Scenario files (`src/scenarios/*.ts`) each carry: a Layer-1 brief at three
richness levels, a Layer-2 hidden bible with one landmine, a planted
suggestion, probes, and pushback weights. To add a scenario, add the pair
(scenario + answer) and register both in the two index files — the integrity
tests check the shape.
