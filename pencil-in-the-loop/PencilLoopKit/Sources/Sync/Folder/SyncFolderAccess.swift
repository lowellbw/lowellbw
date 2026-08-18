//
//  SyncFolderAccess.swift
//  Sync · Folder
//
//  Security-scoped access to the folder the user picked in S0, and the
//  bookmark that survives a relaunch.
//
//  Two things this file is careful about, because both are bugs that take an
//  afternoon to find:
//
//  1. **Every start is balanced by a stop, on every path.** `defer` does it, so
//     a throw in the middle cannot leak a scope. A leaked scope does not fail
//     loudly; it exhausts a per-process limit hours later, in a different
//     feature.
//  2. **A URL that is not security-scoped is not an error.** A plain file URL —
//     an App Group container, the app's own container, a temp directory in a
//     test — returns `false` from `startAccessingSecurityScopedResource()` and
//     needs no scope at all. Treating that as `.accessDenied` would make the
//     whole module untestable and would break the App Group import path.
//

import Foundation
import Core

/// `FolderAccessing`, over `startAccessingSecurityScopedResource` and
/// `URL.bookmarkData()`.
///
/// **On failure:** `prepareFolder(at:)` throws `.accessDenied` when the scope
/// will not open and the URL is not readable without one, and
/// `.folderUnavailable` when `inbox/` and `outbox/` cannot be created.
/// `resolveFolder(bookmark:)` throws `.bookmarkStale` when the bookmark
/// resolved but has gone stale, and `.folderUnavailable` when it will not
/// resolve at all. None of these may make an already ingested document
/// unreadable — documents live in the app container, and losing the folder
/// costs new documents only (docs/02-spec.md § Cross-cutting).
///
/// - Note: `beginAccess(to:)` / `endAccess(to:wasStarted:)` are not part of
///   `FolderAccessing`. They exist because the protocol's `withAccess` takes a
///   synchronous closure, and scanning, pinning and writing all `await` in the
///   middle. See the type's own documentation for the rule.
public struct SyncFolderAccess: FolderAccessing {

    public init() {}

    // MARK: - FolderAccessing

    /// Takes the URL from `fileImporter`, creates `inbox/` and `outbox/` if
    /// absent, and mints a security-scoped bookmark.
    ///
    /// - Parameter url: exactly what the picker returned. Do not normalise it
    ///   first — a bookmark minted from a rewritten URL may not resolve.
    /// - Returns: the folder, with `bookmark` populated when one could be
    ///   minted. A nil bookmark is survivable for this launch and means the
    ///   user will be asked again on the next one.
    /// - Throws: `.accessDenied` when the scope will not open,
    ///   `.folderUnavailable` when the directories cannot be created.
    public func prepareFolder(at url: URL) throws -> SyncFolder {
        let started = url.startAccessingSecurityScopedResource()
        defer {
            if started {
                url.stopAccessingSecurityScopedResource()
            }
        }

        guard started || FileManager.default.isReadableFile(atPath: url.path) else {
            throw PencilLoopError.accessDenied(path: url.path)
        }

        var folder = SyncFolder(rootURL: url)
        do {
            try createDirectoryIfAbsent(at: folder.inboxURL)
            try createDirectoryIfAbsent(at: folder.outboxURL)
        } catch {
            throw PencilLoopError.folderUnavailable(
                reason: "\(SyncFolder.inboxDirectoryName) and \(SyncFolder.outboxDirectoryName) could not be created. \(error.localizedDescription)"
            )
        }

        folder.bookmark = SyncFolderAccess.bookmark(for: url)
        if folder.bookmark == nil {
            SyncLog.folder.error("The sync folder was prepared but no bookmark could be minted.")
        }
        return folder
    }

    /// Resolves a persisted bookmark.
    ///
    /// - Throws: `.bookmarkStale` when the bookmark resolved but is stale — the
    ///   caller mints a fresh one from the returned folder and saves it, which
    ///   in this implementation means calling `refreshedFolder(bookmark:)`,
    ///   since a throwing function has no folder to return.
    ///   `.folderUnavailable` when it cannot be resolved at all.
    public func resolveFolder(bookmark: Data) throws -> SyncFolder {
        var isStale = false
        let url: URL
        do {
            url = try URL(resolvingBookmarkData: bookmark, bookmarkDataIsStale: &isStale)
        } catch {
            throw PencilLoopError.folderUnavailable(
                reason: "The saved folder could not be reopened. \(error.localizedDescription)"
            )
        }
        if isStale {
            throw PencilLoopError.bookmarkStale
        }
        return SyncFolder(rootURL: url, bookmark: bookmark)
    }

