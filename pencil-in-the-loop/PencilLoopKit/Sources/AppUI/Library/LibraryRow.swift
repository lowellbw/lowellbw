//
//  LibraryRow.swift
//  AppUI · Library
//
//  One row of the sidebar. Title, subtitle, and a trailing indicator that is a
//  dot rather than a badge (docs/02-spec.md § S1).
//

import SwiftUI
import Core

/// A single document in the library list.
///
/// Three appearances, one layout:
///
/// - **Local.** Ordinary row, nothing trailing. A library where everything is
///   downloaded — the normal state, since documents are pinned on arrival — is
///   then a list of titles rather than a field of dots.
/// - **Downloading.** A `circle.fill` in tertiary, small enough to read as
///   punctuation. The row does not open; the caller disables it.
/// - **Unavailable.** The reason on its own line and a quiet
///   `exclamationmark.circle`. A document that could not be ingested shows as
///   an error row and never as a missing one (docs/04-flows.md § F1).
///
/// **On failure:** there is nothing to fail. The row renders whatever summary
/// it is given, including one with no origin and no pages.
struct LibraryRow: View {

    let summary: DocumentSummary

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        layout
            .accessibilityElement(children: .combine)
            .accessibilityLabel(LibraryFormat.accessibilityLabel(for: summary))
            .accessibilityHint(hint)
    }

    /// The indicator sits beside the text normally and under it at accessibility
    /// sizes, where a fixed trailing column would squeeze the title to two
    /// characters a line (docs/01-design-principles.md § 8).
    @ViewBuilder private var layout: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 4) {
                text
                indicator
            }
        } else {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                text
                Spacer(minLength: 0)
                indicator
            }
        }
    }

    private var text: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(summary.title)
                .font(.body)
                .foregroundStyle(summary.isLocal ? Color.primary : Color.secondary)
                .lineLimit(2)
            Text(LibraryFormat.subtitle(for: summary))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if case let .unavailable(reason) = summary.localState {
                Text(reason)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder private var indicator: some View {
        switch summary.localState {
        case .local:
            EmptyView()
        case .downloading:
            Image(systemName: "circle.fill")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        case .unavailable:
            Image(systemName: "exclamationmark.circle")
                .font(.body)
                .foregroundStyle(.secondary)
        }
    }

    private var hint: String {
        switch summary.localState {
        case .local:
            return ""
        case .downloading:
            return "Not yet downloaded. It opens once it arrives."
        case .unavailable:
            return "This document could not be read and cannot be opened."
        }
    }
}

#Preview("Rows") {
    List {
        ForEach(DocumentSummary.previewSamples) { summary in
            LibraryRow(summary: summary)
        }
        LibraryRow(
            summary: DocumentSummary(
                id: UUID(),
                title: "2026-08-18-broken-export",
                originDisplayName: OriginKind.claudeCode.displayName,
                addedAt: Date(timeIntervalSince1970: 1_787_000_000),
                pageCount: 0,
                state: .unread,
                localState: .unavailable(reason: "source.md could not be rendered."),
                commentCount: 0,
                hasInk: false,
                folderName: "2026-08-18-broken-export"
            )
        )
    }
    .listStyle(.insetGrouped)
}
