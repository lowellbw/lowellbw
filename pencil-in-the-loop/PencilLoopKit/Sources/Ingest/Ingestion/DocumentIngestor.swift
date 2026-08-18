//
//  DocumentIngestor.swift
//  Ingest · Ingestion
//
//  The one ingest path (docs/04-flows.md § F1). Cowork, Claude Code, the share
//  extension and a manual drop all arrive here; there are not four paths, there
//  is one.
//
//  Two promises shape everything below.
//
//  **Nothing is ever thrown away.** A malformed `meta.json` degrades to the
//  documented fallbacks. Markdown the parser rejects is rendered verbatim rather
//  than abandoned. Every remaining failure is a typed `PencilLoopError` carrying
//  a sentence a person can read, because the caller's job is to show an error
//  row — never to delete the folder and never to skip it silently.
//
//  **Everything is local by the time this returns.** Bytes are copied into the
//  app container before anything reads them, so a document that has been
//  ingested stays readable with the folder gone (CLAUDE.md non-negotiable 2).
//

import Foundation
import os
import Core

/// Turns one scanned inbox directory into a library row.
public struct DocumentIngestor: DocumentIngesting {

    /// Where pinned copies live: one subdirectory per `folderName`.
    ///
    /// Defaults to `DocumentContainer.documentsRoot()` — the app container's
    /// one document root, defined in Core because Storage records paths
    /// relative to it and Sync pins into it. Still injectable so a test can
    /// point it at a temporary directory; nothing else should pass anything
    /// else, because a document written outside that root is recorded by its
    /// absolute path and stops opening after a reinstall
    /// (DocumentContainer.swift header).
    ///
    /// Sync has normally already pinned the item into this very directory, so
    /// the sources this ingestor is handed and the targets it writes are often
    /// the same files. That is deliberate — one copy of a document, not two —
    /// and `materialise(from:to:)` handles it.
    public let containerRoot: URL

    public let geometry: PageGeometry

    private let parser: any MarkdownParsing
    private let renderer: any MarkdownPDFRendering
    private let importer: PDFImporter
    private let extractor: MetadataExtractor
    private let clock: @Sendable () -> Date
    private let log = Logger(subsystem: "co.pencil-loop", category: "ingest")

    public init(
        containerRoot: URL = DocumentContainer.documentsRoot(),
        geometry: PageGeometry = .annotationFriendly,
        parser: any MarkdownParsing = SwiftMarkdownAdapter(),
        renderer: any MarkdownPDFRendering = MarkdownPDFRenderer(),
        importer: PDFImporter = PDFImporter(),
        extractor: MetadataExtractor = MetadataExtractor(),
        clock: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.containerRoot = containerRoot
        self.geometry = geometry
        self.parser = parser
        self.renderer = renderer
        self.importer = importer
        self.extractor = extractor
        self.clock = clock
    }

    // MARK: - DocumentIngesting

    /// - Returns: a document whose every URL is a fully materialised file inside
    ///   the app container.
    /// - Throws: `PencilLoopError.nothingToIngest` for a directory with neither
    ///   a PDF nor a markdown file, `.materialisationFailed` when the bytes
    ///   cannot be copied in, `.unreadableDocument` when PDFKit refuses the
    ///   file, and `.renderFailed` when markdown will not lay out. The caller
    ///   records the failure and shows an error row; it must never delete the
    ///   folder (Protocols.swift § DocumentIngesting).
    public func ingest(_ item: InboxItem) async throws -> IngestedDocument {
        guard item.isIngestible else {
            throw PencilLoopError.nothingToIngest(folderName: item.folderName)
        }

        let destination = containerRoot.appendingPathComponent(item.folderName, isDirectory: true)
        try makeDirectory(at: destination, folderName: item.folderName)

        let metadata = await self.metadata(at: item.directoryURL)

        var markdownURL: URL?
        var markdownSource: String?
        if let source = item.sourceMarkdownURL {
            let target = destination.appendingPathComponent(DocumentFileNames.sourceMarkdown)
            let data = try materialise(from: source, to: target, folderName: item.folderName)
            markdownURL = target
            markdownSource = String(data: data, encoding: .utf8)
        }

        let outcome: Prepared
        if let pdfSource = item.pdfURL {
            outcome = try importExisting(
                pdfSource,
                sourceMapURL: item.sourceMapURL,
                markdownSource: markdownSource,
                destination: destination,
                folderName: item.folderName
            )
        } else if let markdownSource {
            outcome = try renderFromMarkdown(
                markdownSource,
                destination: destination,
                folderName: item.folderName
            )
        } else {
            throw PencilLoopError.nothingToIngest(folderName: item.folderName)
        }

        let title = extractor.title(
            metadataTitle: metadata.title,
            pdfTitle: outcome.pdfTitle,
            markdownTitle: outcome.markdownTitle,
            fileName: item.folderName
        )

        return IngestedDocument(
            id: metadata.uuid ?? UUID(),
            externalId: metadata.id,
            title: title,
            folderName: item.folderName,
            relativePath: SyncFolder.inboxDirectoryName + "/" + item.folderName,
            pdfURL: outcome.pdfURL,
            sourceMarkdownURL: markdownURL,
            sourceMap: outcome.sourceMap,
            origin: metadata.resolvedOrigin,
            sourceFormat: outcome.sourceFormat,
            pageCount: extractor.pageCount(measured: outcome.pageCount, claimed: metadata.pageCount),
            extractedText: outcome.extractedText,
            createdAt: metadata.createdAt ?? item.modifiedAt,
            addedAt: clock()
        )
    }

