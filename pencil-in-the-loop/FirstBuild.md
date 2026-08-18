# First build

Everything in this repository was written on Linux, with no Swift compiler, no Xcode and
no Apple SDK anywhere near it. Not one line has been compiled. **The first build will not
be clean.** This document is about making the first hour productive rather than
mysterious.

The good news is that the failures should be shallow: type errors, availability errors and
version drift, not architecture. The project file, the plists and the entitlements have
been machine-checked (`make -C tooling check`), which rules out the class of failure that
gives you no line number at all.

---

## 1 · Step 0: push, then read CI

**Do this before opening Xcode.**

`.github/workflows/ios-build.yml` runs on every push. Its macOS job is the first real
compiler this code has ever met, and it is a far better first read than Xcode is: it
prints a complete, flat, greppable error list, in dependency order, with no editor state,
no derived data and no signing in the way.

```sh
git push
gh run watch          # or just open the Actions tab
```

The job runs four builds, in this order, and stops at the first failure:

| Step | What a failure means |
|---|---|
| `swift package resolve` | The manifest is malformed, or swift-markdown will not resolve. Nothing else has been attempted. |
| `swift build` (host) | A genuine compile error in `PencilLoopKit`, *or* code that only builds for iOS. See the note below. |
| `xcodebuild -scheme PencilLoopKit -destination generic/platform=iOS` | A real iOS compile error in the package. |
| `xcodebuild -project PencilLoop.xcodeproj -scheme PencilLoop` | The package is fine; the problem is in the app shell, the plists or the project file. |

The host `swift build` step is a deliberate shortcut and it has a shelf life: it compiles
the package for macOS, which is fast and needs no SDK juggling, but it stops being valid
the moment `AppUI` or `Annotate` imports UIKit, PencilKit or SwiftData for real. When that
step starts failing on `no such module 'UIKit'`, delete it from the workflow. The iOS step
underneath covers the same ground.

Only once CI is green — or once you have read its whole error list — is it worth opening
Xcode.

One thing to bring back from that first green run: `PencilLoopKit/Package.resolved`. It
cannot be generated on a machine with no network and no Swift, so it is not in the repo
yet. Run `swift package resolve` locally once and commit the result — until then the
dependency graph is re-resolved, and can silently move, on every machine.

---

## 2 · Two edits before you build

### a · Your team ID

`Config/Signing.xcconfig` has one blank line in it:

```
DEVELOPMENT_TEAM =
```

Put your ten-character Apple Developer Team ID there (Xcode ▸ Settings ▸ Accounts, or
developer.apple.com ▸ Membership). Blank is fine for the Simulator and for CI; it fails
the moment you build to a device, with `Signing for "PencilLoop" requires a development
team`.

### b · Your own bundle identifier

The repo ships with `com.example.pencilloop`, which nobody can sign. Replace it everywhere
in one go — this also fixes the App Group, which is `group.com.example.pencilloop` and has
to match between the app and the share extension or the extension writes into a container
the app cannot read.

From the repository root, on macOS (note the mandatory empty argument to `sed -i`):

```sh
grep -rl --exclude-dir=.git --exclude=FirstBuild.md 'com\.example\.pencilloop' . \
  | xargs sed -i '' 's/com\.example\.pencilloop/com\.yourname\.pencilloop/g'
```

Then check it landed:

```sh
grep -rn 'com\.example\.pencilloop' . --exclude-dir=.git --exclude=FirstBuild.md   # expect no output
make -C tooling check
```

One thing that command does *not* catch, because it is a prefix rather than the full id:
`tooling/xcodegen/project.yml` has `bundleIdPrefix: com.example`. Change it by hand if you
ever intend to use the XcodeGen fallback (§5).

---

## 3 · Expected errors, and the one-line remedy for each

Roughly in the order you are likely to hit them.

