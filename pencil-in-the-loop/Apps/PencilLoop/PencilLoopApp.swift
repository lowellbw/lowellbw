import SwiftUI

/// The application entry point, and nothing more.
///
/// Everything the app actually does lives in `PencilLoopKit` — this target
/// exists so there is something to sign and install. Keeping the shell empty is
/// what lets `swift build` be a complete compile check of the real code.
@main
struct PencilLoopApp: App {
    var body: some Scene {
        WindowGroup {
            // WAVE 3: the integrator replaces this body with RootView(environment:)
            Text("PencilLoop")
                .font(.body)
                .foregroundStyle(.secondary)
        }
    }
}
