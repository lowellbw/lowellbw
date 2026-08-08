import { useCallback, useReducer, useRef, useState } from 'react';
import { Board, type BoardApi } from './components/Board';
import { InterviewerPanel } from './components/InterviewerPanel';
import { SetupScreen } from './components/SetupScreen';
import { DebriefView } from './components/DebriefView';
import { SessionEngine, type SessionConfig } from './engine/session';
import { pickPersona } from './engine/personas';
import { loadLastPersonaId } from './engine/sessionLog';

type Mode = 'setup' | 'session';

export default function App() {
  const [mode, setMode] = useState<Mode>('setup');
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  const engineRef = useRef<SessionEngine | null>(null);
  const boardApiRef = useRef<BoardApi | null>(null);

  const handleBoardReady = useCallback((api: BoardApi) => {
    boardApiRef.current = api;
  }, []);

  const startSession = (config: Omit<SessionConfig, 'persona'>) => {
    const persona = pickPersona(loadLastPersonaId());
    const engine = new SessionEngine(
      { ...config, persona },
      {
        getBoard: async () => (boardApiRef.current ? boardApiRef.current.snapshot() : null),
        getSceneJSON: () => boardApiRef.current?.sceneJSON() ?? null,
        onUpdate: forceUpdate,
      },
    );
    engineRef.current = engine;
    setMode('session');
    engine.start();
  };

  const finishSession = () => {
    engineRef.current?.dispose();
    engineRef.current = null;
    setMode('setup');
  };

  if (mode === 'setup' || !engineRef.current) {
    return <SetupScreen onStart={startSession} />;
  }

  const engine = engineRef.current;
  const inDebrief = engine.status === 'debriefing' || engine.status === 'generating-debrief' || engine.status === 'error';

  if (inDebrief) {
    return (
      <div className="debrief-screen">
        {engine.status === 'generating-debrief' && (
          <div className="generating">
            <h1>The interviewer is writing up their notes…</h1>
            <p>Scoring the transcript, the board, and the notebook against the rubric.</p>
          </div>
        )}
        {engine.status === 'error' && (
          <div className="generating">
            <div className="notice error">{engine.lastError}</div>
            <button className="start" onClick={() => void engine.retryDebrief()}>
              Retry debrief
            </button>
          </div>
        )}
        {engine.status === 'debriefing' && <DebriefView engine={engine} onFinish={finishSession} />}
      </div>
    );
  }

  return (
    <div className="session-screen">
      <Board onReady={handleBoardReady} />
      <InterviewerPanel engine={engine} />
    </div>
  );
}
