//
//  SettingsView.swift
//  AppUI · Settings
//
//  S6. Deliberately short (docs/02-spec.md § S6): sync folder, page tint, ink
//  defaults, transcription language, the inked-pages default, and storage.
//  Plus the one speech row docs/03-architecture.md § 4 asks for. Nothing else —
//  the spec means "nothing else" literally.
//

import SwiftUI
import UIKit
import UniformTypeIdentifiers
import Core
import Annotate

/// The settings sheet.
///
/// Presented from the library toolbar. An inset-grouped `List`, a `Done`
/// button, and no Save button anywhere: every row writes through as it changes
/// (docs/02-spec.md § Cross-cutting).
///
/// **On failure:** a write that throws leaves the row where the user put it and
/// explains itself in the footer. Nothing here can fail in a way that stops the
/// app reading documents.
public struct SettingsView: View {

    private let folderAccess: any FolderAccessing

    @State private var model: SettingsModel
    @State private var isChoosingFolder = false
    @State private var isConfirmingPurge = false

    @Environment(\.dismiss) private var dismiss

    /// - Parameters:
    ///   - environment: every dependency the rows read or write.
    ///   - folderAccess: prepares a newly chosen folder. Not on
    ///     `AppEnvironment` yet — see this unit's report.
    public init(environment: any AppEnvironment, folderAccess: any FolderAccessing) {
        self.folderAccess = folderAccess
        _model = State(initialValue: SettingsModel(environment: environment))
    }

