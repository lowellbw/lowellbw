# 05 · File contracts

The integration surface. Everything here is plain files in a user-chosen folder. Keep
these formats stable — external tools depend on them.

```
<sync root>/
├─ inbox/
│  └─ 2026-08-18-auth-refactor-plan/
│     ├─ document.pdf          rendered or original; always present
│     ├─ source.md             original markdown, when there was one
│     ├─ sourcemap.json        rendered rect → source range, when generated
│     └─ meta.json
└─ outbox/
   └─ 2026-08-18-auth-refactor-plan.review/
      ├─ review.md             the primary payload — what the model reads
      ├─ review.json           structured equivalent for tools
      ├─ manifest.json
      └─ ink/
         ├─ page-01.png
         └─ page-03.png
```

Folder names are `YYYY-MM-DD-<slug>`. Slugs are lowercase, hyphenated, ASCII.

## `meta.json`

```json
{
  "id": "F7A1…",
  "title": "Auth refactor plan",
  "createdAt": "2026-08-18T18:22:04Z",
  "origin": {
    "kind": "cowork",
    "sessionId": "8f3c1d…",
    "threadTitle": "Q3 platform planning",
    "returnPath": { "type": "poke", "triggerId": "trig_…" }
  },
  "sourceFormat": "markdown",
  "pageCount": 4
}
```

`origin.kind` ∈ `cowork` · `claude-code` · `codex` · `share` · `manual`.
`origin.returnPath.type` ∈ `poke` · `checkin` · `resume` · `cloud` · `none`.
Everything under `origin` is optional; a document with none is still perfectly readable.

## `review.md` — the primary payload

Written for a model to read. Prose, not a data structure.

```markdown
# Review — Auth refactor plan

Reviewed 18 Aug 2026, 21:14 · 3 comments · 2 inked pages
Origin: Cowork · "Q3 platform planning" · session 8f3c1d

## What I want done

Rework phase 2 with the shadow read, then re-scope the estimate.

## Comments

### 1 — page 1

> The migration runs in a single deploy, with no dual-write window.

No dual-write window means we can't roll back after cutover — I want a shadow read
for at least a day.

*voice, transcribed on device*

### 2 — page 2

> await refresh(session)   // no backoff

Infinite retry loop? Needs exponential backoff and a cap.

*handwriting, recognised*

## Handwritten pages

Pages 1 and 3 have handwritten marks attached as images: `ink/page-01.png`,
`ink/page-03.png`. Position carries meaning — arrows and circles refer to the text
they point at, and a strikethrough means delete. Read them alongside the comments
above rather than instead of them.

## How to locate these passages

Each quoted excerpt is exact text from the document you produced. Match on the quote,
not on a line number — the document may have changed since.
```

That closing paragraph is not decoration. It tells the model how to resolve anchors, and
it measurably improves how reliably edits land in the right place.

## `review.json`

```json
{
  "documentId": "F7A1…",
  "reviewedAt": "2026-08-18T21:14:00Z",
  "closingInstruction": "Rework phase 2 with the shadow read…",
  "comments": [
    {
      "id": "C1",
      "index": 1,
      "text": "No dual-write window means we can't roll back…",
      "source": "voice",
      "anchor": {
        "quoted": "The migration runs in a single deploy, with no dual-write window.",
        "prefix": "…refresh token stored in the keychain. ",
        "suffix": " Rollout is gated behind auth_v2…",
        "pageIndex": 0,
        "normalisedRect": [0.12, 0.34, 0.76, 0.04],
        "sourceRange": [1204, 1268]
      }
    }
  ],
  "inkPages": [
    { "pageIndex": 0, "image": "ink/page-01.png", "recognisedText": "do we? check the mobile SDK" }
  ],
  "included": { "comments": true, "inkImages": true, "recognisedText": true, "fullDocument": false }
}
```

## Ink images

One PNG per inked page. Crop to the union of the ink bounding boxes plus 15% padding on
each side, so surrounding text is visible for context. Render the page content beneath the
strokes — an arrow with nothing to point at is useless. Cap the long edge at 2048px.

**Only inked pages.** A 50-page document with marks on two pages sends two images. This is
the difference between a cheap review and an absurd one.

## Optional output: `review.docx`

Because Cowork's `docx` skill already parses native Word comments
(`w:commentRangeStart` / `w:commentRangeEnd`) and writes `w:ins` / `w:del` tracked
changes, emitting the review as a `.docx` with **real anchored comments** makes every
tool that reads Word comments a return path for free — Cowork, Word, Pages, Google Docs —
with no integration whatsoever.

Write it alongside `review.md` when the source document was markdown. Each comment
becomes a Word comment anchored to its quoted range; the closing instruction becomes a
comment on the title. This is cheap to produce and it is the most universally readable
artefact the app can emit. Treat it as the fallback that always works.

## Reply channel

An agent may write `outbox/<slug>.review/reply.md`. The app watches for it and surfaces it
on the Sent screen, and offers to open it as a new document. This is how a review becomes
a conversation without the user getting up.
