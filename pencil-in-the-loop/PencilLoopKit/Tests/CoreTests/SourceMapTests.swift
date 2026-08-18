//
//  SourceMapTests.swift
//  CoreTests
//

import XCTest
import Core

final class SourceMapTests: XCTestCase {

    private let map = SourceMap(
        documentId: "F7A1",
        entries: [
            SourceMap.Entry(
                pageIndex: 0,
                rect: NormalisedRect(x: 0.1, y: 0.10, width: 0.7, height: 0.04),
                range: SourceRange(start: 0, end: 40)
            ),
            SourceMap.Entry(
                pageIndex: 0,
                rect: NormalisedRect(x: 0.1, y: 0.30, width: 0.7, height: 0.04),
                range: SourceRange(start: 40, end: 120)
            ),
            SourceMap.Entry(
                pageIndex: 1,
                rect: NormalisedRect(x: 0.1, y: 0.20, width: 0.7, height: 0.04),
                range: SourceRange(start: 120, end: 300)
            ),
            SourceMap.Entry(
                pageIndex: 1,
                rect: NormalisedRect(x: 0.1, y: 0.24, width: 0.7, height: 0.04),
                range: SourceRange(start: 300, end: 460)
            )
        ]
    )

    // MARK: - rect → range

    func testNearestPrefersTheEntryContainingTheTouchPoint() {
        let touch = NormalisedRect(x: 0.4, y: 0.305, width: 0.01, height: 0.01)
        XCTAssertEqual(map.range(nearest: touch, page: 0), SourceRange(start: 40, end: 120))
    }

    func testNearestFallsBackToClosestCentreWhenNothingContainsThePoint() {
        let touch = NormalisedRect(x: 0.4, y: 0.90, width: 0.01, height: 0.01)
        XCTAssertEqual(map.range(nearest: touch, page: 0), SourceRange(start: 40, end: 120))
    }

    func testNearestIsScopedToItsPage() {
        let touch = NormalisedRect(x: 0.4, y: 0.20, width: 0.01, height: 0.01)
        XCTAssertEqual(map.range(nearest: touch, page: 1), SourceRange(start: 120, end: 300))
    }

    func testNearestOnAPageWithNoEntriesIsNil() {
        XCTAssertNil(map.range(nearest: .unit, page: 7))
    }

    func testEmptyMapResolvesNothing() {
        XCTAssertNil(SourceMap.empty.range(nearest: .unit, page: 0))
        XCTAssertTrue(SourceMap.empty.isEmpty)
    }

    // MARK: - offset → rect

    func testRectContainingAnOffset() throws {
        let hit = try XCTUnwrap(map.rect(containing: 50))
        XCTAssertEqual(hit.page, 0)
        XCTAssertEqual(hit.rect.y, 0.30, accuracy: 1e-12)
    }

    /// Ranges are half-open, so the boundary offset belongs to the next entry.
    func testBoundaryOffsetBelongsToTheFollowingEntry() throws {
        let hit = try XCTUnwrap(map.rect(containing: 40))
        XCTAssertEqual(hit.rect.y, 0.30, accuracy: 1e-12)
    }

    func testOffsetPastTheEndIsNil() {
        XCTAssertNil(map.rect(containing: 100_000))
    }

    // MARK: - range → rects

    func testRectsForARangeSpanningTwoPagesUnionsPerPage() {
        let rects = map.rects(forRange: SourceRange(start: 30, end: 320))
        XCTAssertEqual(rects.map(\.page), [0, 1])
        XCTAssertEqual(rects[0].rect.minY, 0.10, accuracy: 1e-12)
        XCTAssertEqual(rects[0].rect.maxY, 0.34, accuracy: 1e-12)
        XCTAssertEqual(rects[1].rect.minY, 0.20, accuracy: 1e-12)
        XCTAssertEqual(rects[1].rect.maxY, 0.28, accuracy: 1e-12)
    }

    func testRectsForARangeThatMatchesNothingIsEmpty() {
        XCTAssertTrue(map.rects(forRange: SourceRange(start: 900, end: 950)).isEmpty)
    }

    func testEntriesOnPage() {
        XCTAssertEqual(map.entries(onPage: 1).count, 2)
        XCTAssertTrue(map.entries(onPage: 9).isEmpty)
    }

    // MARK: - The on-disk shape

    func testRoundTripsThroughTheContractCoder() throws {
        let data = try ContractCoding.encoder().encode(map)
        let json = String(decoding: data, as: UTF8.self)
        // Keys are the ones sourcemap.schema.json declares.
        XCTAssertTrue(json.contains("\"source\""))
        XCTAssertTrue(json.contains("\"offsetEncoding\""))
        XCTAssertTrue(json.contains("utf8"))
        let decoded = try ContractCoding.decoder().decode(SourceMap.self, from: data)
        XCTAssertEqual(decoded, map)
        XCTAssertEqual(decoded.sourceFile, "source.md")
        XCTAssertEqual(decoded.version, SourceMap.currentVersion)
    }
}
