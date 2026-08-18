//
//  LibraryView.swift
//  AppUI · Library
//
//  S1. The sidebar of the app's one `NavigationSplitView` (docs/02-spec.md §
//  S1, docs/01-design-principles.md § 3).
//

import SwiftUI
import UniformTypeIdentifiers
import Core

/// The library sidebar and the split view that holds it.
///
/// The detail column is supplied by the caller: the reader is another unit's
/// screen, and the library has no business knowing its type. Wave 3 passes the
/// reader; a preview passes a placeholder.
///
/// The generic parameter is a single letter because
/// `tooling/lint/check_decls.py` reads any capitalised word of three or more
/// characters as a type reference, and a generic parameter is declared nowhere.
///
/// **Offline:** everything here works with no network. Rows that are not yet
/// local are dimmed and disabled rather than failing on tap, rows that failed
/// to ingest show their reason, and pull-to-refresh reports a folder it cannot
/// reach in the status line instead of blocking the list
/// (docs/02-spec.md § S1).
public struct LibraryView<T: View>: View {

    private let environment: any AppEnvironment
    private let folderAccess: any FolderAccessing
    private let detail: (DocumentSummary) -> T

    @State private var model: LibraryModel
    @State private var selection: UUID?
    @State private var isChoosingFolder = false
    @State private var isShowingSettings = false

    /// - Parameters:
    ///   - environment: the one route to every dependency.
    ///   - folderAccess: needed by the empty state's folder picker, which is the
    ///     recovery when the sync folder was never chosen or has gone away.
    ///     Not on `AppEnvironment` yet — see this unit's report.
    ///   - detail: the reader, built for whichever row is selected.
    public init(
        environment: any AppEnvironment,
        folderAccess: any FolderAccessing,
        @ViewBuilder detail: @escaping (DocumentSummary) -> T
    ) {
        self.environment = environment
        self.folderAccess = folderAccess
        self.detail = detail
        _model = State(initialValue: LibraryModel(environment: environment))
    }

    public var body: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            if let summary = model.summary(id: selection) {
                detail(summary)
            } else {
                Text("No Document Selected")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Sidebar

    private var sidebar: some View {
        List(selection: $selection) {
            ForEach(DocState.librarySections, id: \.self) { state in
                sectionView(for: state)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Library")
        .searchable(text: $model.searchText, prompt: "Search documents and notes")
        .refreshable {
            await model.refresh()
        }
        .overlay {
            emptyState
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                sortMenu
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    isShowingSettings = true
                } label: {
                    Label("Settings", systemImage: "gearshape")
                }
                .accessibilityLabel("Settings")
            }
            if let status = model.statusMessage {
                ToolbarItem(placement: .bottomBar) {
                    Text(status)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .task(id: model.reloadKey) {
            // Typing changes the key on every keystroke and `.task(id:)`
            // cancels the previous run, so this is a debounce rather than a
            // delay: only the last query in a burst reaches the store.
            if model.searchText.isEmpty == false {
                try? await Task.sleep(for: .milliseconds(200))
            }
            if Task.isCancelled == false {
                await model.load()
            }
        }
        .task {
            await model.observeSync()
        }
        .fileImporter(isPresented: $isChoosingFolder, allowedContentTypes: [.folder]) { result in
            self.adopt(result)
        }
        .sheet(isPresented: $isShowingSettings) {
            SettingsView(environment: environment, folderAccess: folderAccess)
        }
    }

    @ViewBuilder private func sectionView(for state: DocState) -> some View {
        let summaries = model.rows(in: state)
        if summaries.isEmpty == false {
            Section(state.displayName) {
                ForEach(summaries) { summary in
                    LibraryRow(summary: summary)
                        .tag(summary.id)
                        .selectionDisabled(summary.isLocal == false)
                        .swipeActions(edge: .trailing) {
                            Button {
                                Task { await self.model.archive(summary) }
                            } label: {
                                Label("Archive", systemImage: "archivebox")
                            }
                        }
                }
            }
        }
    }

    private var sortMenu: some View {
        Menu {
            Picker("Sort By", selection: $model.sort) {
                Text("Date Added").tag(LibrarySort.dateAdded)
                Text("Title").tag(LibrarySort.title)
            }
        } label: {
            Label("Sort", systemImage: "arrow.up.arrow.down")
        }
        .accessibilityLabel("Sort")
    }

    /// "No documents" in secondary label colour and the folder picker. Nothing
    /// else — no illustration, no headline (docs/01-design-principles.md § 6).
    @ViewBuilder private var emptyState: some View {
        if model.isLoaded && model.rows.isEmpty {
            VStack(spacing: 16) {
                if model.searchText.isEmpty {
                    Text("No documents")
                        .font(.body)
                        .foregroundStyle(.secondary)
                    Button("Choose Folder…") {
                        isChoosingFolder = true
                    }
                    .font(.body)
                } else {
                    Text("No Results")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
            }
            .multilineTextAlignment(.center)
            .padding()
        }
    }

    private func adopt(_ result: Result<URL, any Error>) {
        switch result {
        case let .success(url):
            Task {
                do {
                    _ = try await SyncFolderChoice.adopt(
                        url,
                        folderAccess: self.folderAccess,
                        settings: self.environment.settings
                    )
                    await self.model.refresh()
                } catch {
                    self.model.report(SyncFolderChoice.describe(error))
                }
            }
        case let .failure(error):
            model.report(SyncFolderChoice.describe(error))
        }
    }
}

#Preview("Library") {
    LibraryView(
        environment: PreviewEnvironment(summaries: DocumentSummary.previewSamples),
        folderAccess: PreviewFolderAccess()
    ) { summary in
        Text(summary.title)
            .font(.body)
    }
}

#Preview("Empty") {
    LibraryView(
        environment: PreviewEnvironment(),
        folderAccess: PreviewFolderAccess()
    ) { summary in
        Text(summary.title)
            .font(.body)
    }
}
