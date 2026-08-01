# Snap & Shop — iOS 27 / WWDC 2026 Migration Plan (2026-06-10)

Grounded in the actual codebase + the WWDC 2026 announcements (keynote Jun 8,
Platforms State of the Union Jun 9). Replaces several earlier roadmap items.

## What changed at WWDC 2026 (relevant subset)

- **On-device image input** to Foundation Models: `session.respond { prompt; Attachment(UIImage) }`.
  Accepts UIImage/CGImage/CIImage/pixel buffers/file URLs. On-device, not cloud.
- **Rebuilt on-device model** — better logic + tool calling, refined guardrails.
  Built-in `OCRTool` and `BarcodeReaderTool` (Vision-backed).
- **Free Private Cloud Compute**: `PrivateCloudComputeLanguageModel()`, no keys/auth,
  free under 2M first-time downloads. 32K context, `reasoningLevel: .light/.deep`.
- **Third-party models** via `LanguageModel` protocol + partner Swift packages
  (`AnthropicLanguageModel()`, Google/Gemini). OAuth + Keychain, never keys in binary.
- **`@Generable` guided generation: unchanged** — our structured-output work carries forward.
- **Introspection**: `model.tokenCount(for:)`, `model.contextSize` (some shipped in iOS 26.4).
- **Timeline**: dev beta now (Jun 2026), public with iOS 27 in fall 2026.
  Device floor = Apple Intelligence set (iPhone 15 Pro / 16+).

## Impact on our pipeline

Current (iOS 26): `VisionOCRPlugin` (text-only OCR) → stop-word filter → canonical
lookup → `AppleLLMPlugin` text-only Foundation Models (`@Generable`) → categorize.
Pain points fought: model can't see the image (decorative planner tabs leak →
`DECORATIVE_SOLO_WORDS` hack), long lists collapse, occasional hallucinations.

iOS 27 target: hand the **photo** to the on-device model directly. It sees layout,
color, handwriting — natively distinguishing printed template furniture from written
items. The OCR→text→LLM hop collapses into one multimodal call.

### Supersedes / retires
- **Decorative-word-list hack** (`DECORATIVE_SOLO_WORDS` in `ocrFilter.js`): remove once
  image input ships — the model sees the tabs. (Keep on the iOS 26 fallback path only.)
- **"Defer to multimodal cloud path"** decision (backlog §0): solved on-device instead.
- **Cloudflare Worker + AI Gateway + Anthropic key proxy** (research build queue): replaced
  by free PCC for the under-2M-downloads case. Don't build the Worker.

### Keeps (still useful)
- `@Generable` types in `AppleLLMPlugin` — same contract, now fed an image.
- Canonical-name lookup (`canonicalNames.js`) — cheap deterministic pre/post pass.
- Stop-word filter for structural noise + the long-list safety net — backstops.
- The whole deterministic fallback path — for non-Apple-Intelligence devices.

## Target architecture (availability-gated)

```
parseFromImage(base64):
  iOS 27+ & Apple Intelligence available:
      AppleLLM.parseImage(image)         # multimodal: photo → @Generable items
  iOS 26 (current) & Apple Intelligence:
      VisionOCR.recognize → AppleLLM.cleanGroceryList   # today's path
  no Apple Intelligence (old device):
      VisionOCR.recognize → canonical lookup → categorizer   # deterministic
  hard cases / low confidence (any, iOS 27+):
      PrivateCloudComputeLanguageModel()  # free, 32K, reasoning
```

JS keeps one entry point (`parseFromImage`) so the swap is invisible to the UI.

## Toolchain prerequisite

- Have: Xcode 26.4.1, iOS 26.4 SDK only. **Cannot compile iOS 27 APIs yet.**
- Need: Xcode beta with the iOS 27 SDK + a device on the iOS 27 developer beta.
- Until then, iOS 27 Swift can only be written as reference, not built.

## Phased work

**Now (SDK-independent):**
1. This doc.
2. Update backlog/research notes: PCC supersedes Worker; word-list marked for removal.
3. (Optional) JS seam: introduce `parseFromImage()` that today routes to the existing
   OCR→text path — non-breaking, gives the iOS 27 path a clean slot. Compiles on stable.
4. (Optional, verify-on-26.4) Use `model.tokenCount` to chunk long lists smarter.

**When on the iOS 27 beta toolchain:**
5. `AppleLLMPlugin.parseImage(_:)` — `@available(iOS 27, *)`, image Attachment +
   existing `@Generable ParsedGroceryList`. Keep iOS 26 method as fallback.
6. `PrivateCloudComputeLanguageModel()` fallback for hard/low-confidence cases.
7. Once image parse is solid, delete `DECORATIVE_SOLO_WORDS` from the native path.

**Public-release window (fall 2026):**
8. Ship iOS 27 path live; keep iOS 26 fallback until adoption is high.
9. Revisit the Evaluations framework for a real parse-accuracy harness.

## Sources
- Apple, "What's new in the Foundation Models framework" — WWDC26 session 241
- MacRumors, "Apple Outlines Major AI and Developer Tool Updates" (2026-06-09)
- TechCrunch / Engadget WWDC 2026 keynote recaps (2026-06-09)
- Apple Newsroom, "Apple unveils next generation of Apple Intelligence, Siri AI, and more"

