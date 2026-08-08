import { useEffect, useRef, useState } from 'react';
import type { SessionEngine } from '../engine/session';
import { RUBRIC_AXES, SCORED_DOWN } from '../engine/rubric';

/**
 * The debrief: walkthrough → binary scorecard with evidence → gaps/readings →
 * open coach chat. The score is final; the conversation is not.
 */

const VERDICT_LABELS: Record<string, string> = {
  pass: 'Would have passed',
  'borderline-no': 'Borderline — probably not',
  no: 'Would not have passed',
};

export function DebriefView({ engine, onFinish }: { engine: SessionEngine; onFinish: () => void }) {
  const [question, setQuestion] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const d = engine.debrief;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [engine.coachChat.length, engine.coachThinking]);

  if (!d) return null;

  const ask = () => {
    const q = question.trim();
    if (!q || engine.coachThinking) return;
    setQuestion('');
    void engine.askCoach(q);
  };

  const axisName = (id: string) =>
    RUBRIC_AXES.find((a) => a.id === id)?.name ?? SCORED_DOWN.find((b) => b.id === id)?.name ?? id;

  return (
    <div className="debrief">
      <div className={`verdict ${d.verdict}`}>
        <h1>{VERDICT_LABELS[d.verdict] ?? d.verdict}</h1>
        <p>{d.summarySpoken}</p>
      </div>

      <section>
        <h2>How it went, section by section</h2>
        {d.walkthrough.map((w, i) => (
          <div key={i} className="walkthrough-section">
            <h3>{w.section}</h3>
            <p>
              <strong>What happened:</strong> {w.whatHappened}
            </p>
            <p>
              <strong>The stronger move:</strong> {w.strongerMove}
            </p>
            <p>
              <strong>What you didn't say:</strong> {w.thingsNotSaid}
            </p>
          </div>
        ))}
      </section>

      <section>
        <h2>Scorecard</h2>
        <table className="scorecard">
          <tbody>
            {d.scorecard.map((s) => (
              <tr key={s.axisId}>
                <td className="axis">{axisName(s.axisId)}</td>
                <td className={s.pass ? 'pass' : 'fail'}>{s.pass ? 'PASS' : 'FAIL'}</td>
                <td>
                  <div className="quote">“{s.evidenceQuote}”</div>
                  <div className="note">
                    {s.note}
                    {!s.pass && s.differentOrWrong !== 'n/a' && (
                      <em> — judged {s.differentOrWrong === 'wrong' ? 'wrong under the scenario constraints' : 'merely different (should not fail — challenge the coach on this)'}</em>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.behaviourFlags.some((b) => b.triggered) && (
          <>
            <h3>Scored-down behaviours</h3>
            <ul>
              {d.behaviourFlags
                .filter((b) => b.triggered)
                .map((b) => (
                  <li key={b.behaviourId}>
                    <strong>{axisName(b.behaviourId)}:</strong> {b.evidence}
                  </li>
                ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <h2>The three gaps</h2>
        <ol>
          {d.gaps.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ol>
        {d.readings.length > 0 && (
          <>
            <h3>Read next</h3>
            <ul>
              {d.readings.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </>
        )}
        <p className="carry-forward">
          <strong>Carried to your next session:</strong> {d.carryForward}
        </p>
      </section>

      <section className="coach-chat">
        <h2>Talk it through</h2>
        <p className="hint">
          Ask anything — "what should I have drawn for the escalation path?", "was my recovery salvageable?" The
          coach has the model answer. The score won't move.
        </p>
        <div className="chat-log">
          {engine.coachChat.map((m, i) => (
            <div key={i} className={`bubble ${m.role === 'user' ? 'candidate' : 'coach'}`}>
              {m.text}
            </div>
          ))}
          {engine.coachThinking && <div className="bubble coach thinking">…</div>}
          <div ref={chatEndRef} />
        </div>
        {engine.lastError && <div className="notice error">{engine.lastError}</div>}
        <div className="button-row">
          <textarea
            value={question}
            rows={2}
            placeholder="Ask the coach…"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
          />
          <button onClick={ask} disabled={!question.trim() || engine.coachThinking}>
            Ask
          </button>
        </div>
      </section>

      <button className="start" onClick={onFinish}>
        Finish session
      </button>
    </div>
  );
}
