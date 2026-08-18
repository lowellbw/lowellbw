# 08 · Open questions

Ask before guessing. Each of these changes the build.

**1 · Which iPad?**
An iPad Air (M2 or later) does everything in this spec — Apple Pencil Pro, iPadOS 27,
on-device speech and handwriting recognition. The one real difference from a Pro is the
60Hz display: no ProMotion. It's perfectly usable, but for an inking app 120Hz is the
biggest single contributor to how connected the pen feels. Worth knowing before buying.
*Does not change the build either way.*

**2 · Which folder, and which sync provider?**
The spec assumes a user-chosen folder so any provider works. iCloud Drive is the default
assumption. If the documents should live in a **git repo** instead — synced by Working
Copy, giving history and diffs — say so; it changes M0's watcher and adds a commit step.

**3 · Should the reply loop be in v1?**
`reply.md` and the Sent-screen reply view are specified but add scope. They're what turns
one review into a conversation. Cut to v1.1 if M4 runs long?

**4 · Ship the `send-to-reader` skill as fully automatic?**
The spec says the skill fires without asking — any document over ~400 words goes to the
iPad. That's the right default for making the flow invisible, but it will occasionally
send things you didn't want. Confirm you'd rather over-send than have to ask each time.

**5 · Handwriting recognition — surface it or hide it?**
Recognised handwriting is used for search and included in the review bundle. Should the
user ever *see* the recognised text and be able to correct it before sending, or does that
turn a fast gesture into a chore? Current spec: hidden, shown only in the review sheet
where it can be edited.

**6 · Any interest in the marked-up page as a shareable artefact?**
Exporting the annotated PDF for a human colleague is trivially adjacent and not currently
specified. Worth 20 minutes if it's useful.

**7 · Re-verify before M6.**
Two things from the research may have changed: whether Claude Code's desktop plan-review
comments now actually reach the model (bugs #48945 and #49715), and the exact current
semantics of poke-only scheduled tasks bound to a Cowork session. Check both before
building the return paths.
