//
//  ReviewSheetSendTests.swift
//  AppUITests
//
//  What pressing Send persists, and what a queued send deliberately does not.
//
//  `SyncCoordinating.send(_:)` returns a `WrittenReview` whether the bundle
//  reached `outbox/` or went to the local queue, and `isQueued` is the only
//  thing that tells them apart (docs/04-flows.md § F7). The sheet used to render
//  that distinction — "Will send when online" — and then record a delivery
//  anyway: `recordReviewSent` with a directory inside the app container, and the
//  document moved to "Read" on the strength of a send that had not happened. The
//  next time the sheet opened it said "Sent <date> — nothing back yet", and
//  "Open reply as document" asked `ingestReply(fromReviewDirectory:)` for a
//  directory that was not in the outbox to be found.
//

import Foundation
import XCTest
@testable import AppUI
import Core

@MainActor
final class ReviewSheetSendTests: XCTestCase {

    // MARK: - Written

    /// The ordinary case: the folder was there.
    func testAWrittenReviewIsRecordedAndTheDocumentIsRead() async {
        let store = AppUITestStore()
        let environment = AppUITestEnvironment(store: store, sync: AppUITestSyncCoordinator())
        let model = ReviewSheetModel(document: AppUITestSamples.detail())
        model.closingInstruction = "Have a look at the token rotation."

        await model.send(environment: environment)

        XCTAssertEqual(model.phase, .sent)
        let sends = await store.recordedSends
        XCTAssertEqual(sends.count, 1, "A bundle in outbox/ is a review that has been sent.")
        let states = await store.recordedStates
        XCTAssertEqual(states, [.read], "Reviewed and sent is the end of the reading lifecycle.")
    }

    // MARK: - Queued

    /// The folder was unreachable, so the bytes are in the app container.
    func testAQueuedReviewIsNotRecordedAsSent() async {
        let store = AppUITestStore()
        let environment = AppUITestEnvironment(
            store: store,
            sync: AppUITestSyncCoordinator(isQueued: true)
        )
        let model = ReviewSheetModel(document: AppUITestSamples.detail())
        model.closingInstruction = "Have a look at the token rotation."

        await model.send(environment: environment)

        XCTAssertEqual(model.phase, .sent)
        guard case .queued? = model.outcome?.delivery else {
            XCTFail("A queued write must be rendered as queued.")
            return
        }

        let sends = await store.recordedSends
        XCTAssertTrue(sends.isEmpty, "Nothing reached outbox/, so there is no delivery to record.")
        let states = await store.recordedStates
        XCTAssertEqual(
            states,
            [.reviewing],
            "Sent-pending is neither sent nor un-reviewed: the document stays under Reviewing."
        )
    }

    /// The queue is flushed while the Sent screen is still up. That is the first
    /// moment there is a bundle in `outbox/` for an agent to answer, so that is
    /// when the review is recorded.
    func testAQueuedReviewIsRecordedOnceItReachesTheFolder() async {
        let store = AppUITestStore()
        let environment = AppUITestEnvironment(
            store: store,
            sync: AppUITestSyncCoordinator(isQueued: true)
        )
        let document = AppUITestSamples.detail()
        let model = ReviewSheetModel(document: document)
        model.closingInstruction = "Have a look at the token rotation."

        // `apply(_:)` writes through the environment `load` handed it, which is
        // how the sheet is wired on screen (ReviewSheet § .task).
        await model.load(environment: environment)
        await model.send(environment: environment)

        let directoryName = OutboxPayload.directoryName(forDocumentFolder: document.folderName)
        model.apply(
            .reviewWritten(
                documentId: document.id,
                directoryURL: AppUITestSyncCoordinator.directoryURL(
                    for: directoryName,
                    isQueued: false
                )
            )
        )

        await ReviewSheetSendTests.waitForSends(in: store)

        let sends = await store.recordedSends
        XCTAssertEqual(
            sends,
            [.reviewSent(documentId: document.id, directoryName: directoryName)],
            "The bundle is in outbox/ now, under the directory a reply will come back in."
        )
        let states = await store.recordedStates
        XCTAssertEqual(states, [.reviewing, .read], "Reviewing while queued, Read once delivered.")
    }

    /// A second `.reviewWritten` — the event stream tolerates duplicates by
    /// contract (Protocols.swift § FolderWatching) — must not record twice.
    func testTheDeliveryIsRecordedOnlyOnce() async {
        let store = AppUITestStore()
        let environment = AppUITestEnvironment(
            store: store,
            sync: AppUITestSyncCoordinator(isQueued: true)
        )
        let document = AppUITestSamples.detail()
        let model = ReviewSheetModel(document: document)
        model.closingInstruction = "Have a look at the token rotation."

        await model.load(environment: environment)
        await model.send(environment: environment)

        let directoryURL = AppUITestSyncCoordinator.directoryURL(
            for: OutboxPayload.directoryName(forDocumentFolder: document.folderName),
            isQueued: false
        )
        model.apply(.reviewWritten(documentId: document.id, directoryURL: directoryURL))
        await ReviewSheetSendTests.waitForSends(in: store)
        model.apply(.reviewWritten(documentId: document.id, directoryURL: directoryURL))
        await ReviewSheetSendTests.settle()

        let sends = await store.recordedSends
        XCTAssertEqual(sends.count, 1)
    }

    // MARK: - Waiting

    /// `apply(_:)` is synchronous and does its writing in a task, so a test has
    /// to wait for it. Bounded, so a failure is a failed assertion rather than a
    /// hung suite.
    private static func waitForSends(in store: AppUITestStore) async {
        for _ in 0..<200 {
            let sends = await store.recordedSends
            if sends.isEmpty == false { return }
            try? await Task.sleep(for: .milliseconds(5))
        }
    }

    /// Long enough for a write that should not happen to have happened.
    private static func settle() async {
        try? await Task.sleep(for: .milliseconds(50))
    }
}
