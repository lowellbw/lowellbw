import { useCallback, useRef } from 'react';
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import type { BoardSnapshot } from '../engine/interviewerAgent';

/**
 * The whiteboard. Wraps Excalidraw and exposes a small API for the engine:
 * a PNG + text-inventory + hash snapshot (perception), and a compact scene
 * JSON (debrief). No screen sharing needed — the board is in the app.
 */

export interface BoardApi {
  snapshot: () => Promise<BoardSnapshot | null>;
  sceneJSON: () => string | null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function describeElements(elements: readonly any[]): string {
  const visible = elements.filter((e) => !e.isDeleted);
  if (!visible.length) return 'empty board';
  const counts: Record<string, number> = {};
  const texts: string[] = [];
  for (const e of visible) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (e.type === 'text' && e.text) texts.push(e.text.replace(/\s+/g, ' ').trim());
  }
  const countStr = Object.entries(counts)
    .map(([t, n]) => `${n} ${t}`)
    .join(', ');
  const labelStr = texts.length ? `; labels: ${texts.slice(0, 60).map((t) => `"${t}"`).join(', ')}` : '';
  return `${countStr}${labelStr}`;
}

export function Board({ onReady }: { onReady: (api: BoardApi) => void }) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  const handleApi = useCallback(
    (excalidrawApi: ExcalidrawImperativeAPI) => {
      apiRef.current = excalidrawApi;
      onReady({
        snapshot: async () => {
          const api = apiRef.current;
          if (!api) return null;
          const elements = api.getSceneElements();
          const visible = elements.filter((e) => !e.isDeleted);
          if (!visible.length) return null;
          // Hash on id+version — Excalidraw bumps version on every mutation.
          const hash = visible.map((e) => `${e.id}:${e.version}`).join('|');
          const inventory = describeElements(visible);
          let pngBase64: string | null = null;
          try {
            const blob = await exportToBlob({
              elements: visible,
              appState: { exportBackground: true, viewBackgroundColor: '#ffffff' },
              files: api.getFiles(),
              maxWidthOrHeight: 1200,
              mimeType: 'image/png',
            });
            pngBase64 = await blobToBase64(blob);
          } catch {
            // Perception degrades to the text inventory if export fails.
          }
          return { pngBase64, inventory, hash };
        },
        sceneJSON: () => {
          const api = apiRef.current;
          if (!api) return null;
          const visible = api.getSceneElements().filter((e) => !e.isDeleted);
          if (!visible.length) return null;
          const compact = visible.map((e: any) => ({
            id: e.id,
            type: e.type,
            x: Math.round(e.x),
            y: Math.round(e.y),
            w: Math.round(e.width),
            h: Math.round(e.height),
            ...(e.text ? { text: e.text } : {}),
            ...(e.startBinding?.elementId ? { from: e.startBinding.elementId } : {}),
            ...(e.endBinding?.elementId ? { to: e.endBinding.elementId } : {}),
          }));
          const json = JSON.stringify(compact);
          return json.length > 20000 ? json.slice(0, 20000) + '…(truncated)' : json;
        },
      });
    },
    [onReady],
  );

  return (
    <div className="board-wrap">
      <Excalidraw excalidrawAPI={handleApi} theme="light" />
    </div>
  );
}
