//
//  InFlightStrokeCanceller.swift
//  AppUI · Comment · Gesture
//
//  "Let the dot be drawn, and take it back." (docs/02-spec.md § S2)
//

import Foundation
import PencilKit

/// Removes the dot stroke that a stationary Pencil press has already started by
/// the time the comment gesture is recognised.
///
/// **The order matters and it is the whole design.** At `arming` — a fraction of
/// a second into the press, long before the gesture wins — the current
/// `PKDrawing` is remembered. PencilKit has not committed the in-flight stroke
/// yet (it commits on touch-up), so that snapshot is the drawing *without* the
/// dot. At `hold`, the canvas's own `drawingGestureRecognizer` is disabled and
/// re-enabled, which cancels the stroke still in flight; nothing is ever
/// committed and nothing has to be undone. The snapshot is the fallback for the
/// case where PencilKit committed early anyway.
///
/// Nothing here runs during drawing. `arm(_:)` reads one property, `cancel()`
/// toggles one flag, and both happen only when a comment gesture is already
/// under way — the touch path is untouched (docs/03-architecture.md).
///
/// **On failure:** silently does nothing. A recycled canvas, a page scrolled
/// away, a nil reference — every one of those means there is no stroke to
/// cancel, which is not an error. The worst outcome is a stray dot, and the
/// user erases it; the worst outcome of throwing here would be losing the
/// comment.
public final class InFlightStrokeCanceller {

    private weak var armedCanvas: PKCanvasView?
    private var drawingBeforePress: PKDrawing?
    private let tuning: CommentGestureTuning

    /// - Parameter tuning: supplies `cancelsInFlightStroke` and
    ///   `verifiesStrokeCancellation`.
    public init(tuning: CommentGestureTuning) {
        self.tuning = tuning
    }

    /// Remembers the canvas and its drawing at the start of a plausible comment
    /// press, before the dot could have been committed.
    ///
    /// Cheap by construction: `PKDrawing` is a value type and copying one is a
    /// retain, not a deep copy.
    public func arm(_ canvas: PKCanvasView?) {
        guard tuning.cancelsInFlightStroke, let canvas else {
            disarm()
            return
        }
        armedCanvas = canvas
        drawingBeforePress = canvas.drawing
    }

    /// Cancels the stroke in flight on the armed canvas.
    ///
    /// Call this the instant the long press is recognised and before the
    /// popover is shown, so the dot's life is bounded by one runloop turn
    /// rather than by how long the popover stays up.
    public func cancel() {
        guard tuning.cancelsInFlightStroke, let canvas = armedCanvas else { return }

        // Disabling a gesture recogniser mid-gesture cancels it, and PencilKit
        // discards the stroke it was building. Re-enabling immediately means the
        // very next Pencil touch draws normally.
        let drawingGesture = canvas.drawingGestureRecognizer
        drawingGesture.isEnabled = false
        drawingGesture.isEnabled = true

        guard tuning.verifiesStrokeCancellation, let before = drawingBeforePress else {
            disarm()
            return
        }

        // One turn of the main actor later, check that nothing landed anyway.
        // Restoring the earlier drawing is safe: `PKDrawing` is a value, the
        // canvas's delegate reports the change like any other edit, and the ink
        // persistence coordinator debounces 500ms — so the restored drawing is
        // what gets written, not the one with the dot in it.
        //
        // A `Task` rather than `DispatchQueue.main.async` because the closure
        // then inherits this actor's isolation, and `PKCanvasView` is
        // main-actor-bound: handing one to a `@Sendable` closure is exactly the
        // data race Swift 6 refuses to compile.
        Task { [weak canvas] in
            guard let canvas else { return }
            guard canvas.drawing.strokes.count > before.strokes.count else { return }
            canvas.drawing = before
        }
        disarm()
    }

    /// Forgets the armed canvas without touching it. Call when the press ends
    /// as an ordinary stroke — most presses do.
    public func disarm() {
        armedCanvas = nil
        drawingBeforePress = nil
    }
}
