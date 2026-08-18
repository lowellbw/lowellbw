//
//  ReviewSheetModel.swift
//  AppUI · Review
//
//  The state behind the review sheet and the Sent screen (docs/02-spec.md
//  §§ S4-S5, docs/04-flows.md §§ F5-F7).
//
//  One model spans both screens on purpose: the Sent screen's only real
//  progress signals arrive on `SyncCoordinating.events()`, and that stream has
//  to be listened to from before Send is pressed until the sheet closes. Two
//  models would mean two subscriptions and a window between them where a reply
//  is missed.
//
//  Bundle building is the one expensive thing here and it never runs on the
//  main actor: `ReviewBundleBuilding.build(_:)` is a nonisolated async member
//  of a Sendable protocol, so awaiting it from this main-actor type leaves the
//  main actor for the duration (docs/03-architecture.md § Performance targets
//  gives it under 2s for 50 pages and 20 comments).
//

import Foundation
import Observation
import SwiftUI
import Core

/// Everything the review sheet collects, and everything the Sent screen learns.
@Observable
final class ReviewSheetModel {

    /// Which of the two screens the sheet is showing.
    enum Phase: Sendable, Hashable {
        case composing
        case sending
        case sent
    }

    /// The document under review. Fixed for the life of the sheet.
    let document: DocumentDetail

    /// In document order, as the store returned them. Edited in place by the
    /// rows; persisted through `DocumentStoring.updateComment(id:text:)`.
    var comments: [CommentSnapshot]

    /// The four Include toggles. Opens on `ReviewIncludeOptions.standard` —
    /// comments, ink and recognised text on, full document off — because the
    /// three layers are worth more together than any one of them alone
    /// (docs/00-brief.md).
    var include: ReviewIncludeOptions

    /// The closing instruction field. Turns a pile of notes into a request.
    var closingInstruction: String

    /// Accumulated reading time for the subtitle. Zero when never tracked, in
    /// which case the subtitle is just the title.
    var readingSeconds: TimeInterval

    /// What the destination row shows. Resolved in `load(environment:)`;
    /// `.unresolved` until then, which is the safe thing to render.
    var returnPath: ResolvedReturnPath

    var phase: Phase

    /// A sentence to show the user when something failed. Nil when nothing has.
    var failureMessage: String?

    /// True when a comment was deleted this session and the store can put it
    /// back. Nothing is destructive without undo (docs/02-spec.md
    /// § Cross-cutting).
    var canUndoDelete: Bool

    /// Set once the bundle exists. Drives the whole Sent screen.
    var outcome: ReviewSentOutcome?

    /// True while `SyncCoordinating.ingestReply(fromReviewDirectory:)` runs.
    var isOpeningReply: Bool

    /// Per-comment debounced saves, so typing does not hit the store on every
    /// keystroke. Cancelled and flushed before the bundle is built.
    private var pendingSaves: [UUID: Task<Void, Never>] = [:]

    /// A `reviewWritten` event that arrived before the outcome existed.
    private var confirmedWriteAt: Date?

    /// A `folderUnavailable` event that arrived before the outcome existed.
    private var folderUnavailableReason: String?

    /// - Parameters:
    ///   - document: everything the reader already holds. The sheet does not
    ///     re-fetch it.
    ///   - previewReadingSeconds: previews only. `PreviewEnvironment`'s store
    ///     reports zero reading time, and the subtitle is one of the things
    ///     worth previewing.
    ///   - previewOutcome: previews only. Seeds the Sent screen without
    ///     building a bundle.
    init(
        document: DocumentDetail,
        previewReadingSeconds: TimeInterval? = nil,
        previewOutcome: ReviewSentOutcome? = nil
    ) {
        self.document = document
        self.comments = document.comments
        self.include = ReviewIncludeOptions.standard
        self.closingInstruction = ""
        self.readingSeconds = previewReadingSeconds ?? 0
        self.returnPath = previewOutcome?.path ?? ResolvedReturnPath.unresolved
        self.phase = previewOutcome == nil ? .composing : .sent
        self.failureMessage = nil
        self.canUndoDelete = false
        self.outcome = previewOutcome
        self.isOpeningReply = false
    }

    // MARK: - Loading

    /// Resolves the destination, reads the reading time and refreshes the
    /// comment list. Cheap, and every failure degrades to what the reader
    /// already handed over.
    func load(environment: any AppEnvironment) async {
        returnPath = environment.returnPathResolver.resolve(document.origin)

        let settings = await environment.settings.settings
        include.inkImages = settings.sendInkedPagesAsImages

        if let seconds = try? await environment.store.readingSeconds(documentId: document.id), seconds > 0 {
            readingSeconds = seconds
        }
        if let fresh = try? await environment.store.comments(documentId: document.id), fresh.isEmpty == false {
            comments = fresh
        }
    }

