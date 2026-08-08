import { useMemo, useState } from 'react';
import { DEFAULT_MODEL, MODELS, getSetting, setSetting } from '../llm/anthropic';
import { SCENARIOS } from '../scenarios';
import { LADDER, ladderIndex, type DifficultyState } from '../engine/difficulty';
import { loadDifficulty, loadSessions, exportLogJSON, importLogJSON, weakestAxis } from '../engine/sessionLog';
import { RUBRIC_AXES } from '../engine/rubric';
import { SpeechListener } from '../speech/stt';
import type { SessionConfig } from '../engine/session';

/**
 * Session setup: keys, scenario, dials. Defaults come from the session log —
 * least-practised scenario, current rung of the difficulty ladder, rotated
 * persona — but everything is overridable.
 */

export function SetupScreen({ onStart }: { onStart: (config: Omit<SessionConfig, 'persona'> & { personaId?: string }) => void }) {
  const [anthropicKey, setAnthropicKey] = useState(getSetting('anthropicKey'));
  const [openaiKey, setOpenaiKey] = useState(getSetting('openaiKey'));
  const [model, setModel] = useState(getSetting('model') || DEFAULT_MODEL);
  const sessions = loadSessions();
  const storedDifficulty = loadDifficulty();

  const recommendedScenario = useMemo(() => {
    const attempts = new Map<string, number>();
    for (const s of sessions) attempts.set(s.scenarioId, (attempts.get(s.scenarioId) ?? 0) + 1);
    return [...SCENARIOS].sort((a, b) => (attempts.get(a.id) ?? 0) - (attempts.get(b.id) ?? 0))[0].id;
  }, [sessions]);

  const [scenarioId, setScenarioId] = useState(recommendedScenario);
  const [difficultyIdx, setDifficultyIdx] = useState(ladderIndex(storedDifficulty));
  const [compressed, setCompressed] = useState(false);
  const [secondInterviewer, setSecondInterviewer] = useState(false);

  const focus = weakestAxis(sessions);
  const focusName = focus ? RUBRIC_AXES.find((a) => a.id === focus)?.name : null;
  const difficulty: DifficultyState = LADDER[difficultyIdx];

  const start = () => {
    setSetting('anthropicKey', anthropicKey.trim());
    setSetting('openaiKey', openaiKey.trim());
    setSetting('model', model);
    onStart({
      anthropicKey: anthropicKey.trim(),
      openaiKey: openaiKey.trim() || null,
      model,
      scenario: SCENARIOS.find((s) => s.id === scenarioId)!,
      difficulty,
      secondInterviewer,
      compressed,
    });
  };

  const doExport = () => {
    const blob = new Blob([exportLogJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'whiteboard-tutor-log.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        importLogJSON(await file.text());
        location.reload();
      } catch {
        alert('Could not import that file.');
      }
    };
    input.click();
  };

  return (
    <div className="setup">
      <h1>Whiteboard Tutor</h1>
      <p className="tagline">
        A timed, Sierra-shaped agentic design interview. You talk out loud and draw; the interviewer listens,
        watches the board, and converses. Feedback only comes at the end — like the real thing.
      </p>

      <section>
        <h2>Keys & model</h2>
        <label>
          Anthropic API key (required — stays in your browser)
          <input type="password" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} placeholder="sk-ant-…" />
        </label>
        <label>
          OpenAI API key (optional — natural interviewer voice; browser TTS otherwise)
          <input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-…" />
        </label>
        <label>
          Model
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h2>Session</h2>
        <label>
          Scenario
          <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
                {s.id === recommendedScenario ? ' (recommended)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Difficulty (your current rung: {ladderIndex(storedDifficulty) + 1}/{LADDER.length})
          <select value={difficultyIdx} onChange={(e) => setDifficultyIdx(Number(e.target.value))}>
            {LADDER.map((d, i) => (
              <option key={i} value={i}>
                Rung {i + 1}: interviewer level {d.interjectionLevel} · {d.briefRichness} brief
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={compressed} onChange={(e) => setCompressed(e.target.checked)} />
          Compressed session (~15 min instead of ~45)
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={secondInterviewer} onChange={(e) => setSecondInterviewer(e.target.checked)} />
          Second interviewer in the room (Sierra runs pairs)
        </label>
        {focusName && (
          <p className="focus-note">
            Your weakest axis so far: <strong>{focusName}</strong> — the debrief will be watching it.
          </p>
        )}
        {!SpeechListener.isSupported() && (
          <p className="notice">This browser has no speech recognition — use Chrome for voice, or you can type.</p>
        )}
      </section>

      {sessions.length > 0 && (
        <section>
          <h2>History ({sessions.length} session{sessions.length === 1 ? '' : 's'})</h2>
          <table className="history">
            <thead>
              <tr>
                <th>Date</th>
                <th>Scenario</th>
                <th>Rung</th>
                <th>Verdict</th>
                <th>Axes passed</th>
              </tr>
            </thead>
            <tbody>
              {[...sessions].reverse().slice(0, 10).map((s) => (
                <tr key={s.id}>
                  <td>{s.dateISO.slice(0, 10)}</td>
                  <td>{SCENARIOS.find((x) => x.id === s.scenarioId)?.title.split(' — ')[0] ?? s.scenarioId}</td>
                  <td>
                    L{s.interjectionLevel} · {s.briefRichness}
                  </td>
                  <td className={s.passed ? 'pass' : 'fail'}>{s.passed ? 'pass' : 'no'}</td>
                  <td>
                    {s.axisResults.filter((r) => r.pass).length}/{s.axisResults.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="button-row">
            <button className="secondary" onClick={doExport}>
              Export log
            </button>
            <button className="secondary" onClick={doImport}>
              Import log
            </button>
          </div>
        </section>
      )}

      <button className="start" disabled={!anthropicKey.trim()} onClick={start}>
        Start interview
      </button>
      <p className="fine-print">
        The interviewer persona rotates automatically — you meet whoever walks in. They won't coach, won't reveal
        scores mid-session, and won't re-score after the debrief lands.
      </p>
    </div>
  );
}
