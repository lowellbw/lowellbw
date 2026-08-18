//
//  InboxScanner.swift
//  Sync · Scan
//
//  Walks `inbox/` and says what is in it. It reads directory entries and file
//  sizes; it does not open a PDF, parse markdown or decide whether a document
//  is any good. That is `DocumentIngesting`'s job, and keeping the two apart is
//  what lets a scan run every fifteen seconds without costing anything.
//
//  An actor rather than a struct for one reason: it remembers the modification
//  date it last saw for each folder, which is how a folder that was rewritten
//  in place gets noticed while a folder that has not changed is skipped
//  (Protocols.swift § InboxScanning).
//

import Foundation
import Core

/// `InboxScanning`, over `FileManager` and `NSFileCoordinator`.
///
/// **On failure:** throws `.folderUnavailable` when `inbox/` itself cannot be
/// read. A single unreadable subdirectory is logged and skipped, never
/// propagated — one bad folder must not stop the scan.
///
/// Scanning is cheap and idempotent. Pull-to-refresh calls it, the watcher
/// calls it, and first launch calls it.
public actor InboxScanner: InboxScanning {

    /// Folder name to the modification date this scanner last reported for it.
    /// In memory only: on a cold start every known folder is reported once, and
    /// the coordinator decides from its pinned copy whether there is anything
    /// to do (`InboxItemPinner.isPinnedAndCurrent(_:)`).
    private var lastSeen: [String: Date] = [:]

    public init() {}

    /// - Parameters:
    ///   - folder: the sync root. The caller must already hold access.
    ///   - knownFolderNames: names already in the library. A known folder is
    ///     skipped unless its contents changed since this scanner last looked.
    /// - Returns: items in folder-name order, which is chronological given the
    ///   date prefix.
    /// - Throws: `.folderUnavailable` when `inbox/` cannot be listed.
    public func scan(_ folder: SyncFolder, knownFolderNames: Set<String>) async throws -> [InboxItem] {
        let entries: [URL]
        do {
            entries = try CoordinatedFileAccess.read(at: folder.inboxURL) { readableURL in
                try FileManager.default.contentsOfDirectory(
                    at: readableURL,
                    includingPropertiesForKeys: [.isDirectoryKey, .contentModificationDateKey],
                    options: [.skipsHiddenFiles]
                )
            }
        } catch {
            throw PencilLoopError.folderUnavailable(
                reason: "\(SyncFolder.inboxDirectoryName) could not be read. \(error.localizedDescription)"
            )
        }

        var found: [InboxItem] = []
        for entry in entries.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
            let name = entry.lastPathComponent
            if SyncFileNames.isHidden(name) { continue }
            guard InboxScanner.isDirectory(entry) else { continue }

            let item: InboxItem?
            do {
                item = try await self.item(at: entry)
            } catch {
                // One unreadable directory is skipped, never propagated
                // (Protocols.swift § InboxScanning).
                SyncLog.scan.error("Skipping \(name): \(error.localizedDescription)")
                continue
            }
            guard let item else { continue }

            let previous = lastSeen[item.folderName]
            lastSeen[item.folderName] = item.modifiedAt

            if knownFolderNames.contains(item.folderName) {
                // Known and unchanged since we last looked: nothing to do.
                if let previous, previous >= item.modifiedAt { continue }
            }
            found.append(item)
        }
        return found
    }

    /// Examines one directory, for the watcher's targeted case.
    ///
    /// - Returns: nil when the directory holds nothing ingestible — no
    ///   `document.pdf` and no `source.md`. A directory with only a `meta.json`
    ///   in it is a directory somebody is still writing.
    /// - Throws: the underlying error when the directory cannot be listed at
    ///   all. Callers scanning a whole inbox catch and skip.
    public func item(at directoryURL: URL) async throws -> InboxItem? {
        let contents = try CoordinatedFileAccess.read(at: directoryURL) { readableURL in
            try FileManager.default.contentsOfDirectory(
                at: readableURL,
                includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey, .isDirectoryKey],
                options: []
            )
        }

        var byName: [String: URL] = [:]
        var newest = InboxScanner.modificationDate(of: directoryURL) ?? Date(timeIntervalSince1970: 0)
        var bytes: Int64 = 0

        for file in contents {
            let name = file.lastPathComponent
            if SyncFileNames.isHidden(name) { continue }
            byName[name] = file
            if let modified = InboxScanner.modificationDate(of: file), modified > newest {
                newest = modified
            }
            bytes += InboxScanner.byteCount(of: file)
        }

        let item = InboxItem(
            folderName: directoryURL.lastPathComponent,
            directoryURL: directoryURL,
            pdfURL: byName[SyncFileNames.document],
            sourceMarkdownURL: byName[SyncFileNames.sourceMarkdown],
            sourceMapURL: byName[SyncFileNames.sourceMap],
            metaURL: byName[SyncFileNames.metadata],
            modifiedAt: newest,
            byteCount: bytes
        )
        guard item.isIngestible else { return nil }
        return item
    }

    /// Forgets what this scanner has seen, so the next scan reports every
    /// folder again. The coordinator calls it when the folder becomes
    /// unavailable, because anything could have happened while we were not
    /// looking.
    public func forgetSeenFolders() {
        lastSeen.removeAll()
    }

    /// Every directory name currently in `inbox/`.
    ///
    /// Synchronous, total, and the set `Slug.disambiguated(_:existing:)` is
    /// given whenever this app writes a new directory of its own — a reply
    /// opened as a document, or an item imported from the share extension's
    /// staging area. An unreadable inbox answers with an empty set rather than
    /// failing: the worst case is a name collision, and
    /// `Slug.disambiguated(_:existing:)` is what protects against that.
    ///
    /// - Parameter folder: the sync root. The caller must already hold access.
    public static func folderNames(in folder: SyncFolder) -> Set<String> {
        guard let entries = try? FileManager.default.contentsOfDirectory(
            at: folder.inboxURL,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else {
            return []
        }
        return Set(
            entries
                .map { $0.lastPathComponent }
                .filter { SyncFileNames.isHidden($0) == false }
        )
    }

    // MARK: - Internals

    private static func isDirectory(_ url: URL) -> Bool {
        let values = try? url.resourceValues(forKeys: [.isDirectoryKey])
        return values?.isDirectory == true
    }

    private static func modificationDate(of url: URL) -> Date? {
        let values = try? url.resourceValues(forKeys: [.contentModificationDateKey])
        return values?.contentModificationDate
    }

    private static func byteCount(of url: URL) -> Int64 {
        let values = try? url.resourceValues(forKeys: [.fileSizeKey])
        guard let size = values?.fileSize else { return 0 }
        return Int64(size)
    }
}
