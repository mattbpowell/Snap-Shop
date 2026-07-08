# Feedback Assistant draft — Foundation Models image Attachment kills process

**File under:** Developer Technologies & SDKs → Foundation Models
**Title:** FoundationModels: any respond() with an image Attachment terminates
a third-party app with signal 9 (instant, not memory-related); text-only
respond() works

## Environment
- iPhone 16 Pro (iPhone17,1), iOS 27.0 (24A5380h) — developer beta 3
- Xcode 27 beta (27A5194q), app built with iOS 27 SDK, deployment target 15.0
- Personal-team development signing (no special entitlements)
- Apple Intelligence enabled and ready (`SystemLanguageModel.default.availability == .available`)

## Summary
Calling `LanguageModelSession.respond(generating:options:prompt:)` where the
prompt builder includes an `Attachment(cgImage)` terminates the app with
signal 9 in under one second. This is not memory pressure:
`os_proc_available_memory()` reports ~3.3 GB free immediately before and
during the call, and the attached image is small (600×800 and 1024px-capped
variants both reproduce). The same session API with a text-only prompt and
the same @Generable output type completes successfully on the same device.

## Steps to reproduce
1. In an iOS app (ours is a Capacitor/WKWebView app; plain UIKit likely
   reproduces), confirm `SystemLanguageModel.default.availability == .available`.
2. Create `LanguageModelSession()` (with or without instructions).
3. `try await session.respond(generating: SomeGenerableStruct.self,
   options: GenerationOptions(temperature: 0.2, maximumResponseTokens: 2048)) {
       "Read this photo of a shopping list"
       Attachment(cgImage)   // any small CGImage
   }`
4. Process is killed with signal 9 before any response or thrown error.

## Expected
Either a generated response, a thrown error (e.g. unsupported/entitlement),
or a graceful `.unavailable` availability signal — not process termination.

## Observed
- Instant SIGKILL (~t+0–1s after respond() begins). No Swift error thrown,
  no crash log with a fatal message (consistent with a policy/jetsam-style
  kill, but memory headroom is ~3.3 GB at kill time).
- Text-only `respond(to:generating:)` with identical session setup and the
  same @Generable types works reliably on this device.
- Reproduced on iOS 27.0 24A5380h (beta 3). Earlier state on the same
  device: availability reported `modelNotReady` until Apple Intelligence
  assets finished downloading; after `available`, the kill reproduces 100%.
- On the iOS 27.0 simulator (macOS 26.5 host), image inference instead fails
  with ModelManagerServices.ModelManagerError 1001 (no kill) — presumably
  host-model-generation related and possibly unrelated.

## Notes
- modelmanagerd logs at kill time reference bundle policies for
  com.apple.fm.language.* models (unentitledGatedByFoundationModels,
  blockSideloadedApps flags) — if image input is intentionally gated for
  development-signed apps in beta, an availability signal or thrown error
  would be greatly preferable to SIGKILL.
- Happy to attach sysdiagnose on request.
