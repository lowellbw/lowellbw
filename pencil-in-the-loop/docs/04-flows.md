# 04 · Flows

## F1 · Ingest

```
source ──▶ writes inbox/<slug>/ ──▶ NSFilePresenter fires
                                     │
                                     ▼
                        is there a document.pdf?
                          │yes                  │no
                          ▼                     ▼
                   use it directly     render source.md → PDF
                                       + emit sourcemap.json
                                     │
                                     ▼
                  extract title, page count, full text
                                     ▼
                     insert Document, state = .unread
                                     ▼
                        appears in library sidebar
```

Sources: Cowork skill · Claude Code MCP · share extension · manual drop.
All four converge on the same folder write. There is one ingest path, not four.

Failure handling: a malformed `meta.json` must never block ingest — fall back to filename
as title and `origin.kind = "manual"`. A document that can't be rendered shows in the
library with an error row rather than vanishing.

## F2 · Read

Tap row → reader opens at last read position → chrome auto-hides on first scroll.
State moves `.unread → .reviewing` on the first annotation, not on open.

## F3 · Ink

```
Pencil touches page
      ▼
PKCanvasView receives it (finger touches fall through to scroll)
      ▼
stroke committed → canvasViewDrawingDidChange
      ▼
debounce 500ms → persist PKDrawing to Page.drawingData
      ▼
background: PKStrokeRecognizer → Page.recognisedInk (for search + export)
```

Recognition runs off the main actor and never blocks drawing. If it fails, the ink is
still captured and still exported as an image — recognition is an enhancement, never a
dependency.

## F4 · Voice comment

```
Pencil long-press (0.4s) ──or── Pencil Pro squeeze
      ▼
capture anchor at touch point (nearest sentence, else line)
      ▼
haptic .light · popover appears showing the quoted excerpt
      ▼
SpeechAnalyzer starts · waveform animates · transcript streams in
      ▼
user releases
      │
      ├─ held < 0.3s ──▶ discard (mis-touch), no marker
      │
      └─ held ≥ 0.3s ──▶ post-process transcript against document term list
                          ▼
                     save Comment · haptic .success · marker appears in margin
```

Scribble variant: tapping "✎ scribble instead" swaps the popover body for a Scribble
field. Identical anchor, identical storage, `source = .handwriting`.

## F5 · Review and send

```
Review button
      ▼
sheet: comments in document order, include toggles, closing instruction
      ▼
ReturnPathResolver reads meta.json origin
      │
      ├─ cowork + poke trigger   ──▶ "SAME THREAD"  (fire trigger)
      ├─ cowork + checkin        ──▶ "SAME THREAD"  (session picks it up)
      ├─ claude-code + cloud     ──▶ "SAME THREAD"  (claude --cloud … -p)
      ├─ claude-code + local     ──▶ "SAME THREAD"  (claude -p … --resume)
      └─ share / manual / none   ──▶ "NO THREAD"    (share sheet fallback)
      ▼
destination row shows the resolved path — user sees it before committing
      ▼
Send
      ▼
build bundle: review.md · review.json · cropped ink PNGs · manifest.json
      ▼
write to outbox/ atomically (temp dir, then rename)
      ▼
Sent screen · state → .read
```

Atomic write matters: a watcher on the other side must never see a half-written bundle.
Write to a sibling `.tmp` directory and rename.

## F6 · Reply

```
agent writes outbox/<slug>.review/reply.md
      ▼
watcher fires → Sent screen shows the reply inline
      ▼
"Open as document" ──▶ ingests it as a new inbox item, origin inherited
```

That last step is what turns a single review into an ongoing loop — the reply is itself
annotatable, with the thread context carried forward.

## F7 · Offline

Every step above except the first sync and the outbox write works with no connection.

- Documents already downloaded open instantly.
- Ink, voice transcription and handwriting recognition are all on-device.
- The bundle is written locally and syncs whenever the connection returns; the Sent
  screen says "will send when online" rather than failing.
- Search covers cached text and recognised ink, offline.

Nothing in the reading or annotating path may show a network spinner. If a feature can't
meet that, it doesn't ship in v1.