---

## Field notes — 2026-07-02 / 07-07 (first real iOS 27 runs)

Hard-won facts from getting the build onto the iOS 27 simulator and a
physical iPhone 16 Pro (iOS 27.0):

1. **UIScene is now mandatory.** Apps built with the iOS 27 SDK that use the
   legacy AppDelegate-only lifecycle hard-crash at launch
   (EXC_BREAKPOINT in EvaluateRuntimeIssueForNoSceneLifecycleAdoption).
   Fixed with SceneDelegate + UIApplicationSceneManifest. Capacitor 8's
   template will have this natively; ours is hand-rolled on Capacitor 7.
2. **Xcode 27 raised the deployment floor to iOS 15.** Bumped project +
   Podfile from 14.0 (with a post_install override for Capacitor pods).
3. **The iOS 27 simulator cannot run Foundation Models inference on a
   macOS 26 host.** availability lies (.available, supportsImage true) but
   on-device inference fails (ModelManagerError 1001; SCA error 15 on the
   text path) and PCC reports assets unavailable. Expect this to require a
   macOS 27 host. Simulator remains useful for EVERYTHING else (UI, OCR,
   fallback chain).
4. **PCC entitlement is fatal-if-missing and personal-team-unprovisionable.**
   Constructing PrivateCloudComputeLanguageModel without
   com.apple.developer.private-cloud-compute is a Swift fatal error, and the
   beta won't put that entitlement in a personal-team profile. Current state:
   sim-only entitlement file + #if targetEnvironment(simulator) around PCC.
5. **modelNotReady after OS updates.** Fresh iOS 27 install re-downloads the
   Apple Intelligence models (~3 GB, needs power + Wi-Fi). availability
   reports unavailable(modelNotReady) meanwhile; the app correctly falls
   back to OCR + deterministic categorize. Possible UX nicety later: banner
   when reason == modelNotReady ("Apple Intelligence still setting up…").
6. **Fallback chain survived a brutal real-world test** (communal multi-pen
   whiteboard + events magnet in frame): no crash, editable list. Known
   fallback limits: raw casing, background print leaks (magnet text) —
   all things the image model path exists to fix.

7. **Apple Feedback filed 2026-07-07** for the image-Attachment SIGKILL
   (draft: apple-feedback-fm-image-sigkill.md; FB number: ask Matt / add when
   handy). Retest cadence: flip IMAGE_INPUT_ENABLED in src/lib/onDeviceLLM.js
   and rebuild on each new iOS 27 beta; close this note when it survives.

8. **Retested on beta 4 (24A5390f), 2026-07-08 — still crashes.** Identical
   signature to beta 1-3: instant signal-9 kill at t+0s (before the 1s
   heartbeat can even log once), ~3.3GB free at time of death. No change in
   behavior across four betas. Kill-switch (IMAGE_INPUT_ENABLED in
   src/lib/onDeviceLLM.js) confirmed back to false; app verified stable on
   device afterward. Consider this now a "wait for Apple" item rather than
   something to retest every beta reflexively — maybe check every 2-3 betas
   or when Feedback gets a response.

9. **Isolated the crash to a single API call, 2026-07-08.** Added
   checkpoint prints around `Attachment(cgImage)` construction (outside
   any Task/session/respond() call). Result: the "before" print fires
   every time; the "after" print NEVER fires. The process is SIGKILLed
   synchronously inside `Attachment.init(_ cgImage:orientation:)` itself —
   before LanguageModelSession, before respond(), before any model
   inference. Text-only respond() with identical session/plugin scaffolding
   works reliably. This is strong evidence the bug is in Apple's
   FoundationModels framework code (or an undocumented gating requirement on
   that specific initializer), not in our implementation — we've ruled out
   our prompt building, session setup, threading, and Capacitor bridging as
   the diagnostic build's own checkpoints show none of that code is even
   reached. Feedback report upgraded with this isolation
   (apple-feedback-fm-image-sigkill.md).

10. **Paused 2026-07-08 — Matt moving off the iOS 27 beta until public
    release.** Status snapshot at pause:
    - Image input: confirmed dies inside `Attachment(cgImage)` construction
      itself (see #9), reproduced identically on beta 3 (24A5380h) and
      beta 4 (24A5390f). Fresh-verified against the SDK swiftinterface that
      our call matches the only public initializer signature — not a
      calling-convention mistake.
    - One avenue never finished: whether the SPECIFIC CGImage we hand it
      (Display P3 / possible HDR gain-map, from a live iPhone camera photo
      via CGImageSourceCreateThumbnailAtIndex) is a contributing factor
      versus a flat "any image kills it" bug. Was mid-way through adding a
      synthetic plain-sRGB-CGImage test to rule this in/out when Matt
      paused. If resuming: that's the next concrete step before assuming
      it's purely an Apple-side bug.
    - Kill-switch (`IMAGE_INPUT_ENABLED` in src/lib/onDeviceLLM.js) is
      `false` and committed; app is stable, ships the working OCR+text
      on-device path.
    - Apple Feedback filed and updated with the isolation repro
      (apple-feedback-fm-image-sigkill.md).
    - **On resume:** flip the kill-switch, rebuild, and pick up with the
      synthetic-image color-space test before re-filing/updating Feedback
      further. Check Feedback for any Apple response first.
