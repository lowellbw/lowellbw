# First task

Paste this into Claude Code from inside this folder.

---

Read `README.md` and `CLAUDE.md`, then `docs/00-brief.md`, `docs/01-design-principles.md`,
`docs/02-spec.md`, `docs/03-architecture.md` and `docs/07-build-plan.md`.

Then build **M0 only** — the reading shell. Nothing about ink, comments, voice, or agent
integration yet.

M0 is done when I can:

- Launch the app, pick a sync folder, and have `inbox/`/`outbox/` created inside it
- Drop a PDF into `inbox/` on my Mac and see it appear in the library within seconds
- Open it and read it comfortably: continuous scroll, chrome that auto-hides on scroll and
  returns on tap, page tints, last-read position remembered
- Search the library by title and document text
- **Turn off the network entirely and have every one of the above still work**

Before you start, tell me:

1. The Xcode project structure you'll create and why
2. Anything in the spec that's wrong, ambiguous, or that you'd do differently — I'd rather
   hear it now than discover it in the code
3. Any question from `docs/08-open-questions.md` that blocks M0

Then go. Small commits, and tell me what to test by hand on device after each.
