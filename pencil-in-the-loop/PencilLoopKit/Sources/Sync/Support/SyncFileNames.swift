//
//  SyncFileNames.swift
//  Sync · Support
//
//  The file names inside an `inbox/` directory, plus the staging convention
//  every writer of this folder shares. Spelled once, here, because a folder
//  layout is a public contract (docs/05-file-contracts.md) and a typo in it is
//  a document that never appears.
//
//  ─── CONTRACT REQUEST (U2) ───────────────────────────────────────────────────
//  `meta.json`, `document.pdf`, `source.md`, `sourcemap.json` and `reply.md`
//  are read by Sync and written by Ingest, Export and the share extension, so
//  by STYLE.md § 9 they belong in Core/Contracts beside
//  `SyncFolder.inboxDirectoryName`. Until they land there this is Sync's only
//  copy; nothing else in this module re-types them.
//  ─────────────────────────────────────────────────────────────────────────────
//

import Foundation

/// The names of the files this module reads and writes inside the sync folder.
///
/// **Never fails.** Everything here is a pure string operation; there is no
/// filesystem access and nothing to be unavailable.
public enum SyncFileNames {

    /// `meta.json` — where a document came from (docs/05-file-contracts.md).
    public static let metadata = "meta.json"

    /// `document.pdf` — rendered or original, always present when there is one.
    public static let document = "document.pdf"

    /// `source.md` — the original markdown, when there was one.
    public static let sourceMarkdown = "source.md"

    /// `sourcemap.json` — rendered rect to source range, when generated.
    public static let sourceMap = "sourcemap.json"

    /// `reply.md` — what an agent writes back into a review directory
    /// (docs/04-flows.md § F6).
    public static let reply = "reply.md"

    /// Every file name an inbox directory may hold, in the order a reader
    /// should prefer them.
    public static let inboxFiles = [document, sourceMarkdown, sourceMap, metadata]

    /// The suffix every staging directory carries.
    ///
    /// The shared convention across all four writers of this folder is that a
    /// bundle is assembled in a **hidden sibling** directory and renamed into
    /// place, and that "dot-prefixed entries are staging and must be ignored by
    /// every watcher" (integrations/README.md § Conventions).
    public static let stagingSuffix = ".tmp"

    /// `.2026-08-18-auth-refactor-plan.4F2C….tmp` — a hidden sibling of the
    /// directory being built.
    ///
    /// - Parameters:
    ///   - finalName: the name the directory will have after the rename.
    ///   - token: anything unique to this attempt; a UUID string in practice,
    ///     so two processes staging the same bundle cannot collide.
    public static func stagingName(for finalName: String, token: String) -> String {
        ".\(finalName).\(token)\(stagingSuffix)"
    }

    /// Whether a directory entry is somebody's staging, and therefore invisible
    /// to every scan in this module.
    ///
    /// Dot-prefixed rather than suffix-matched on purpose: it also skips
    /// `.DS_Store`, `.Trash`, provider bookkeeping and anything else a
    /// filesystem leaves lying about.
    public static func isHidden(_ name: String) -> Bool {
        name.hasPrefix(".")
    }
}
