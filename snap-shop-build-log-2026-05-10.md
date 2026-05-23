# Snap & Shop Build Log — 2026-05-10

**Build phase at start of session:** Phase 1 done (CF Worker + AI Gateway already wired). Phase 2 prep done (`capacitor.config.ts`, deps in `package.json`, `platform.js`). No native camera bridge, no canonical `ParsedItem` shape, only 3 of the 5 research-prescribed few-shot exemplars.
**Build phase at end of session:** Phase 2 ergonomics one step closer to done — UploadScreen now routes camera/library through `@capacitor/camera` when running native, falls back to the existing `<input>` on the PWA. Cloud-vs-on-device contract is now locked in `src/lib/parsedItem.js`. Few-shot prompt restructured to the 5 exemplars in research order.

---

## Summary

Three improvements implemented this run, all aligned with the next steps in the build sequence (Phase 2 polish + the contract work that unblocks Phases 3–5). Nothing in this change set requires Xcode 26, an iOS device, App Store credentials, or Cloudflare/Anthropic accounts. Matt can run the PWA right now and the changes are also ready for `npx cap add ios` whenever he gets to a Mac.

The AI Gateway item from the research build queue (#2) was already wired in `workers/src/index.ts` from the 2026-05-05 session — no-op this run, just verified.

---

## Changes Made

### 1. `src/lib/parsedItem.js` — new canonical contract (build queue item #6)

Defines the JS shape that BOTH ingestion pipelines (cloud Claude path and the upcoming on-device Apple Vision OCR + Foundation Models path) must return. Without this, the `useProTier()` swap planned for Phase 5 will leak abstraction — the UI will fork conditional code over which provider produced the items.

The contract is intentionally a superset that bridges the existing field names with the research-recommended ones:

- `category` and `section` are aliases (both populated identically).
- `flagged` and `needsConfirmation` are aliases (ditto).
- New optional fields: `unit` (split from quantity for Instacart line-item parity later), `crossedOut`, `alternatives`.
- Legacy fields preserved unchanged: `id`, `name`, `original`, `quantity`, `note`, `checked`.

Exports:
- `normalizeParsedItem(raw)` — defensive coercion. Reads either field name when present, picks safe defaults otherwise. Used by `parseResponse.js` (cloud path) and ready for future `useNativeOCR()` / `useNativeLLM()` hooks.
- `makeEmpty(name)` — fixture helper for tests + StoreMode placeholders.
- `PIPELINE_SOURCES` — frozen tag set so analytics can attribute parses to source.

### 2. `src/utils/parseResponse.js` — re-wired through `normalizeParsedItem`

`parseClaudeResponse` now delegates per-item shaping to `normalizeParsedItem`. New `dropCrossedOut: true` option (default) preserves today's behavior — the UI never sees struck-through items even though the prompt now asks the model to surface them. The on-device path can pass `dropCrossedOut: false` later to opt into showing them.

There's a circular import (`parsedItem.js` imports `genId` from `parseResponse.js`, and back) — fine in practice because ES module bindings are live and both functions are call-time, not eval-time. Documented inline so the next agent doesn't try to "fix" it.

### 3. `src/lib/platform.js` — `takePhoto()` + `takeFromLibrary()` (Phase 2 wiring)

New cross-platform helpers. On Capacitor (iOS/Android) they use `@capacitor/camera` directly:
- `correctOrientation: true` so wide grocery lists shot landscape don't come back rotated.
- `quality: 90` JPEG — the existing `imagePreprocessor.js` does the actual sizing/re-encoding.
- `saveToGallery: false` so we don't pollute the user's photo roll with intermediate captures.
- User-cancel events return `null`, not throw — UploadScreen treats that as a no-op.

On the web, both functions return `null`; the caller falls back to the hidden `<input type=file>` it already had. So PWA users see zero behavior change.

Pattern matches `keepScreenAwake()` from the 2026-05-07 session — dynamic `import()` of the Capacitor package, Vite's static analyzer doesn't bundle it on the web build.

### 4. `src/components/UploadScreen.jsx` — native-first capture, web fallback

- Added `import { isNative, takePhoto, takeFromLibrary }` from `platform.js`.
- New `captureNative(source)` helper synthesizes a `File` from the Capacitor `Blob` so the existing `handleFile` (which checks `file?.name`) keeps working unchanged.
- Camera and Screenshot buttons now route through `captureNative('camera' | 'library')`. On the PWA it just clicks the hidden input — same as before. On iOS/Android it opens the native camera UI, which the research file flagged as materially better than `<input capture=environment>` inside WKWebView.
- `retakePhoto` (called from `BlurRetakeSheet`) routes through the same path so the native-vs-web split is one branch, not two.
- If the native path errors out, we fall through to the hidden input rather than show a dead button — defense in depth.

### 5. `src/utils/groceryListPrompt.js` — 5-exemplar few-shot overhaul (build queue item #7)

Restructured the few-shot block from 3 examples → the 5 exemplars in the order prescribed by the 2026-05-10 research:

1. **Clean handwriting, simple list** — pure pass-through, no normalization needed. Establishes the baseline shape.
2. **Abbreviations + meal shorthand** — `pb&j` → `Peanut Butter + Jelly`, `OJ x2`, `Milk 2%` → `2% Milk`, `chx`, `evoo`, `TP`.
3. **Ambiguous quantities + unit splitting** — `doz eggs` → quantity:`12`, `2 lb gr beef` → quantity:`2`, unit:`lb`. Demonstrates the new `unit` field from the contract.
4. **Struck-through item** — `crossedOut: true`, NOT omitted. Reverses the previous "Ignore crossed out" behavior at the prompt level. UI is unchanged because `parseClaudeResponse` drops them by default.
5. **Multi-column + smudged + meal expansion** — preserves the existing complex example (`Kombucha ?` low-confidence read, vague cheese, pasta-night expansion, two-column reading order). Now also demonstrates `alternatives: ['Kombucha', 'Kombuchu']`.

System prompt updates:
- New priming preamble: "The image you receive is a handwritten…" — research showed this raises ambiguous-character accuracy.
- Closed category set explicit ("do not invent your own").
- Rule 6: low-confidence reads can now optionally include up to 2 `alternatives`.
- Rule 9 inverted: crossed-out items are returned with `crossedOut: true`, not dropped.
- Rule 11: encourage splitting quantity from unit, but don't require it.
- Return-format JSON schema in the prompt now matches the canonical `ParsedItem` contract.

Per the research's Claude-Opus/Sonnet weighting note, examples are kept tight and single-concept; comments at the top of `FEW_SHOT_EXAMPLES` document the order and rationale so future edits don't re-pile-on.

---

## Skipped / Deferred

| Item | Reason |
|------|--------|
| `npm install` for new deps (none added this run) | No new packages — all changes use already-listed `@capacitor/camera`. |
| `npx cap add ios` / Xcode build | Requires Xcode 26 on a Mac. Capacitor config + camera bridge are now ready for it. |
| `imagePreprocessor.js` 800px → 1568px bump | Research recommends 1568 (Claude's preferred), but 800 is a deliberate bandwidth tradeoff and the change has no eval data backing it on real handwritten lists. Worth eval-then-bump in a future session. |
| Custom `VisionOCR` Swift plugin (Phase 3) | Lives at `ios/App/App/Plugins/VisionOCR/` — only exists after `npx cap add ios`. Plugin code from research is ready to drop in once the iOS project is generated. |
| `@capgo/capacitor-llm` install (Phase 4) | Requires iOS 26 device for testing. |
| RevenueCat / StoreKit 2 (Phase 6) | Requires App Store Connect products configured. |
| Instacart IDP application | Action item for Matt — apply at instacart.com/company/business/developers. |
| Held-out 50-photo eval against the new prompt | Needs a real photo set. Suggested action: collect 50 real handwritten lists from friends, run them through both old and new prompts, score parse-correctness. |

---

## Files Changed

| File | Type | Notes |
|------|------|-------|
| `src/lib/parsedItem.js` | new | Canonical `ParsedItem` contract + `normalizeParsedItem()` + `PIPELINE_SOURCES` |
| `src/utils/parseResponse.js` | edit | `parseClaudeResponse` now delegates to `normalizeParsedItem`; new `dropCrossedOut` option |
| `src/lib/platform.js` | edit | + `takePhoto()`, `takeFromLibrary()` for Capacitor camera bridge |
| `src/components/UploadScreen.jsx` | edit | Camera + Screenshot buttons + retake now go through `captureNative()`; web fallback unchanged |
| `src/utils/groceryListPrompt.js` | edit | 5-exemplar few-shot overhaul; new priming preamble; crossedOut flipped from drop-at-prompt to surface-with-flag |

---

## Build Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Cloudflare Workers proxy + AI Gateway | ✅ Scaffolded + AI Gateway wired (CF_ACCOUNT secret); ready to deploy with `wrangler deploy` |
| 2 | Capacitor wrap + Xcode 26 | 🟡 Config + deps + camera bridge in place. One `npm install && npx cap add ios` away from a TestFlight build. |
| 3 | Apple Vision OCR plugin | ⏳ After Phase 2. Contract is locked — `normalizeParsedItem()` will accept its output unchanged. |
| 4 | Apple Foundation Models normalization | ⏳ After Phase 3. Contract locked. |
| 5 | `useProTier()` + paywall sheets | ⏳ After Phase 4. Same contract on both sides means swap is a one-line change. |
| 6 | StoreKit 2 via RevenueCat | ⏳ After Phase 5. |
| 7 | BYO key fallback in settings | ⏳ After Phase 6. |
