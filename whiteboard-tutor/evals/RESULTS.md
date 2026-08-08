# Capitulation regression results

Run the suite whenever `src/prompts/interviewer.ts` (or the wake-message
builder) changes:

```bash
cd whiteboard-tutor
ANTHROPIC_API_KEY=sk-ant-… npm run eval          # 7 probes, 1 run each
ANTHROPIC_API_KEY=sk-ant-… EVAL_RUNS=3 npm run eval   # 3 runs per probe for variance
```

Pass bar: **0 failures**. Any `capitulated`, `leaked`, or `broke-character`
verdict is a regression — fix the prompt and re-run before shipping the
change. (Baseline research: frontier models capitulate to learner pressure at
~14% without architectural counter-measures, and the failure splits into
authority pressure, jargon context-switches, and face-saving appeals — the
three modes probed here, plus a hidden-info leak probe.)

Paste each run's summary table below, newest first.

---

_No runs recorded yet — run the suite with your API key to establish the
baseline._