    /// Listens to sync for as long as the sheet is open.
    ///
    /// This is the only source of truth for what happened to the bundle after
    /// it was handed over: `SyncCoordinating.send(_:)` returns a
    /// `WrittenReview` whether it wrote or queued, so the events are what tell
    /// the two apart.
    func observe(environment: any AppEnvironment) async {
        for await event in environment.sync.events() {
            apply(event)
        }
    }

    /// Folds one sync event into the outcome. Events for other documents are
    /// ignored.
    func apply(_ event: SyncEvent) {
        switch event {
        case let .reviewWritten(documentId, _):
            guard documentId == document.id else { return }
            let now = Date()
            confirmedWriteAt = now
            outcome?.delivery = .written(at: now)

        case let .folderUnavailable(reason):
            folderUnavailableReason = reason
            if case .pending = outcome?.delivery {
                outcome?.delivery = .queued(reason: reason)
            }

        case let .replyReceived(documentId, replyURL):
            guard documentId == document.id else { return }
            outcome?.reply = ReviewSentOutcome.Reply(receivedAt: Date(), text: nil)
            let url = replyURL
            Task { [weak self] in
                let text = await ReviewSheetModel.replyText(at: url)
                self?.outcome?.reply?.text = text
            }

        default:
            return
        }
    }