    /// Re-reads `meta.json` alone.
    ///
    /// **Never throws.** A missing or malformed file yields
    /// `DocumentMetadata.empty`, which resolves to a manually added document
    /// with no return path — readable, just not routable.
    public func metadata(at url: URL) async -> DocumentMetadata {
        let file = url.appendingPathComponent(DocumentFileNames.metadata)
        guard let data = try? Data(contentsOf: file) else { return .empty }
        return extractor.metadata(fromMetaJSON: data)
    }

    // MARK: - Paths through ingest

    /// What either path produced, so `ingest` assembles the DTO in one place.
    private struct Prepared {
        var pdfURL: URL
        var pageCount: Int
        var extractedText: String
        var sourceMap: SourceMap?
        var sourceFormat: SourceFormat
        var pdfTitle: String?
        var markdownTitle: String?
    }

    private func importExisting(
        _ source: URL,
        sourceMapURL: URL?,
        markdownSource: String?,
        destination: URL,
        folderName: String
    ) throws -> Prepared {
        let target = destination.appendingPathComponent(DocumentFileNames.document)
        _ = try materialise(from: source, to: target, folderName: folderName)
        let imported = try importer.read(pdfAt: target, folderName: folderName)

        var map: SourceMap?
        if let sourceMapURL {
            let mapTarget = destination.appendingPathComponent(DocumentFileNames.sourceMap)
            if let data = try? materialise(from: sourceMapURL, to: mapTarget, folderName: folderName) {
                map = try? ContractCoding.decoder().decode(SourceMap.self, from: data)
            }
        }

        return Prepared(
            pdfURL: target,
            pageCount: imported.pageCount,
            extractedText: imported.extractedText,
            sourceMap: map,
            sourceFormat: markdownSource == nil ? .pdf : .markdown,
            pdfTitle: imported.metadataTitle,
            markdownTitle: markdownSource.flatMap { MarkdownFallback.headingLine(in: $0) }
        )
    }

    private func renderFromMarkdown(
        _ source: String,
        destination: URL,
        folderName: String
    ) throws -> Prepared {
        let document: MarkdownDocument
        do {
            document = try parser.parse(source)
        } catch {
            // The document is not lost because its markdown confused a parser.
            log.error("markdown parse failed for \(folderName, privacy: .public); rendering verbatim")
            document = MarkdownFallback.preformatted(source)
        }

        let rendered = try renderer.render(document, geometry: geometry)

        let pdfTarget = destination.appendingPathComponent(DocumentFileNames.document)
        do {
            try rendered.pdfData.write(to: pdfTarget, options: .atomic)
        } catch {
            throw PencilLoopError.materialisationFailed(
                folderName: folderName,
                reason: error.localizedDescription
            )
        }

        // A source map that fails to write costs precision, never the document:
        // every consumer treats it as optional and falls back to quoted-text
        // matching (SourceMap.swift header).
        if let data = try? ContractCoding.encoder().encode(rendered.sourceMap) {
            try? data.write(
                to: destination.appendingPathComponent(DocumentFileNames.sourceMap),
                options: .atomic
            )
        }

        return Prepared(
            pdfURL: pdfTarget,
            pageCount: rendered.pageCount,
            extractedText: rendered.extractedText,
            sourceMap: rendered.sourceMap,
            sourceFormat: .markdown,
            pdfTitle: nil,
            markdownTitle: document.title
        )
    }

    // MARK: - Materialisation

    private func makeDirectory(at url: URL, folderName: String) throws {
        do {
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        } catch {
            throw PencilLoopError.materialisationFailed(
                folderName: folderName,
                reason: error.localizedDescription
            )
        }
    }

    /// Copies one file into the app container and returns its bytes.
    ///
    /// A download is requested first so a file-provider placeholder becomes a
    /// real file before it is read; the call fails harmlessly for anything that
    /// is not in a ubiquitous container.
    ///
    /// **When source and destination are the same file, nothing is written.**
    /// That is the normal case now that Sync pins into the same document
    /// directory this materialises into: the bytes are already here, already
    /// verified against the size the provider reported, and rewriting them
    /// would risk truncating a good file to save nothing.
    ///
    // WAVE 2 (U3): wrap the read in NSFileCoordinator once Sync's security
    // scope helper lands, so a provider writing the folder mid-scan cannot hand
    // us a half-written file.
    @discardableResult
    private func materialise(from source: URL, to destination: URL, folderName: String) throws -> Data {
        let isSameFile = source.standardizedFileURL.path(percentEncoded: false)
            == destination.standardizedFileURL.path(percentEncoded: false)
        if isSameFile == false {
            try? FileManager.default.startDownloadingUbiquitousItem(at: source)
        }
        do {
            let data = try Data(contentsOf: source, options: [.uncached])
            if isSameFile == false {
                try data.write(to: destination, options: .atomic)
            }
            return data
        } catch {
            throw PencilLoopError.materialisationFailed(
                folderName: folderName,
                reason: error.localizedDescription
            )
        }
    }
}
