//
//  AnchorResolver.swift
//  Core · Contracts
//
//  ─── SIGNATURES ONLY ─────────────────────────────────────────────────────────
//  W0-B froze these signatures and wrote the doc comments. **Unit U6 writes the
//  bodies.** Every `fatalError("WAVE 1 (U6)")` below is a deliberate placeholder
//  so the file is syntactically complete and everything that calls it compiles
//  today; this is the one file in the repo allowed that pattern, and
//  tooling/lint/check_style.py allow-lists it by name.
//
//  U6: replace the bodies, leave the signatures and the doc comments alone. If a
//  signature turns out to be wrong, that is a change request to the lead, not a
//  local edit — six modules are compiled against these.
//  ─────────────────────────────────────────────────────────────────────────────
//
//  The four-step ladder from docs/03-architecture.md § 3. It runs twice in a
//  document's life: once when the review is written, and again when the agent
//  re-resolves the anchor against a document it may since have regenerated.
//  Both sides must climb the same ladder in the same order or a comment lands in
//  the wrong place.
//

import Foundation

/// Resolves a stored `Anchor` back to a range of text.
///
/// A namespace, not an instance: this is pure text processing with no state and
/// no dependencies, and making it an object would only invite someone to give it
/// a cache.
///
/// **The ladder, in order. Never reorder it.**
///
/// 1. **Exact `prefix + quoted + suffix`.** Almost always hits, and it is the
///    only step that disambiguates a quote appearing twice in a document.
///    Yields `.exact`.
/// 2. **Exact `quoted` alone.** The context moved but the sentence did not.
///    When the quote occurs more than once, the occurrence nearest the previous
///    match position wins. Yields `.quoteOnly`.
/// 3. **Fuzzy `quoted`.** Whitespace normalised, then Levenshtein distance
///    within `fuzzyTolerance` of the quote's length. This is what survives a
///    regenerated document with a reworded sentence. Yields `.fuzzy` with the
///    similarity, so the caller can describe how confident it is.
/// 4. **Page + rect.** No text matched. Yields `.rectFallback`, which every
///    consumer must describe as approximate. `review.md` says so in prose, and
///    that sentence is not decoration (docs/05-file-contracts.md).
///
/// **A line number is never the primary anchor** (CLAUDE.md non-negotiable 5).
/// It may be included as a hint and nothing more.
public enum AnchorResolver {

    /// Characters of context captured either side of the quote
    /// (docs/02-spec.md § S3).
    public static let contextLength = 32

    /// Maximum Levenshtein distance for step 3, as a fraction of the quote's
    /// character count. 15% per docs/03-architecture.md § 3. A quote of 100
    /// characters tolerates 15 edits.
    public static let fuzzyTolerance = 0.15

    /// Below this many characters, fuzzy matching is refused outright: a
    /// four-character quote is within 15% of far too many other four-character
    /// strings, and a confident wrong answer is worse than a rect fallback.
    public static let minimumFuzzyLength = 12

    // MARK: - The ladder

    /// Runs the full four-step ladder.
    ///
    /// - Parameters:
    ///   - anchor: the stored anchor.
    ///   - text: the document text to resolve against. For a markdown document
    ///     this is the contents of `source.md`, and the returned ranges are
    ///     UTF-8 byte offsets into exactly that string. For a PDF-only document
    ///     it is the extracted text, and the caller should treat a resulting
    ///     range as advisory.
    /// - Returns: the highest rung that matched. Always returns something —
    ///   step 4 cannot fail.
    public static func resolve(anchor: Anchor, in text: String) -> AnchorResolution {
        fatalError("WAVE 1 (U6)")
    }

    /// Step 1: exact match on `prefix + quoted + suffix`.
    ///
    /// - Returns: the range of the **quoted portion only**, not the context, or
    ///   nil when the contextual quote does not appear verbatim.
    public static func exactContextualRange(
        prefix: String,
        quoted: String,
        suffix: String,
        in text: String
    ) -> SourceRange? {
        fatalError("WAVE 1 (U6)")
    }

