import { useEffect, useRef, useState } from 'react';
import type { SessionEngine } from '../engine/session';
import { readClock } from '../engine/stateMachine';

/**
 * The right-hand panel during the interview: who you're talking to, the phase
 * clock, live captions, the visible transcript (candidate + interviewer only —
 * the notebook stays private), and the typed fallback input.
 */

const PHASE_LABELS: Record<string, string> = {
  brief: 'Brief',
  scope: 'Scoping',
  design: 'Design',
  pushback: 'Pushback',
  questions: 'Your questions',
  debrief: 'Debrief',
};

export function InterviewerPanel({ engine }: { engine: SessionEngine }) {
  const [typed, setTyped] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  // Re-render each second for the clock.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const visibleEvents = engine.transcript.filter(
    (e) => e.kind === 'candidate' || e.kind === 'interviewer' || e.kind === 'phase',
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [visibleEvents.length, engine.interimText]);

  const clock = readClock(engine.clock);
  const persona = engine.config.persona;

  const submitTyped = () => {
    const text = typed.trim();
    if (!text) return;
    setTyped('');
    engine.handleCandidateText(text);
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="persona-name">{persona.name} · Sierra</div>
          <div className="phase-line">
            {PHASE_LABELS[clock.phase]} — {Math.floor(clock.phaseElapsedMin)}:
            {String(Math.floor((clock.phaseElapsedMin % 1) * 60)).padStart(2, '0')} / ~{clock.phaseGuidanceMin}m
            {clock.overGuidanceMin > 1.5 ? ' (over)' : ''}
          </div>
        </div>
        <div className={`mic-dot ${engine.interviewerSpeaking ? 'speaking' : engine.micAvailable ? 'listening' : 'off'}`}>
          {engine.interviewerSpeaking ? 'speaking' : engine.micAvailable ? 'listening' : 'mic off'}
        </div>
      </div>

      {engine.micNotice && <div className="notice">{engine.micNotice}</div>}
      {engine.lastError && <div className="notice error">{engine.lastError}</div>}

      <div className="transcript" ref={scrollRef}>
        {visibleEvents.map((e, i) =>
          e.kind === 'phase' ? (
            <div key={i} className="phase-marker">
              — {PHASE_LABELS[e.text] ?? e.text} —
            </div>
          ) : (
            <div key={i} className={`bubble ${e.kind}`}>
              <span className="who">{e.kind === 'candidate' ? 'You' : persona.name}</span>
              {e.text}
            </div>
          ),
        )}
        {engine.interimText && <div className="bubble candidate interim">{engine.interimText}…</div>}
      </div>

      <div className="controls">
        <textarea
          value={typed}
          placeholder={engine.micAvailable ? 'Speak aloud, or type here…' : 'Type your response…'}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submitTyped();
            }
          }}
          rows={2}
        />
        <div className="button-row">
          <button onClick={submitTyped} disabled={!typed.trim()}>
            Send
          </button>
          <button className="secondary" onClick={() => engine.requestInterviewer()} title="Hand the interviewer the floor">
            Go ahead…
          </button>
          <button
            className="danger"
            onClick={() => {
              if (confirm('End the interview and go to the debrief?')) void engine.finishInterview();
            }}
          >
            End interview
          </button>
        </div>
      </div>
    </div>
  );
}
