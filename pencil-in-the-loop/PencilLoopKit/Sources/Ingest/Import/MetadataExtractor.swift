//
//  MetadataExtractor.swift
//  Ingest · Import
//
//  Title, page count, and the vocabulary Speech will want later.
//
//  All of it pure: no file handles, no PDFKit, nothing that needs a document on
//  disk. The inputs come from `PDFImporter`, `SwiftMarkdownAdapter` and
//  `meta.json`; the decisions live here so there is one place that knows what
//  the title precedence actually is, and one place to test it.
//

import Foundation
import Core

/// Decides a document's title and page count, and builds its term list.
public struct MetadataExtractor: Sendable {

    /// Roughly what the fallback speech engine accepts as `contextualStrings`
    /// (docs/03-architecture.md § 4).
    public static let maximumTerms = 100

    public init() {}

    // MARK: - meta.json

    /// Reads `meta.json` bytes.
    ///
    /// **Never throws.** A truncated file, a file that is not JSON at all, or
    /// one written by a tool that got the schema wrong all yield
    /// `DocumentMetadata.empty`, and ingest carries on with the documented
    /// fallbacks (docs/04-flows.md § F1).
    public func metadata(fromMetaJSON data: Data) -> DocumentMetadata {
        guard let decoded = try? ContractCoding.decoder().decode(DocumentMetadata.self, from: data) else {
            return .empty
        }
        return decoded
    }

    // MARK: - Title

    /// The title, in the frozen order of preference.
    ///
    /// `meta.json` first, because a writing tool that bothered to name the
    /// document knows best. Then the PDF's own `Title` attribute, then the
    /// markdown H1, then the filename (DocumentMetadata.swift § title,
    /// docs/02-spec.md § S1). Every candidate is trimmed, and an empty one is
    /// skipped rather than winning.
    ///
    /// - Returns: never an empty string. A document with no usable name
    ///   anywhere is called "Document", because a library row with no title is
    ///   a row nobody can tap with confidence.
    public func title(
        metadataTitle: String?,
        pdfTitle: String?,
        markdownTitle: String?,
        fileName: String
    ) -> String {
        for candidate in [metadataTitle, pdfTitle, markdownTitle] {
            if let usable = usable(candidate) { return usable }
        }
        if let usable = usable(readableName(fromFileName: fileName)) { return usable }
        return "Document"
    }

    /// Turns `2026-08-18-auth-refactor-plan` or `auth_refactor_plan.pdf` into
    /// "Auth refactor plan".
    public func readableName(fromFileName fileName: String) -> String {
        var stem = fileName
        if let dot = stem.lastIndex(of: "."), dot != stem.startIndex {
            stem = String(stem[stem.startIndex ..< dot])
        }
        if let split = Slug.split(folderName: stem) {
            stem = split.slug
        }
        let words = stem
            .split(whereSeparator: { $0 == "-" || $0 == "_" || $0.isWhitespace })
            .map(String.init)
        guard let first = words.first else { return "" }
        let capitalised = first.prefix(1).uppercased() + first.dropFirst()
        return ([capitalised] + words.dropFirst()).joined(separator: " ")
    }

    // MARK: - Page count

    /// The page count to store.
    ///
    /// The rendered or imported document wins; `meta.json`'s value is a claim by
    /// the writing tool and the two are allowed to disagree
    /// (DocumentMetadata.swift § pageCount). The claim is only used when the
    /// real count is missing, which should not happen.
    public func pageCount(measured: Int, claimed: Int?) -> Int {
        if measured > 0 { return measured }
        guard let claimed, claimed > 0 else { return 0 }
        return claimed
    }

    // MARK: - Speech vocabulary

