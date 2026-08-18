import Foundation
import Core

/// An in-memory `DocumentStoring` for the ink tests.
///
/// Records every ink write in order, so a test can assert on coalescing — "one
/// stroke, one write" is the property that matters, and it is invisible from
/// the outside unless the store keeps a log. `failWrites` makes
/// `saveDrawing(_:pageIndex:documentId:)` throw, which is how the retry path
/// gets exercised without a full disk.
actor InkTestStore: DocumentStoring {

    struct DrawingWrite: Sendable, Hashable {
        var documentId: UUID
        var pageIndex: Int
        var byteCount: Int?
    }

    private(set) var drawingWrites: [DrawingWrite] = []
    private(set) var recognisedWrites: [String?] = []
    private(set) var pageReadCount = 0
    private var storedPages: [PageSnapshot]
    private var failWrites: Bool

    init(pages: [PageSnapshot] = [], failWrites: Bool = false) {
        self.storedPages = pages
        self.failWrites = failWrites
    }

    func setFailWrites(_ value: Bool) {
        self.failWrites = value
    }

    // MARK: - Library

    func summaries(_ query: LibraryQuery) throws -> [DocumentSummary] { [] }

    func summary(id: UUID) throws -> DocumentSummary? { nil }

    func detail(id: UUID) throws -> DocumentDetail? { nil }

    func knownFolderNames() throws -> Set<String> { [] }

    func documentId(forFolderName folderName: String) throws -> UUID? { nil }

    // MARK: - Ingest

    @discardableResult
    func upsert(_ document: IngestedDocument) throws -> DocumentSummary {
        DocumentSummary(
            id: document.id,
            title: document.title,
            originDisplayName: "",
            addedAt: document.addedAt,
            pageCount: document.pageCount,
            state: .unread,
            localState: .local,
            commentCount: 0,
            hasInk: false,
            folderName: document.folderName
        )
    }

    func recordIngestFailure(folderName: String, reason: String) throws {}

    // MARK: - Reading state

    func setState(_ state: DocState, documentId: UUID) throws {}

    func setLastReadPage(_ pageIndex: Int, documentId: UUID) throws {}

    func setLocalState(_ state: DocumentLocalState, documentId: UUID) throws {}

    // MARK: - Ink

    func saveDrawing(_ drawingData: Data?, pageIndex: Int, documentId: UUID) throws {
        if self.failWrites {
            throw PencilLoopError.storeWriteFailed(reason: "test")
        }
        self.drawingWrites.append(
            DrawingWrite(documentId: documentId, pageIndex: pageIndex, byteCount: drawingData?.count)
        )
        self.storedPages.removeAll { $0.pageIndex == pageIndex }
        self.storedPages.append(
            PageSnapshot(
                pageIndex: pageIndex,
                drawingData: drawingData,
                recognisedInk: nil,
                hasInk: drawingData != nil
            )
        )
    }

    func saveRecognisedInk(_ text: String?, pageIndex: Int, documentId: UUID) throws {
        self.recognisedWrites.append(text)
    }

    func pages(documentId: UUID) throws -> [PageSnapshot] {
        self.pageReadCount += 1
        return self.storedPages.sorted { $0.pageIndex < $1.pageIndex }
    }

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

    func comments(documentId: UUID) throws -> [CommentSnapshot] { [] }

    // MARK: - Review lifecycle

    func recordReviewSent(documentId: UUID, at date: Date, directoryName: String) throws {}

    func recordReply(documentId: UUID, text: String, receivedAt: Date) throws {}

    // MARK: - Housekeeping

    func storageBytes() throws -> Int64 { 0 }

    func purgeArchived() throws -> Int64 { 0 }
}
