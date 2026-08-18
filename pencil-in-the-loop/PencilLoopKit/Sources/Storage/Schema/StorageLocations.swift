//
//  StorageLocations.swift
//  Storage
//
//  The on-disk layout. One place that knows where the store file lives, where a
//  pinned document lives, and how an absolute URL becomes something safe to
//  persist.
//
//  Why paths are stored relative: the app container's absolute path contains a
//  UUID the system regenerates on reinstall and, historically, across some OS
//  upgrades. A `URL` written into the store today can therefore point at nothing
//  tomorrow, and the symptom is a library full of documents that will not open —
//  which is exactly the failure "always local" exists to prevent
//  (docs/02-spec.md § Cross-cutting). So the store keeps container-relative
//  paths and resolves them on every read.
//

import Foundation

/// Where everything Storage owns lives on disk.
///
/// **On failure:** every member returns a URL rather than throwing. When the
/// system will not hand over Application Support — which should not happen on a
/// device — the temporary directory is used instead, so the app still runs and
/// the failure shows up as an empty library rather than a crash on launch.
public enum StorageLocations {

    /// Container subdirectory for everything this app persists.
    public static let directoryName = "PencilLoop"

    /// Where pinned document folders live, one directory per document.
    public static let documentsDirectoryName = "Documents"

    /// The SwiftData store file.
    public static let storeFileName = "Library.store"

    /// `Application Support/PencilLoop`, created if absent.
    public static func containerRoot() -> URL {
        let manager = FileManager.default
        let base = manager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? manager.temporaryDirectory
        let root = base.appendingPathComponent(directoryName, isDirectory: true)
        ensureDirectory(root)
        return root
    }

    /// `Application Support/PencilLoop/Documents`, created if absent.
    ///
    /// Ingest materialises each document into `documentsRoot()/<folderName>/`
    /// and hands Storage the absolute URLs; Storage stores them relative to this
    /// directory.
    public static func documentsRoot() -> URL {
        let root = containerRoot().appendingPathComponent(documentsDirectoryName, isDirectory: true)
        ensureDirectory(root)
        return root
    }

    /// The pinned directory for one document folder name, e.g.
    /// `…/Documents/2026-08-18-auth-refactor-plan`.
    ///
    /// Not created here — Ingest creates it when it copies the bytes in.
    public static func documentDirectory(folderName: String) -> URL {
        documentsRoot().appendingPathComponent(folderName, isDirectory: true)
    }

    /// The SwiftData store file URL.
    public static func storeURL() -> URL {
        containerRoot().appendingPathComponent(storeFileName, isDirectory: false)
    }

    /// Turns an absolute URL into the string the store persists.
    ///
    /// - Returns: a path relative to `documentsRoot()` when the URL is inside
    ///   it, and the absolute path otherwise. An absolute result is legal — a
    ///   document pinned somewhere unusual still has to be findable — but it is
    ///   the case that does not survive a reinstall, so Ingest should keep
    ///   everything under `documentsRoot()`.
    public static func storedPath(for url: URL) -> String {
        let root = documentsRoot().standardizedFileURL.path(percentEncoded: false)
        let prefix = root.hasSuffix("/") ? root : root + "/"
        let candidate = url.standardizedFileURL.path(percentEncoded: false)
        if candidate.hasPrefix(prefix) {
            return String(candidate.dropFirst(prefix.count))
        }
        return candidate
    }

    /// The inverse of `storedPath(for:)`.
    ///
    /// - Returns: `documentsRoot()` itself for an empty path. A row with no
    ///   pinned bytes — one recorded by `recordIngestFailure` — has an empty
    ///   path, and callers must check `DocumentSummary.isLocal` before opening
    ///   anything (docs/02-spec.md § S1).
    public static func url(forStoredPath path: String) -> URL {
        guard !path.isEmpty else { return documentsRoot() }
        if path.hasPrefix("/") { return URL(fileURLWithPath: path) }
        return documentsRoot().appendingPathComponent(path)
    }

    /// True when `url` sits inside the app's own documents root.
    ///
    /// Every destructive operation checks this first: `purgeArchived()` deletes
    /// files, and it must never be able to reach the user's sync folder.
    public static func isInsideDocumentsRoot(_ url: URL) -> Bool {
        let root = documentsRoot().standardizedFileURL.path(percentEncoded: false)
        let prefix = root.hasSuffix("/") ? root : root + "/"
        return url.standardizedFileURL.path(percentEncoded: false).hasPrefix(prefix)
    }

    /// Total bytes of every regular file under `url`, following no symlinks.
    ///
    /// - Returns: zero for a directory that does not exist or cannot be read.
    ///   Sizes are advisory (Settings shows them); an unreadable file is skipped
    ///   rather than reported.
    public static func byteCount(at url: URL) -> Int64 {
        let manager = FileManager.default
        var isDirectory = false
        if let values = try? url.resourceValues(forKeys: [.isDirectoryKey]) {
            isDirectory = values.isDirectory ?? false
        } else {
            return 0
        }
        if isDirectory == false {
            return fileSize(of: url)
        }
        guard let enumerator = manager.enumerator(
            at: url,
            includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey]
        ) else {
            return 0
        }
        var total: Int64 = 0
        for case let child as URL in enumerator {
            total += fileSize(of: child)
        }
        return total
    }

    /// Size of one regular file, or zero for anything else.
    public static func fileSize(of url: URL) -> Int64 {
        guard let values = try? url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey]),
              values.isRegularFile == true,
              let size = values.fileSize else {
            return 0
        }
        return Int64(size)
    }

    private static func ensureDirectory(_ url: URL) {
        let manager = FileManager.default
        if manager.fileExists(atPath: url.path(percentEncoded: false)) { return }
        try? manager.createDirectory(at: url, withIntermediateDirectories: true)
    }
}
