//
//  MicrophoneCapture.swift
//  Annotate · Speech
//
//  One audio session and one input tap, shared by both engines. It exists
//  separately from either of them for two reasons: the 400ms budget
//  (docs/03-architecture.md § Performance targets) is spent almost entirely
//  here, and whichever engine gets deleted, this survives.
//

import Foundation
import AVFoundation
import os
import Core

/// The microphone, as an actor.
///
/// **Pre-warming is the whole point.** Configuring and activating an
/// `AVAudioSession` and starting an `AVAudioEngine` are the slow parts of
/// starting to record, and they are slow in the tens of milliseconds, which is
/// most of a 400ms budget that also has to cover the recogniser producing its
/// first hypothesis. So the work is split: `prewarm()` does everything that can
/// be done before the user has committed to speaking, and `start()` does only
/// what cannot.
///
/// **The trade-off, stated plainly.** Pre-warming activates the audio session
/// early, which ducks other audio and can show the system recording indicator
/// before a word is said, and it holds the session until `stop()`. That is why
/// `VoiceRecordingMachine` only pre-warms on a gesture that is already
/// plausibly a comment, never on every Pencil touch, and why every path out of
/// the machine ends in `.releaseCapture`.
///
/// **On failure:** throws `PencilLoopError.speechUnavailable`. Never traps; a
/// microphone that will not start is a comment written by hand instead.
actor MicrophoneCapture {

    /// One buffer, on its way from the audio thread to an engine.
    ///
    // SAFETY: the buffer is handed to the tap block by the audio unit and is not
    // touched again by CoreAudio or by us after it is yielded — one producer on
    // the audio thread, one consumer on the engine's task, no shared mutation.
    // Wrapping it is what lets it cross an isolation boundary without a copy,
    // and a copy per buffer is exactly the work the ink and audio paths cannot
    // afford.
    struct Chunk: @unchecked Sendable {
        let buffer: AVAudioPCMBuffer
    }

    private let engine = AVAudioEngine()
    private let logger = Logger(subsystem: "co.pencil-loop", category: "speech")

    private var isSessionActive = false
    private var isTapped = false
    private var continuation: AsyncStream<Chunk>.Continuation?

    init() {}

    /// The input node's native format. Engines convert from this to whatever
    /// they want.
    var inputFormat: AVAudioFormat {
        engine.inputNode.outputFormat(forBus: 0)
    }

    /// Everything that can be done before the user commits: category, session
    /// activation, and the engine's own graph preparation.
    ///
    /// Idempotent, and cheap on the second call.
    func prewarm() throws {
        guard isSessionActive == false else { return }
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try session.setActive(true, options: [])
        } catch {
            throw PencilLoopError.speechUnavailable(
                reason: "The microphone could not be started. \(error.localizedDescription)"
            )
        }
        isSessionActive = true
        // Resolves the input node and allocates its render resources, so
        // `start()` does not have to.
        engine.prepare()
    }

    /// Installs the tap and starts the engine, returning the buffer stream.
    ///
    /// Calling this while a capture is running replaces it: the previous stream
    /// is finished, because there is one microphone and one recording at a time
    /// (Protocols.swift § SpeechTranscribing, Lifecycle).
    func start() throws -> AsyncStream<Chunk> {
        stop()
        try prewarm()

        let (stream, continuation) = AsyncStream<Chunk>.makeStream(
            bufferingPolicy: .bufferingNewest(64)
        )
        self.continuation = continuation

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            continuation.finish()
            self.continuation = nil
            throw PencilLoopError.speechUnavailable(
                reason: "No microphone input is available."
            )
        }

        input.installTap(onBus: 0, bufferSize: 2048, format: format) { buffer, _ in
            continuation.yield(Chunk(buffer: buffer))
        }
        isTapped = true

        do {
            try engine.start()
        } catch {
            stop()
            throw PencilLoopError.speechUnavailable(
                reason: "The microphone could not be started. \(error.localizedDescription)"
            )
        }
        return stream
    }

    /// Stops capture and gives the audio session back. Idempotent, and safe to
    /// call from a stream's termination handler.
    func stop() {
        if isTapped {
            engine.inputNode.removeTap(onBus: 0)
            isTapped = false
        }
        if engine.isRunning {
            engine.stop()
        }
        continuation?.finish()
        continuation = nil
        if isSessionActive {
            do {
                try AVAudioSession.sharedInstance().setActive(
                    false,
                    options: .notifyOthersOnDeactivation
                )
            } catch {
                logger.debug("Audio session stayed active: \(error.localizedDescription, privacy: .public)")
            }
            isSessionActive = false
        }
    }
}