    /// Document jargon for the transcriber: identifiers, capitalised nouns,
    /// code-shaped tokens and title words (docs/03-architecture.md § 4).
    ///
    /// Deliberately the same signature as `TranscriptCorrecting.terms(
    /// forDocumentText:title:)` without adopting the protocol — correcting a
    /// transcript is Annotate's job and this module has no business owning half
    /// of it. See the contract note in this unit's report.
    ///
    /// - Returns: terms in descending order of usefulness, de-duplicated
    ///   case-insensitively, capped at `maximumTerms`. Never throws; a document
    ///   with nothing distinctive in it returns an empty array.
    public func terms(forDocumentText text: String, title: String) -> [String] {
        var ordered: [String] = []
        var seen: Set<String> = []

        func offer(_ term: String) {
            let key = term.lowercased()
            guard !seen.contains(key), !MetadataExtractor.stopWords.contains(key) else { return }
            seen.insert(key)
            ordered.append(term)
        }

        // 1 · Title words first. They are what the user will say out loud.
        for word in tokens(in: title) where word.count >= 3 {
            offer(word)
        }

        // 2 · Identifiers: anything shaped like code survives dictation badly
        // and is the most valuable thing to bias towards.
        var identifierCounts: [String: Int] = [:]
        var properCounts: [String: Int] = [:]
        for token in tokens(in: text) {
            guard token.count >= 3, token.count <= 40 else { continue }
            if isIdentifier(token) {
                identifierCounts[token, default: 0] += 1
            } else if isProperNoun(token) {
                properCounts[token, default: 0] += 1
            }
        }

        for term in ranked(identifierCounts) { offer(term) }
        for term in ranked(properCounts) { offer(term) }

        return Array(ordered.prefix(MetadataExtractor.maximumTerms))
    }

    // MARK: - Private

    private func usable(_ candidate: String?) -> String? {
        guard let candidate else { return nil }
        let trimmed = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// Frequency first, then alphabetically so the list is stable across runs —
    /// a term list that reshuffles between ingests makes a transcription bug
    /// impossible to reproduce.
    private func ranked(_ counts: [String: Int]) -> [String] {
        counts
            .sorted { left, right in
                left.value == right.value ? left.key < right.key : left.value > right.value
            }
            .map(\.key)
    }

    private func tokens(in text: String) -> [String] {
        text
            .split(whereSeparator: { character in
                !(character.isLetter || character.isNumber || character == "_" || character == ".")
            })
            .map { token in
                var value = String(token)
                while value.hasPrefix(".") { value.removeFirst() }
                while value.hasSuffix(".") { value.removeLast() }
                return value
            }
            .filter { candidate in
                !candidate.isEmpty
            }
    }

    /// `snake_case`, `camelCase`, `PascalCase`, `dotted.path`, `HTTP2` — the
    /// shapes a recogniser turns into two ordinary words.
    private func isIdentifier(_ token: String) -> Bool {
        if token.contains("_") || token.contains(".") { return true }
        if token.contains(where: \.isNumber), token.contains(where: \.isLetter) { return true }
        let characters = Array(token)
        guard characters.count > 1 else { return false }
        var sawLower = false
        for character in characters.dropFirst() {
            if character.isLowercase { sawLower = true }
            if character.isUppercase, sawLower { return true }
        }
        return false
    }

    /// A capitalised word that is not a sentence opener we recognise. Crude on
    /// purpose: a false positive costs one wasted slot in a hundred, a false
    /// negative costs a mis-transcribed product name in every comment.
    private func isProperNoun(_ token: String) -> Bool {
        guard let first = token.first, first.isUppercase else { return false }
        return token.dropFirst().contains(where: \.isLowercase)
    }

    /// Words that would only crowd out something useful.
    private static let stopWords: Set<String> = [
        "the", "and", "for", "with", "that", "this", "from", "into", "than",
        "then", "they", "them", "there", "their", "have", "has", "had", "was",
        "were", "will", "would", "should", "could", "when", "what", "which",
        "while", "where", "been", "because", "about", "after", "before", "over",
        "under", "also", "some", "such", "only", "more", "most", "other", "own"
    ]
}
