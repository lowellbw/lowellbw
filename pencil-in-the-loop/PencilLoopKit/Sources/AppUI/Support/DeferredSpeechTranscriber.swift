//
//  DeferredSpeechTranscriber.swift
//  AppUI · Support
//
//  The transcriber the environment holds, in front of the engine the factory
//  has not built yet.
//
//  ─── TWO PROBLEMS, ONE OBJECT ────────────────────────────────────────────────
//  1. `SpeechEngineFactory.makeEngine(settings:)` is `async` — it asks the
//     system which languages the analyser supports — and `AppEnvironment` is
//     built synchronously at launch, where nothing may await anything.
//  2. The dictation language is a setting (docs/02-spec.md § S6), and an engine
//     is built for one locale. Changing the language in Settings has to change
//     what the next comment is transcribed by, without anything having to
//     remember to rebuild an engine.
//
//  So the engine is built on first use, for whatever locale the settings say,
//  and rebuilt when that identifier changes. Cold-launch cost is nothing, and
//  the first press pays for it — which is what `prewarm()` is for, and the
//  comment gesture already calls that on touch-down, before the long press has
//  resolved (Core/Contracts/Protocols.swift § SpeechTranscribing).
//  ─────────────────────────────────────────────────────────────────────────────
//

import Foundation
import Annotate
import Core

/// A `SpeechTranscribing` that builds its engine when it is first needed, for
/// the language the user has chosen.
///
/// **On failure or unavailability:** identical to whatever engine it wraps —
/// `assetState()` reports it, `transcribe(contextualTerms:)` finishes the
/// stream with `PencilLoopError.speechUnavailable` or `.permissionDenied`, and
/// the comment popover still opens so the user can scribble instead. This type
/// adds no failure of its own: there is no path here that can refuse to produce
/// an engine, because `SpeechEngineFactory` always returns one.
public actor DeferredSpeechTranscriber: SpeechTranscribing {

    private let settings: any SettingsStoring
    private var engine: (any SpeechTranscribing)?

    /// The BCP-47 identifier the current engine was built for, so a language
    /// change in Settings is noticed without anyone announcing it.
    private var builtForIdentifier: String?

    public init(settings: any SettingsStoring) {
        self.settings = settings
    }

    // MARK: - SpeechTranscribing

    public func assetState() async -> SpeechAssetState {
        await current().assetState()
    }

    public func prepareAssets() async {
        await current().prepareAssets()
    }

    public func prewarm() async {
        await current().prewarm()
    }

    public func supportedLocales() async -> [Locale] {
        await current().supportedLocales()
    }

    /// The contract declares this synchronous, so the stream is returned at once
    /// and the engine is resolved inside it. A caller sees the same thing either
    /// way: a stream that yields when there is something to yield.
    public nonisolated func transcribe(
        contextualTerms: [String]
    ) -> AsyncThrowingStream<TranscriptionUpdate, Error> {
        AsyncThrowingStream { continuation in
            let work = Task {
                let engine = await self.current()
                do {
                    for try await update in engine.transcribe(contextualTerms: contextualTerms) {
                        continuation.yield(update)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { termination in
                // Only a consumer walking away means stop, exactly as the
                // engines themselves treat it: `.finished` is us finishing the
                // stream, and tearing the microphone down on that would pull it
                // out from under the recording that replaced this one.
                guard case .cancelled = termination else { return }
                work.cancel()
                Task { _ = await self.stop() }
            }
        }
    }

    public func stop() async -> String {
        guard let engine else { return "" }
        return await engine.stop()
    }

    // MARK: - Internals

    /// The engine for the language currently chosen, building or rebuilding it
    /// if the choice has moved.
    ///
    /// A rebuild stops the old engine first. It cannot be recording — a
    /// language cannot be changed from inside the comment popover — but an
    /// engine that has been pre-warmed holds an audio session, and leaking one
    /// of those is how the microphone indicator stays on.
    private func current() async -> any SpeechTranscribing {
        let identifier = await settings.settings.transcriptionLocaleIdentifier
        if let engine, builtForIdentifier == identifier {
            return engine
        }
        if let engine {
            _ = await engine.stop()
        }
        let built = await SpeechEngineFactory.makeEngine(locale: Locale(identifier: identifier))
        engine = built
        builtForIdentifier = identifier
        return built
    }
}
