//
//  DocumentStoreSearchTests.swift
//  StorageTests
//
//  docs/02-spec.md § S1: search covers document text *and* recognised
//  handwriting. Both halves are asserted here, because the ink half is the one
//  that silently stops working when the predicate is rewritten.
//

import XCTest
import Foundation
import Core
@testable import Storage

final class DocumentStoreSearchTests: XCTestCase {

    /// Two documents: one whose body mentions the term, one where only the
    /// margin scribble does.
    private func populated() async throws -> DocumentStore {
        let store = try StorageTestFactory.store()

        let paper = StorageTestFactory.ingested(
            title: "Auth refactor plan",
            folderName: "2026-08-18-auth-refactor-plan",
            extractedText: "The refactor replaces the session token with a signed assertion."
        )
        try await store.upsert(paper)

        let latency = StorageTestFactory.ingested(
            title: "Latency budget",
            folderName: "2026-08-19-latency-budget",
            extractedText: "Frames are budgeted at sixteen milliseconds."
        )
        try await store.upsert(latency)
        try await store.saveDrawing(StorageTestFactory.drawingData(), pageIndex: 1, documentId: latency.id)
        try await store.saveRecognisedInk("check the assertion lifetime", pageIndex: 1, documentId: latency.id)

        return store
    }

    func testSearchMatchesExtractedText() async throws {
        let store = try await populated()
        let hits = try await store.summaries(LibraryQuery(searchText: "signed assertion"))
        XCTAssertEqual(hits.map(\.folderName), ["2026-08-18-auth-refactor-plan"])
    }

    func testSearchMatchesTitle() async throws {
        let store = try await populated()
        let hits = try await store.summaries(LibraryQuery(searchText: "latency"))
        XCTAssertEqual(hits.map(\.folderName), ["2026-08-19-latency-budget"])
    }

    func testSearchMatchesRecognisedInk() async throws {
        let store = try await populated()
        let hits = try await store.summaries(LibraryQuery(searchText: "lifetime"))
        XCTAssertEqual(
            hits.map(\.folderName),
            ["2026-08-19-latency-budget"],
            "recognised handwriting is searchable (docs/02-spec.md § S1)"
        )
    }

    func testSearchMatchesTextAndInkTogether() async throws {
        let store = try await populated()
        let hits = try await store.summaries(LibraryQuery(searchText: "assertion"))
        XCTAssertEqual(
            Set(hits.map(\.folderName)),
            ["2026-08-18-auth-refactor-plan", "2026-08-19-latency-budget"],
            "one document matches on its text, the other only on its ink"
        )
    }

    func testSearchIsCaseInsensitive() async throws {
        let store = try await populated()
        let hits = try await store.summaries(LibraryQuery(searchText: "SIGNED ASSERTION"))
        XCTAssertEqual(hits.count, 1)
    }

    func testClearedInkStopsMatching() async throws {
        let store = try await populated()
        let found = try await store.documentId(forFolderName: "2026-08-19-latency-budget")
        let id = try XCTUnwrap(found)

        try await store.saveDrawing(nil, pageIndex: 1, documentId: id)

        let hits = try await store.summaries(LibraryQuery(searchText: "lifetime"))
        XCTAssertTrue(hits.isEmpty, "clearing a page's ink clears its recognised text with it")
    }

    func testEmptySearchTextIsNoFilter() async throws {
        let store = try await populated()
        let blank = try await store.summaries(LibraryQuery(searchText: "   "))
        XCTAssertEqual(blank.count, 2)
    }

    func testArchivedIsHiddenUnlessAskedFor() async throws {
        let store = try await populated()
        let found = try await store.documentId(forFolderName: "2026-08-19-latency-budget")
        let id = try XCTUnwrap(found)
        try await store.setState(.archived, documentId: id)

        let visible = try await store.summaries(.all)
        XCTAssertEqual(visible.map(\.folderName), ["2026-08-18-auth-refactor-plan"])

        let archived = try await store.summaries(LibraryQuery(states: [.archived]))
        XCTAssertEqual(archived.map(\.folderName), ["2026-08-19-latency-budget"])
    }

    func testStateFilterNarrowsToOneSection() async throws {
        let store = try await populated()
        let found = try await store.documentId(forFolderName: "2026-08-18-auth-refactor-plan")
        let id = try XCTUnwrap(found)
        try await store.setState(.read, documentId: id)

        let read = try await store.summaries(LibraryQuery(states: [.read]))
        XCTAssertEqual(read.map(\.folderName), ["2026-08-18-auth-refactor-plan"])

        let unread = try await store.summaries(LibraryQuery(states: [.unread]))
        XCTAssertEqual(unread.map(\.folderName), ["2026-08-19-latency-budget"])
    }

    func testSortOrders() async throws {
        let store = try await populated()

        let newestFirst = try await store.summaries(LibraryQuery(sort: .dateAdded, ascending: false))
        XCTAssertEqual(newestFirst.count, 2)
        let firstAdded = try XCTUnwrap(newestFirst.first?.addedAt)
        let lastAdded = try XCTUnwrap(newestFirst.last?.addedAt)
        XCTAssertGreaterThanOrEqual(firstAdded, lastAdded)

        let byTitle = try await store.summaries(LibraryQuery(sort: .title, ascending: false))
        XCTAssertEqual(
            byTitle.map(\.title),
            ["Auth refactor plan", "Latency budget"],
            "ascending == false is A–Z for .title (DTOs.swift, LibraryQuery.ascending)"
        )
    }

    func testAllowedStatesExcludeArchivedByDefault() {
        XCTAssertEqual(
            Set(LibraryFetch.allowedStateRawValues([])),
            Set(DocState.librarySections.map(\.rawValue))
        )
        XCTAssertFalse(LibraryFetch.allowedStateRawValues([]).contains(DocState.archived.rawValue))
        XCTAssertEqual(LibraryFetch.allowedStateRawValues([.read]), ["read"])
    }

    func testSearchTermIsTrimmed() {
        XCTAssertNil(LibraryFetch.searchTerm(in: LibraryQuery(searchText: nil)))
        XCTAssertNil(LibraryFetch.searchTerm(in: LibraryQuery(searchText: "\n  \t")))
        XCTAssertEqual(LibraryFetch.searchTerm(in: LibraryQuery(searchText: "  ink  ")), "ink")
    }
}