    public var body: some View {
        NavigationStack {
            List {
                folderSection
                readingSection
                inkSection
                dictationSection
                reviewSection
                storageSection
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .task {
                await model.load()
            }
            .fileImporter(isPresented: $isChoosingFolder, allowedContentTypes: [.folder]) { result in
                self.handle(result)
            }
        }
    }

    // MARK: - Sections

    private var folderSection: some View {
        Section("Sync Folder") {
            ValueRow(title: "Folder", value: model.settings.syncFolderDisplayName ?? "Not chosen")
            Button("Change Folder…") {
                isChoosingFolder = true
            }
        }
    }

    private var readingSection: some View {
        Section("Reading") {
            Picker("Page Tint", selection: binding(\.pageTint)) {
                ForEach(PageTint.allCases, id: \.self) { tint in
                    Text(tint.displayName).tag(tint)
                }
            }
        }
    }

    private var inkSection: some View {
        Section("Ink") {
            Picker("Tool", selection: binding(\.ink.tool)) {
                ForEach(InkToolKind.allCases, id: \.self) { tool in
                    Text(SettingsView.name(for: tool)).tag(tool)
                }
            }
            Picker("Ink", selection: inkTint) {
                ForEach(InkPalette.allCases, id: \.self) { palette in
                    Label {
                        Text(palette.displayName)
                    } icon: {
                        Image(systemName: "circle.fill")
                            .foregroundStyle(Color(uiColor: palette.uiTint))
                    }
                    .tag(palette)
                }
            }
            Stepper(value: binding(\.ink.widthPoints), in: 1...12, step: 0.5) {
                ValueRow(title: "Width", value: model.settings.ink.widthPoints.formatted() + " pt")
            }
        }
    }

    private var dictationSection: some View {
        Section("Dictation") {
            Picker("Language", selection: binding(\.transcriptionLocaleIdentifier)) {
                ForEach(languageIdentifiers, id: \.self) { identifier in
                    Text(SettingsView.languageName(identifier)).tag(identifier)
                }
            }
            if let line = model.speechAssetLine {
                HStack {
                    Text(line)
                        .font(.body)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 12)
                    if model.isDownloadingSpeechAssets {
                        ProgressView()
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(line)
            }
        }
    }

    private var reviewSection: some View {
        Section("Reviews") {
            Toggle("Send inked pages as images", isOn: binding(\.sendInkedPagesAsImages))
        }
    }

    private var storageSection: some View {
        Section {
            ValueRow(title: "Documents", value: model.storageBytes.formatted(.byteCount(style: .file)))
            Button("Purge Archived…") {
                isConfirmingPurge = true
            }
            .confirmationDialog(
                "Delete archived documents and their files?",
                isPresented: $isConfirmingPurge,
                titleVisibility: .visible
            ) {
                Button("Delete Archived", role: .destructive) {
                    Task { await self.model.purge() }
                }
                Button("Cancel", role: .cancel) {}
            }
        } header: {
            Text("Storage")
        } footer: {
            if let status = model.statusMessage {
                Text(status)
            }
        }
    }

    // MARK: - Bindings

    /// One row's worth of `AppSettings`, written through on change.
    private func binding<Value>(_ keyPath: WritableKeyPath<AppSettings, Value>) -> Binding<Value> {
        Binding(
            get: { self.model.settings[keyPath: keyPath] },
            set: { updated in
                self.model.change { settings in
                    settings[keyPath: keyPath] = updated
                }
            }
        )
    }

    /// The ink colour, stored as the hex `InkDefaults` persists and offered as
    /// the five named inks (docs/01-design-principles.md § Specific choices).
    /// A hex the palette does not know — the user picked something else in the
    /// tool picker, which they are allowed to do — reads back as graphite.
    private var inkTint: Binding<InkPalette> {
        Binding(
            get: { InkPalette.palette(forHex: self.model.settings.ink.tintHex) ?? .standard },
            set: { palette in
                self.model.change { settings in
                    settings.ink.tintHex = palette.tintHex
                }
            }
        )
    }

    // MARK: - Language list

    /// The locales offered, with whatever is currently set kept in the list even
    /// when it is not one of them.
    ///
    /// A curated list because nothing in the contracts reports which locales the
    /// transcriber has — see this unit's report.
    private var languageIdentifiers: [String] {
        var identifiers = SettingsView.offeredLocaleIdentifiers
        let current = model.settings.transcriptionLocaleIdentifier
        if identifiers.contains(current) == false {
            identifiers.insert(current, at: 0)
        }
        return identifiers
    }

    private static let offeredLocaleIdentifiers = [
        "en-GB", "en-US", "en-AU", "en-IN", "fr-FR", "de-DE", "es-ES", "it-IT",
        "pt-BR", "nl-NL", "sv-SE", "ja-JP", "ko-KR", "zh-CN"
    ]

    private static func languageName(_ identifier: String) -> String {
        Locale.current.localizedString(forIdentifier: identifier) ?? identifier
    }

    /// `InkToolKind` is a persisted vocabulary and carries no display names of
    /// its own; naming them is a UI decision, so it is made here.
    private static func name(for tool: InkToolKind) -> String {
        switch tool {
        case .pen: return "Pen"
        case .pencil: return "Pencil"
        case .marker: return "Marker"
        case .monoline: return "Monoline"
        case .highlighter: return "Highlighter"
        }
    }

    private func handle(_ result: Result<URL, any Error>) {
        switch result {
        case let .success(url):
            Task { await self.model.adoptFolder(url, folderAccess: self.folderAccess) }
        case let .failure(error):
            model.report(SyncFolderChoice.describe(error))
        }
    }

    // MARK: - Rows

    /// A label and its value. One line normally; two at accessibility text
    /// sizes, where a trailing value would otherwise be squeezed to nothing
    /// (docs/01-design-principles.md § 8).
    private struct ValueRow: View {

        let title: String
        let value: String

        @Environment(\.dynamicTypeSize) private var dynamicTypeSize

        var body: some View {
            layout
                .accessibilityElement(children: .combine)
                .accessibilityLabel(title + ", " + value)
        }

        @ViewBuilder private var layout: some View {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.body)
                    Text(value)
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
            } else {
                HStack {
                    Text(title)
                        .font(.body)
                    Spacer(minLength: 12)
                    Text(value)
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

#Preview("Settings") {
    SettingsView(
        environment: PreviewEnvironment(
            settings: AppSettings(
                syncFolderDisplayName: "PencilLoop",
                hasCompletedFirstRun: true
            )
        ),
        folderAccess: PreviewFolderAccess()
    )
}

#Preview("Speech assets downloading") {
    SettingsView(
        environment: PreviewEnvironment(
            speechAssetState: .downloading(progress: 0.4),
            settings: AppSettings(
                syncFolderDisplayName: "PencilLoop",
                hasCompletedFirstRun: true
            )
        ),
        folderAccess: PreviewFolderAccess()
    )
}
