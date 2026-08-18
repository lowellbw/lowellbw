//
//  SyncTestStore.swift
//  SyncTests
//
//  A `DocumentStoring` that remembers what it was told, so a test can ask what
//  the coordinator did rather than inspecting the coordinator.
//
//  It is an actor because the protocol is, and because that is the whole point
//  of the protocol: Sync reaches the library through Core, never through
//  Storage, so the share extension can link Sync without SwiftData
//  (Package.swift § Sync).
//

import Foundation
import Core

/// An in-memory library.
actor SyncTestStore: DocumentStoring {

    /// Everything `upsert(_:)` was given, in order.
    private(set) var upserted: [IngestedDocument] = []

    /// Folder name to failure reason, as `recordIngestFailure` recorded it.
    private(set) var failures: [String: String] = [:]

    /// Document id to reply text, as `recordReply` recorded it.
    private(set) var replies: [UUID: String] = [:]

    private var rows: [DocumentSummary] = []

    init(existing: [DocumentSummary] = []) {
        self.rows = existing
    }

    // MARK: - Library

    func summaries(_ query: LibraryQuery) throws -> [DocumentSummary] {
        rows
    }

    func summary(id: UUID) throws -> DocumentSummary? {
        rows.first { $0.id == id }
    }

    func detail(id: UUID) throws -> DocumentDetail? {
        nil
    }

    func knownFolderNames() throws -> Set<String> {
        Set(rows.map { $0.folderName })
    }

    func documentId(forFolderName folderName: String) throws -> UUID? {
        rows.first { $0.folderName == folderName }?.id
    }

    // MARK: - Ingest

    @discardableResult
    func upsert(_ document: IngestedDocument) throws -> DocumentSummary {
        upserted.append(document)
        let summary = DocumentSummary(
            id: document.id,
            title: document.title,
            originDisplayName: document.origin.kind.displayName,
            addedAt: document.addedAt,
            pageCount: document.pageCount,
            state: .unread,
            localState: .local,
            commentCount: 0,
            hasInk: false,
            folderName: document.folderName
        )
        rows.removeAll { $0.folderName == document.folderName }
        rows.append(summary)
        return summary
    }

    func recordIngestFailure(folderName: String, reason: String) throws {
        failures[folderName] = reason
    }

    // MARK: - Reading state

    func setState(_ state: DocState, documentId: UUID) throws {}

    func setLastReadPage(_ pageIndex: Int, documentId: UUID) throws {}

    func setLocalState(_ state: DocumentLocalState, documentId: UUID) throws {}

    // MARK: - Ink

    func saveDrawing(_ drawingData: Data?, pageIndex: Int, documentId: UUID) throws {}

    func saveRecognisedInk(_ text: String?, pageIndex: Int, documentId: UUID) throws {}

    func pages(documentId: UUID) throws -> [PageSnapshot] { [] }

    func drawingData(pageIndex: Int, documentId: UUID) throws -> Data? { nil }

    // MARK: - Comments

    @discardableResult
    func addComment(_ draft: CommentDraft, documentId: UUID) throws -> CommentSnapshot {
        CommentSnapshot(
            id: UUID(),
            createdAt: Date(timeIntervalSince1970: 0),
            text: draft.text,
            source: draft.source,
            anchor: draft.anchor,
            resolvedOnPage: draft.resolvedOnPage
        )
    }

    func updateComment(id: UUID, text: String) throws {}

    func deleteComment(id: UUID) throws {}

    @discardableResult
    func undoLastCommentDeletion() throws -> CommentSnapshot? { nil }

    func comments(documentId: UUID) throws -> [CommentSnapshot] { [] }

    // MARK: - Review lifecycle

    func recordReviewSent(documentId: UUID, at date: Date, directoryName: String) throws {}

    func recordReply(documentId: UUID, text: String, receivedAt: Date) throws {
        replies[documentId] = text
    }

    // MARK: - Reading time

    func addReadingSeconds(_ seconds: TimeInterval, documentId: UUID) throws {}

    func readingSeconds(documentId: UUID) throws -> TimeInterval { 0 }

    // MARK: - Housekeeping

    func storageBytes() throws -> Int64 { 0 }

    func purgeArchived() throws -> Int64 { 0 }
}