    /// Step 2: exact match on `quoted` alone.
    ///
    /// - Parameter nearOffset: when the quote occurs more than once, the
    ///   occurrence whose start is closest to this offset wins. Pass the
    ///   anchor's stored `sourceRange?.start` when there is one; nil takes the
    ///   first occurrence.
    /// - Returns: nil when the quote does not appear verbatim.
    public static func exactQuoteRange(
        quoted: String,
        in text: String,
        nearOffset: Int? = nil
    ) -> SourceRange? {
        fatalError("WAVE 1 (U6)")
    }

    /// Step 3: fuzzy match on `quoted` with whitespace normalised.
    ///
    /// Compares against candidate windows of `text` of similar length. Refuses
    /// quotes shorter than `minimumFuzzyLength`, and refuses any candidate whose
    /// Levenshtein distance exceeds `tolerance × quoted.count`.
    ///
    /// - Parameter tolerance: defaults to `fuzzyTolerance`. Exposed so tests can
    ///   pin the behaviour at the boundary.
    /// - Returns: the best candidate's range in the **original, un-normalised**
    ///   `text`, together with a similarity of `1 - distance / quoted.count`
    ///   clamped to 0…1. Nil when nothing is close enough.
    public static func fuzzyQuoteRange(
        quoted: String,
        in text: String,
        tolerance: Double = AnchorResolver.fuzzyTolerance
    ) -> (range: SourceRange, similarity: Double)? {
        fatalError("WAVE 1 (U6)")
    }

    // MARK: - Capture

    /// Builds an anchor at annotation time.
    ///
    /// Captures `contextLength` characters either side of the selection,
    /// clamped at the document's ends. `quoted` is stored verbatim — no
    /// trimming, no whitespace collapsing. Normalisation belongs to step 3 and
    /// nowhere else, because a quote that was trimmed at capture will not match
    /// exactly at step 1.
    ///
    /// - Parameters:
    ///   - text: the document text the selection indexes into.
    ///   - selection: the selected byte range, half-open.
    ///   - pageIndex: zero-based page the touch landed on.
    ///   - normalisedRect: where the selection sits on that page, top-left
    ///     origin.
    ///   - sourceRange: the range in `source.md` when a source map resolved one;
    ///     nil for a PDF-only document.
    public static func captureAnchor(
        in text: String,
        selection: SourceRange,
        pageIndex: Int,
        normalisedRect: NormalisedRect,
        sourceRange: SourceRange?
    ) -> Anchor {
        fatalError("WAVE 1 (U6)")
    }

    /// Expands a raw touch-point selection to a sensible unit: the enclosing
    /// sentence when one can be identified, otherwise the enclosing line
    /// (docs/02-spec.md § S3).
    ///
    /// - Returns: the expanded range, or `selection` unchanged when it is
    ///   already a whole unit or nothing sensible can be found.
    public static func expandToUnit(_ selection: SourceRange, in text: String) -> SourceRange {
        fatalError("WAVE 1 (U6)")
    }

    // MARK: - Primitives

    /// Collapses every run of whitespace and newlines to a single space and
    /// trims the ends.
    ///
    /// Used by step 3 only. Deterministic and shared so that the resolver on
    /// this device and any re-implementation on the agent's side normalise
    /// identically.
    public static func normalisedWhitespace(_ text: String) -> String {
        fatalError("WAVE 1 (U6)")
    }

    /// Levenshtein edit distance between two strings, counting insertions,
    /// deletions and substitutions at cost 1.
    ///
    /// Compare `Character`s, not bytes: an accented letter is one edit, not
    /// two. Implementations should use the two-row form — quotes are short but
    /// this runs once per candidate window.
    public static func levenshteinDistance(_ lhs: String, _ rhs: String) -> Int {
        fatalError("WAVE 1 (U6)")
    }
}