| Symptom | Why | Remedy |
|---|---|---|
| Manifest fails to parse: `extra argument 'defaultIsolation'` or `type 'SwiftSetting' has no member 'defaultIsolation'` | `.defaultIsolation(MainActor.self)` needs a Swift 6.2 or newer toolchain. The manifest declares tools version 6.0. | Delete that one line from the `AppUI` target's `swiftSettings` in `PencilLoopKit/Package.swift`, and write `@MainActor` on the view types instead. |
| Manifest fails to parse: `type 'SupportedPlatform.IOSVersion' has no member 'v26'` | The platform enum only knows the versions its own SwiftPM shipped with. | Change `.iOS(.v26)` to the string form `.iOS("26.0")`, which every SwiftPM accepts. |
| `failed to resolve dependencies` / `no versions of swift-markdown match the requirement` | The floor is `from: "0.6.0"`. Upstream tags 0.1.0–0.8.0 were verified to exist, so this should resolve to 0.8.0. | Bump the one number in `PencilLoopKit/Package.swift`. `swift package resolve` prints the versions it did find. |
| swift-markdown resolves but then fails to compile | 0.8.0's own manifest is tools version 6.2, and it pulls swift-cmark and swift-docc-plugin. | Nothing to fix on an Xcode 26 toolchain. On an older one, pin down: `.package(url: …, .upToNextMinor(from: "0.6.0"))`. |
| A wall of `use of protocol 'Foo' as a type must be written 'any Foo'` | `SWIFT_UPCOMING_FEATURE_EXISTENTIAL_ANY = YES` in `Config/Shared.xcconfig`. | The fixes are mechanical and worth doing. If it is burying you on day one, set it to `NO`, get to green, turn it back on, fix them properly. |
| `cannot find 'PKStrokeRecognizer' in scope`, or `is only available in iPadOS 27.0 or newer` | The recogniser ships in iPadOS 27; the deployment floor here is 26.0 so the project builds on a 26 SDK. | Leave the `PENCILLOOP_STROKE_RECOGNIZER` define commented out in `Annotate`'s `swiftSettings`. Ink still works — strokes are captured, persisted and exported as cropped images; only the handwriting-to-text search path is off. Turn it on when you move the floor to 27.0 in `Config/Shared.xcconfig`, in the same commit. |
| `SpeechAnalyzer` / `SpeechTranscriber` do not exist, or their initialisers do not match | The new Speech API moved between betas. | The transcriber sits behind a protocol precisely for this: point the factory in `Annotate` at the `SFSpeechRecognizer` implementation (`requiresOnDeviceRecognition = true`) and delete the `SpeechAnalyzer` file. Accuracy drops a little; nothing else in the app notices. |
| `Source files for target Core should be located under Sources/Core` | `PencilLoopKit/Sources/Core/` is written by a different unit and may not have landed yet. | Confirm it is on the branch you are building. Every other module has a placeholder file for exactly this reason; `Core` deliberately does not, so its absence is loud. |
| `Multiple commands produce .../Info.plist` | An `Info.plist` inside a file-system-synchronized folder got compiled in as a resource. | The project already excludes both plists and both entitlements files via `PBXFileSystemSynchronizedBuildFileExceptionSet`. If it reappears, uncheck target membership for the file in Xcode's file inspector, which writes the same exception back. |
| `Signing for "PencilLoop" requires a development team` | §2a. | Fill in `Config/Signing.xcconfig`. |
| `Sandbox: rsync deny file-write-create` or similar during a build phase | `ENABLE_USER_SCRIPT_SANDBOXING = YES` in `Config/Shared.xcconfig`. | Nothing in this project runs a build script, so this should not fire. If a future one needs to write outside its declared outputs, declare the outputs — do not turn the sandbox off. |
| The app builds but the share extension never appears in the share sheet | Usually a bundle-id mismatch: the extension's id must be the app's id plus a suffix. | Check `PRODUCT_BUNDLE_IDENTIFIER` in `Config/App.xcconfig` and `Config/ShareExtension.xcconfig` are `x` and `x.share`. `make -C tooling check` verifies the App Groups match but cannot verify this against your provisioning profile. |

---

## 4 · Triage order

**Separate the package from the app first.** Almost all of the code is in the package, and
the package builds without a project file, without signing and without a simulator:

```sh
swift build --package-path PencilLoopKit
```

If that fails, the app target is irrelevant — ignore Xcode entirely until it passes.

Then fix module by module, in dependency order. Each one only depends on the ones above
it, so an error in `Core` is causing errors in all six below it, and fixing `Core` first
will delete most of your error list:

```
Core → Storage → Sync → Ingest → Annotate → Export → AppUI
```

To compile just one module and its dependencies:

```sh
swift build --package-path PencilLoopKit --target Storage
```

Two structural invariants worth not breaking while you are in there:

- **`Sync` depends on `Core` only.** It reaches the library through the `DocumentStoring`
  protocol. This is what keeps SwiftData out of the `PencilLoopKitCore` product, which is
  all the share extension links. Adding `"Storage"` to `Sync`'s dependencies compiles fine
  and quietly makes the extension much more likely to be killed for memory.
- **`Core` and `Storage` import neither SwiftUI nor UIKit.** Enforced by convention, not by
  the compiler — the host `swift build` step in CI is the closest thing to a check.

Only when the package is green does the app target matter, and by then it is a shell:
`PencilLoopApp.swift` and `ShareViewController.swift` are about forty lines between them.

---

## 5 · If the project will not open

If Xcode says *"The project 'PencilLoop' is damaged and cannot be opened"* — the usual
cause is a bad merge in `project.pbxproj` — first run the checker, which gives a real
message and a line number where Xcode gives neither:

```sh
python3 tooling/lint/check_pbxproj.py
```

If it is genuinely unrecoverable, regenerate an equivalent project from the XcodeGen spec:

```sh
brew install xcodegen
mv PencilLoop.xcodeproj PencilLoop.xcodeproj.bak
xcodegen generate --spec tooling/xcodegen/project.yml --project .
```

The result is semantically the same — same two targets, same xcconfigs, same package
products, same embed phase — but not byte-identical: XcodeGen lists source files
individually where the committed project uses file-system-synchronized groups, so adding
a file later means regenerating rather than just saving it into the folder.

Prefer `git checkout -- PencilLoop.xcodeproj/project.pbxproj` over regenerating. The
fallback is for when there is nothing good to check out.

---

## 6 · Device test scripts

**Wave 3 fills this in.**

Most of what matters here cannot be tested in the Simulator or by a unit test — Pencil
input, hover, squeeze, `PKStrokeRecognizer`, live transcription, 60fps while inking a page
carrying three hundred strokes. Each milestone gets a short by-hand script on a real
iPad, written by the unit that builds it, and they land here.
