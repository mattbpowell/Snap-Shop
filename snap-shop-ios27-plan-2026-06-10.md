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
