# 03 · Architecture

## Stack

- Swift 6, strict concurrency. SwiftUI. iPadOS 27 minimum.
- **No third-party dependencies.** Everything below is a system framework.
- Targets: the app, a **share extension**, and a shared framework for the model layer.
  App Group for the shared container.

| Concern | Framework |
|---|---|
| Rendering, pagination, text selection | PDFKit |
| Ink capture | PencilKit (`PKCanvasView`, `PKDrawing`, `PKToolPicker`) |
| Handwriting → text | PencilKit (`PKStrokeRecognizer`, iPadOS 27) |
| Voice → text | Speech (`SpeechAnalyzer`, `SpeechTranscriber`) |
| Markdown parsing | `swift-markdown` (Apple, first-party) |
| md → PDF | `UIGraphicsPDFRenderer` over an `NSAttributedString` |
| Library index | SwiftData |
| Folder access & watching | `fileImporter`, security-scoped bookmarks, `NSFileCoordinator` + `NSFilePresenter` |
| Pencil gestures | `UIPencilInteraction` (squeeze), `UIHoverGestureRecognizer` |

## Module layout

```
PencilLoop/
├─ Core/            models, anchors, ID types — no UIKit imports
├─ Storage/         SwiftData schema, file layout, bookmark management
├─ Sync/            folder watcher, inbox scanner, outbox writer
├─ Ingest/          MarkdownRenderer, PDFImporter, MetadataExtractor
├─ Annotate/        InkLayer, AnchorResolver, VoiceRecorder, HandwritingRecogniser
├─ Export/          ReviewBundleBuilder, InkCropper, ReturnPathResolver
├─ UI/              Library, Reader, CommentPopover, ReviewSheet, Settings
└─ ShareExtension/
```

`Core` and `Storage` must not import SwiftUI or UIKit. Everything else may.

## Data model

```swift
@Model final class Document {
  var id: UUID
  var title: String
  var addedAt: Date
  var origin: Origin              // see 05-file-contracts.md
  var folderPath: String          // relative to the sync root
  var pageCount: Int
  var state: DocState             // .unread .reviewing .read .archived
  var extractedText: String       // for search
  @Relationship var pages: [Page]
  @Relationship var comments: [Comment]
}

@Model final class Page {
  var index: Int
  var drawingData: Data?          // PKDrawing
  var recognisedInk: String?      // PKStrokeRecognizer output, for search
  var hasInk: Bool
}

@Model final class Comment {
  var id: UUID
  var createdAt: Date
  var text: String
  var source: CommentSource       // .voice .handwriting .typed
  var anchor: Anchor
  var resolvedOnPage: Int
}

struct Anchor: Codable {
  var quoted: String              // the selected text
  var prefix: String              // 32 chars before
  var suffix: String              // 32 chars after
  var pageIndex: Int
  var normalisedRect: CGRect      // fallback when text matching fails
  var sourceRange: Range<Int>?    // into source.md, when a source map exists
}
```

## The four hard parts

### 1 · Markdown → PDF with a source map

The whole architecture rests on freezing layout at ingest. Parse with `swift-markdown`,
build an `AttributedString`, render page by page with `UIGraphicsPDFRenderer` at a fixed
page size (A4 portrait, 56pt margins, 11pt body).

**While rendering, record a source map**: for each laid-out text run, store
`(pageIndex, rect) → range in the original markdown`. Persist as `sourcemap.json`.

This is what lets a comment anchored on a rendered page resolve back to a character range
in the markdown Claude actually wrote. Without it you only have the quoted string — which
is still workable, but the source map makes the round trip precise. **Build it in M1, not
as an afterthought.**

Design the markdown page for annotation, not for density: wide margins (the right margin
is where handwriting goes), generous leading, and no code block wider than the text
column. See `06-integrations.md` for the matching authoring guidance sent to Claude.

### 2 · Ink over a scrolling PDF

One `PKCanvasView` per visible page, sized to that page's bounds, added as an overlay on
the `PDFPage`'s view. Do **not** use a single canvas over the whole scroll view — it
breaks at length and drifts on zoom.

- Recycle canvases with the page views; persist `PKDrawing` on `canvasViewDrawingDidChange`
  after a 500ms debounce.
- On zoom, scale the canvas transform with the page, never re-render the strokes.
- `drawingPolicy = .pencilOnly` so finger touches fall through to the scroll view.

Watch for: strokes lagging past a few hundred per page (split into render groups), and
canvas re-entrancy during rapid scrolling.

### 3 · Anchor resolution

When writing the review, and when the agent later re-resolves it:

1. **Exact match** on `prefix + quoted + suffix` in the source text. Almost always hits.
2. **Exact match** on `quoted` alone.
3. **Fuzzy match** on `quoted` — normalised whitespace, Levenshtein within 15%.
4. **Fallback**: page index + normalised rect, reported as approximate.

Never emit a line number as the primary anchor. Include it as a hint only.

### 4 · On-device speech

`SpeechAnalyzer` with `SpeechTranscriber`. Language assets download once via the system
asset catalog — trigger this on first run, in the background, and surface a one-line
Settings row if it hasn't completed. After that, no network.

**Jargon:** `SpeechAnalyzer` has no vocabulary-biasing API. Post-process instead — build a
term list from the document (identifiers, capitalised nouns, code spans, title words) and
fuzzy-correct transcript tokens against it. Cheap, effective, and it works regardless of
which recogniser is used. If accuracy is still poor, `SFSpeechRecognizer` with
`requiresOnDeviceRecognition = true` accepts ~100 `contextualStrings`; keep it as a
fallback path behind a protocol so either engine can be swapped in.

## Performance targets

| | Target |
|---|---|
| Cold launch to readable page (cached) | < 1s |
| Page turn / scroll | 60fps sustained, no dropped frames while inking |
| Ink latency | Whatever the display allows — do no work on the touch path |
| Voice transcript first token | < 400ms from press |
| Handwriting recognition per page | < 500ms, off the main actor |
| Review bundle write | < 2s for a 50-page document with 20 comments |