    /// Runs `body` with the security scope open, closing it afterwards even if
    /// `body` throws.
    ///
    /// - Note: not re-entrant. Do not call it from inside another
    ///   `withAccess`/`beginAccess` for the same folder — the scope is a
    ///   counted resource and a nested pair closes it out from under the outer
    ///   one on some providers.
    /// - Throws: `.accessDenied` when the scope will not open and the root is
    ///   not readable without one; otherwise whatever `body` threw.
    public func withAccess<T: Sendable>(
        to folder: SyncFolder,
        perform body: @Sendable (SyncFolder) throws -> T
    ) throws -> T {
        let started = beginAccess(to: folder)
        defer { endAccess(to: folder, wasStarted: started) }

        guard started || FileManager.default.isReadableFile(atPath: folder.rootURL.path) else {
            throw PencilLoopError.accessDenied(path: folder.rootURL.path)
        }
        return try body(folder)
    }

    /// Whether the root is reachable right now.
    ///
    /// Never throws: a false answer is information — an ejected volume, a
    /// signed-out provider — and the app carries on reading what it already
    /// has.
    public func isReachable(_ folder: SyncFolder) -> Bool {
        let started = beginAccess(to: folder)
        defer { endAccess(to: folder, wasStarted: started) }
        return SyncFolderAccess.isDirectory(folder.rootURL)
    }

    // MARK: - Access that spans an await

    /// Opens the security scope and reports whether it actually opened.
    ///
    /// Pair it with `endAccess(to:wasStarted:)` in a `defer`, always, and pass
    /// the value this returned — Apple's rule is that only a `true` from
    /// `startAccessingSecurityScopedResource()` may be balanced by a stop.
    ///
    /// `false` is not a failure. It is what a plain file URL returns, and the
    /// caller should carry on if the root is readable.
    @discardableResult
    public func beginAccess(to folder: SyncFolder) -> Bool {
        folder.rootURL.startAccessingSecurityScopedResource()
    }

    /// Closes a scope opened by `beginAccess(to:)`. A no-op when `wasStarted`
    /// is false, which is the only correct behaviour.
    public func endAccess(to folder: SyncFolder, wasStarted: Bool) {
        guard wasStarted else { return }
        folder.rootURL.stopAccessingSecurityScopedResource()
    }

    /// Whether the root is usable once the scope is already open.
    ///
    /// For callers inside a `beginAccess`/`endAccess` pair, where
    /// `isReachable(_:)` would open a second, nested scope.
    public func isReachableWithinOpenScope(_ folder: SyncFolder) -> Bool {
        SyncFolderAccess.isDirectory(folder.rootURL)
    }

    // MARK: - Recovery

    /// Re-resolves a stale bookmark and mints a fresh one.
    ///
    /// The companion to `resolveFolder(bookmark:)` throwing `.bookmarkStale`:
    /// the contract says the caller "mints a fresh one from the returned
    /// folder", and a throwing function returns nothing, so the minting lives
    /// here. Persist `folder.bookmark` afterwards.
    ///
    /// - Throws: `.folderUnavailable` when the bookmark will not resolve even
    ///   in stale form.
    public func refreshedFolder(bookmark: Data) throws -> SyncFolder {
        var isStale = false
        let url: URL
        do {
            url = try URL(resolvingBookmarkData: bookmark, bookmarkDataIsStale: &isStale)
        } catch {
            throw PencilLoopError.folderUnavailable(
                reason: "The saved folder could not be reopened. \(error.localizedDescription)"
            )
        }
        let started = url.startAccessingSecurityScopedResource()
        defer {
            if started {
                url.stopAccessingSecurityScopedResource()
            }
        }
        let minted = SyncFolderAccess.bookmark(for: url) ?? bookmark
        return SyncFolder(rootURL: url, bookmark: minted)
    }

    /// Creates `inbox/` and `outbox/` inside an already-open scope.
    ///
    /// `prepareFolder(at:)` does this on first run; the watcher and the
    /// coordinator call it again when a folder comes back with its directories
    /// missing, which is what happens when a provider re-creates a root.
    ///
    /// - Throws: `.folderUnavailable` when either directory cannot be created.
    public func ensureDirectories(in folder: SyncFolder) throws {
        do {
            try createDirectoryIfAbsent(at: folder.inboxURL)
            try createDirectoryIfAbsent(at: folder.outboxURL)
        } catch {
            throw PencilLoopError.folderUnavailable(
                reason: "\(SyncFolder.inboxDirectoryName) and \(SyncFolder.outboxDirectoryName) could not be created. \(error.localizedDescription)"
            )
        }
    }

    // MARK: - Internals

    /// `URL.bookmarkData()` with no options, which is what makes a
    /// security-scoped bookmark on iOS — `.withSecurityScope` is a macOS-only
    /// option and passing it here fails.
    private static func bookmark(for url: URL) -> Data? {
        do {
            return try url.bookmarkData()
        } catch {
            SyncLog.folder.error("Minting a bookmark failed: \(error.localizedDescription)")
            return nil
        }
    }

    private static func isDirectory(_ url: URL) -> Bool {
        let values = try? url.resourceValues(forKeys: [.isDirectoryKey])
        return values?.isDirectory == true
    }

    private func createDirectoryIfAbsent(at url: URL) throws {
        if SyncFolderAccess.isDirectory(url) { return }
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    }
}
