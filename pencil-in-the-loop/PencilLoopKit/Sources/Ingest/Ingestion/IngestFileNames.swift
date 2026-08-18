//
//  IngestFileNames.swift
//  Ingest · Ingestion
//
//  The four filenames inside an inbox directory (docs/05-file-contracts.md).
//
//  These strings are a public contract with every tool that writes the folder,
//  and they are spelled in more than one module — Sync scans for them, Ingest
//  reads them. STYLE.md § 9 says a constant used in two modules belongs in
//  Core/Contracts; there is no home for them there yet, so they live here and
//  the duplication is flagged in this unit's report rather than left implicit.
//

import Foundation

/// The filenames inside `inbox/<YYYY-MM-DD-slug>/`.
public enum IngestFileNames {

    /// Rendered or original. Always present by the time ingest finishes.
    public static let pdf = "document.pdf"

    /// The original markdown, when there was one.
    public static let markdown = "source.md"

    /// Rendered rect → source range, written whenever we did the rendering.
    public static let sourceMap = "sourcemap.json"

    /// Origin, title, dates.
    public static let meta = "meta.json"
}