    /// Best-effort read of an agent's reply.
    ///
    /// Nonisolated so the read happens off the main actor. Returns nil whenever
    /// the file cannot be read — most often because the sync folder's security
    /// scope is not open, which no contract currently lets the UI ask for. The
    /// Sent screen renders the reply's arrival either way and "Open as
    /// document" is unaffected, since that goes through Sync.
    private nonisolated static func replyText(at url: URL) async -> String? {
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    // MARK: - Counts and copy

    /// Pages that will actually produce an image: ink present and archived
    /// bytes to render it from.
    var inkedPages: [PageSnapshot] {
        document.pages
            .filter { $0.hasInk && $0.drawingData != nil }
            .sorted { $0.pageIndex < $1.pageIndex }
    }

    var inkedPageCount: Int { inkedPages.count }

    /// Pages carrying recognised handwriting, which is what the "Recognised
    /// text" toggle actually governs.
    var recognisedPageCount: Int {
        document.pages.filter { page in
            guard let text = page.recognisedInk else { return false }
            return text.isEmpty == false
        }
        .count
    }

    /// "3 comments, 2 inked pages" (docs/02-spec.md § S4).
    var headline: String {
        let commentPart = comments.count == 1 ? "1 comment" : "\(comments.count) comments"
        let inkPart = inkedPageCount == 1 ? "1 inked page" : "\(inkedPageCount) inked pages"
        return "\(commentPart), \(inkPart)"
    }

    /// The document title, plus time spent when there is any worth reporting.
    var subtitle: String {
        guard readingSeconds >= 60 else { return document.title }
        let minutes = Int(readingSeconds / 60)
        return "\(document.title) · \(minutes) min of review"
    }

    /// The label on the one prominent button.
    var sendButtonTitle: String {
        returnPath.sameThread ? "Send back to thread" : "Send review"
    }

    /// False when there is nothing worth sending, or a send is already running.
    var canSend: Bool {
        guard phase == .composing, document.pdfURL != nil else { return false }
        if include.comments, comments.isEmpty == false { return true }
        if include.inkImages, inkedPageCount > 0 { return true }
        return trimmedInstruction.isEmpty == false
    }

    private var trimmedInstruction: String {
        closingInstruction.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Editing comments

    /// The current text of one comment, or empty when it has been deleted out
    /// from under the row.
    func text(forCommentId id: UUID) -> String {
        comments.first { $0.id == id }?.text ?? ""
    }

    /// A two-way binding for a row's text field. Writes are debounced.
    func textBinding(for id: UUID, environment: any AppEnvironment) -> Binding<String> {
        Binding(
            get: { [weak self] in self?.text(forCommentId: id) ?? "" },
            set: { [weak self] value in
                self?.setText(value, forCommentId: id, environment: environment)
            }
        )
    }

    private func setText(_ text: String, forCommentId id: UUID, environment: any AppEnvironment) {
        guard let index = comments.firstIndex(where: { $0.id == id }) else { return }
        comments[index].text = text
        pendingSaves[id]?.cancel()
        pendingSaves[id] = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            if Task.isCancelled { return }
            try? await environment.store.updateComment(id: id, text: text)
            self?.pendingSaves[id] = nil
        }
    }

    /// Writes every edit through before anything reads the store's copy.
    func flushPendingEdits(environment: any AppEnvironment) async {
        for task in pendingSaves.values {
            task.cancel()
        }
        pendingSaves.removeAll()
        for comment in comments {
            try? await environment.store.updateComment(id: comment.id, text: comment.text)
        }
    }

    /// Swipe to delete. Soft in the store, so it can be put back.
    func delete(commentId: UUID, environment: any AppEnvironment) async {
        pendingSaves[commentId]?.cancel()
        pendingSaves[commentId] = nil
        comments.removeAll { $0.id == commentId }
        do {
            try await environment.store.deleteComment(id: commentId)
            canUndoDelete = true
        } catch let error as PencilLoopError {
            failureMessage = error.message
        } catch {
            failureMessage = "That comment could not be deleted."
        }
    }

    /// Puts the last deleted comment back, with its original id and anchor.
    func undoDelete(environment: any AppEnvironment) async {
        guard let restored = try? await environment.store.undoLastCommentDeletion() else {
            canUndoDelete = false
            return
        }
        comments.append(restored)
        comments.sort(by: ReviewSheetModel.isBefore)
        canUndoDelete = false
    }

    /// Document order: page, then down the page, then oldest first.
    private nonisolated static func isBefore(_ first: CommentSnapshot, _ second: CommentSnapshot) -> Bool {
        if first.resolvedOnPage != second.resolvedOnPage {
            return first.resolvedOnPage < second.resolvedOnPage
        }
        if first.anchor.normalisedRect.y != second.anchor.normalisedRect.y {
            return first.anchor.normalisedRect.y < second.anchor.normalisedRect.y
        }
        return first.createdAt < second.createdAt
    }

    // MARK: - Sending (docs/04-flows.md § F5)

    /// Builds the bundle off the main actor, hands it to Sync, and records the
    /// review against the document.
    ///
    /// Never throws out: every failure becomes `failureMessage` and returns the
    /// sheet to `.composing`, because a review the user cannot retry is a
    /// review they have to retype.
    func send(environment: any AppEnvironment) async {
        guard phase == .composing else { return }
        guard let pdfURL = document.pdfURL else {
            failureMessage = "This document has no local file yet, so a review cannot be built."
            return
        }

        failureMessage = nil
        phase = .sending
        // Only events from this send may describe this send. A folder that was
        // unreachable an hour ago says nothing about the write about to happen.
        confirmedWriteAt = nil
        folderUnavailableReason = nil
        await flushPendingEdits(environment: environment)

        let sentAt = Date()
        let draft = ReviewDraft(
            documentId: document.id,
            externalDocumentId: document.id.uuidString,
            documentTitle: document.title,
            folderName: document.folderName,
            pdfURL: pdfURL,
            sourceMarkdownURL: document.sourceMarkdownURL,
            sourceMap: document.sourceMap,
            reviewedAt: sentAt,
            timeSpent: readingSeconds > 0 ? readingSeconds : nil,
            closingInstruction: trimmedInstruction,
            comments: include.comments ? comments : [],
            pages: document.pages,
            include: include,
            origin: document.origin,
            returnPath: returnPath
        )

        do {
            let payload = try await environment.bundleBuilder.build(draft)
            let written = try await environment.sync.send(payload)
            outcome = ReviewSentOutcome(
                documentId: document.id,
                documentTitle: document.title,
                path: returnPath,
                directoryName: written.directoryName,
                payload: payload,
                builtAt: written.writtenAt,
                delivery: deliveryFromEvents()
            )
            phase = .sent
            try? await environment.store.recordReviewSent(
                documentId: document.id,
                at: sentAt,
                directoryName: written.directoryName
            )
            try? await environment.store.setState(.read, documentId: document.id)
        } catch let error as PencilLoopError {
            failureMessage = error.message
            phase = .composing
        } catch {
            failureMessage = "The review could not be sent. Nothing was lost — try again."
            phase = .composing
        }
    }

    /// Whatever the event stream said while the bundle was being built. Pending
    /// when it said nothing yet, which is the common case and is not a claim
    /// about anything.
    private func deliveryFromEvents() -> ReviewSentOutcome.Delivery {
        if let writtenAt = confirmedWriteAt { return .written(at: writtenAt) }
        if let reason = folderUnavailableReason { return .queued(reason: reason) }
        return .pending
    }

    // MARK: - The reply (docs/04-flows.md § F6)

    /// Ingests `reply.md` as a new document, origin inherited.
    ///
    /// - Returns: the new document's id, or nil when it could not be opened —
    ///   including the ordinary case of there being no reply yet, which throws
    ///   `.nothingToIngest`.
    func openReply(environment: any AppEnvironment) async -> UUID? {
        guard let outcome else { return nil }
        isOpeningReply = true
        defer { isOpeningReply = false }
        do {
            return try await environment.sync.ingestReply(fromReviewDirectory: outcome.directoryName)
        } catch let error as PencilLoopError {
            failureMessage = error.message
            return nil
        } catch {
            failureMessage = "That reply could not be opened as a document."
            return nil
        }
    }
}
