# Feedback Assistant draft — FoundationModels.Attachment(CGImage:) kills process

**File under:** Developer Technologies & SDKs → Foundation Models
**Title:** `Attachment.init(_ cgImage: CGImage, orientation:)` terminates a
third-party app with signal 9, isolated to that single call — no
LanguageModelSession interaction involved

## Environment
- iPhone 16 Pro (iPhone17,1), iOS 27.0
  - Reproduced on 24A5380h (beta 3) and 24A5390f (beta 4) — no change across
    at least two beta releases.
- Xcode 27 beta (27A5194q), app built with iOS 27 SDK, deployment target 15.0
- Personal-team development signing (no special entitlements)
- Apple Intelligence enabled and ready (`SystemLanguageModel.default.availability == .available`)

## Summary — UPDATED with isolation (2026-07-08)
Earlier reports (mine and others') described "any `respond()` call with an
image Attachment kills the app." Isolation testing narrows this
significantly: **the process is killed during construction of the
`Attachment` value itself — specifically `Attachment(_ cgImage: CGImage,
orientation:)` — before `LanguageModelSession.respond()` is ever called.**
No session, no prompt, no model inference is involved in the crash path.

This is not memory pressure: `os_proc_available_memory()` reports ~3.3 GB
free at the print statement immediately preceding the fatal call.

## Steps to reproduce
1. Confirm `SystemLanguageModel.default.availability == .available` and
   (if relevant to your test) that the device reports image support.
2. Decode a photo to a `CGImage` via any normal path (repro used
   `CGImageSourceCreateThumbnailAtIndex` downsampled to 600×800 and
   separately 1024px-capped — same result both sizes).
3. Log a checkpoint (e.g. `print("before attachment")`).
4. Call:
   ```swift
   let attachment = Attachment(cgImage)   // FoundationModels.Attachment<ImageAttachmentContent>
   ```
5. Log a second checkpoint (e.g. `print("after attachment")`).
6. Run on device.

## Expected
Step 4 either succeeds (checkpoint 5 logs) or throws/traps with a
diagnosable Swift error.

## Observed
- Checkpoint 4 ("before attachment") logs every time.
- Checkpoint 5 ("after attachment") **never logs**.
- The process receives SIGKILL between the two checkpoints — i.e., inside
  the `Attachment(cgImage)` initializer itself, synchronously, with no
  async/await boundary crossed yet.
- No Swift `fatalError`, no thrown error, no crash log with a symbol trace
  reaches the app's own console (`devicectl device process launch --console`)
  — consistent with an external kill (jetsam/sandbox/entitlement enforcement)
  rather than an in-process trap, though I have not yet obtained the kernel
  unified-log record for the kill event (device connection dropped when
  attempting a concurrent `devicectl diagnose` sysdiagnose gather — will
  attach in a follow-up if useful).
- Text-only `session.respond(to:generating:)` — same session type, same
  `@Generable` output types, same plugin/threading — completes reliably on
  the same device, same build. This rules out the surrounding
  Task/session/Capacitor-plugin scaffolding as the cause.
- On the iOS 27.0 SIMULATOR (macOS 26.5 host), the same code path instead
  fails gracefully with `ModelManagerServices.ModelManagerError 1001` (no
  kill) — different failure mode, possibly because the simulator lacks the
  on-device model generation assets entirely rather than hitting whatever
  gates the device path.

## Notes
- Reproduced across two consecutive beta releases (3 and 4) with identical
  signature — same instant timing, same "before" checkpoint present, same
  "after" checkpoint absent.
- If this is intentional gating (e.g., an unannounced entitlement or
  capability required to construct an image Attachment on a
  development-signed build), a thrown error from the initializer would be
  vastly preferable to process termination — right now there is no way for
  an app to catch this, report it to the user, or fall back gracefully; we
  can only work around it by not calling the initializer at all.
- Happy to attach a sysdiagnose or minimal repro project on request.
