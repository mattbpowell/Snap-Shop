# Snap & Shop Build Log — 2026-05-07

**Build phase at start of session:** Phase 1 complete (CF Worker scaffolded). Phase 2 (Capacitor wrap) not started — no `capacitor.config.ts`, no Capacitor deps.
**Build phase at end of session:** Phase 2 prep landed — config + deps in place, platform abstraction wired into the wake-lock site so the iOS build will inherit it for free. Ready for `npm install && npx cap add ios`.

---

## Summary

Four improvements implemented, all aligned with Phase 2 prep + a research-driven prompt fix. Nothing in the change set requires Xcode 26, an iOS device, or any App Store credentials — Matt can run them today on the existing PWA build and ship them through the Capacitor wrap when he's at his Mac.

---

## Changes Made

### 1. `capacitor.config.ts` — new file (Phase 2 scaffold)

Generated the exact recipe from the research file. `appId: com.snapandshop.app`, `appName: "Snap & Shop"`, `webDir: dist`, `ios.contentInset: 'automatic'`. Server config left commented (only used for live-reload during dev). The file documents the full bring-up sequence in a header comment so the next build run can `npx cap add ios` without re-reading the research.

### 2. `package.json` — Capacitor dependencies added

Added under `dependencies`:
- `@capacitor/core@^7.0.0`
- `@capacitor/ios@^7.0.0`
- `@capacitor/camera@^7.0.0` (for Phase 2 camera bridge)
- `@capacitor/keep-awake@^7.0.0` (consumed by the new `platform.js` abstraction)

Added under `devDependencies`:
- `@capacitor/cli@^7.0.0`

These are listed but not yet installed. `npm install` is the only step required when Matt is ready. The Vite build remains green because `platform.js` uses dynamic `import()` for the Capacitor packages — nothing references them statically yet.

### 3. `src/lib/platform.js` — new platform-abstraction module

Single source of truth for "is this web or Capacitor?" plus thin wrappers over cross-platform features. Today it exports:

- `isNative()` — feature-detects `window.Capacitor.isNativePlatform()`.
- `getPlatform()` — returns `'web' | 'ios' | 'android'`.
- `keepScreenAwake()` — returns a release function. On Capacitor, dynamically imports `@capacitor/keep-awake` and uses `KeepAwake.keepAwake()`. On the web/PWA, falls back to the Web Wake Lock API. If neither path is supported, returns a no-op release.

The dynamic-import pattern is deliberate. Vite only bundles statically-reachable code, so the web build doesn't choke when Capacitor packages aren't installed yet. The moment `npm install` runs after Phase 2 starts, the plugin is wired in transparently.

`InStoreMode.jsx` was refactored to consume `keepScreenAwake()` instead of calling `navigator.wakeLock` directly. Behavior on the PWA is unchanged (same Wake Lock API, same `visibilitychange` re-acquire), but on iOS it'll automatically use the system-level KeepAwake plugin once Capacitor is added — no further code changes required at the call site. The effect now also guards against the lock resolving after the component unmounts (releases immediately if cancelled).

This is the pattern the research file recommends for Phase 3+ (`useOCR.js`, etc.) — keep UI components platform-agnostic, put all conditional logic behind a single boundary.

### 4. `groceryListPrompt.js` + Ollama prompts — confidence flag rule + `ambiguous` → `flagged` field-name fix

**Two changes here, both research-driven and one is a real bug fix.**

**(a) Field-name bug fix.** `parseResponse.js`, `FlaggedItemsSection.jsx`, `ReviewScreen.jsx`, and the item schema all read `i.flagged`. The cloud (`GROCERY_SYSTEM_PROMPT`) and Ollama (`OLLAMA_NORMALIZE_PROMPT`, `OLLAMA_SYSTEM_PROMPT`, `TRANSCRIBE_SYSTEM_PROMPT`, `OLLAMA_FLEXIBLE_TEXT_PROMPT`) prompts were instructing the model to emit `ambiguous: true` instead. That field was silently dropped — items the model marked as uncertain never appeared in the "double-check" section of the Review screen. Updated every prompt (and the few-shot example) to use `flagged` consistently, plus the one JS default-value site in `useClaude.js` (`flagged: false` for the string-fallback case in the categorization map). End-to-end alignment now: prompt → model output → parser → store → Flagged section.

**(b) Confidence threshold rule (Rule 6).** Per the research's handwriting tips ("if confidence < 0.4, flag the item with a `?` suffix"), `GROCERY_SYSTEM_PROMPT` now tells the model: when the read is plausible-but-shaky (smudged ink, ambiguous loops, partial occlusion), append `" ?"` to the name AND set `flagged=true` with `note="Hard to read — please verify."` This surfaces the model's best guess to the shopper while routing the item into the existing FlaggedItemsSection for verification. The principle is research-validated: guessing-with-a-flag beats omission for a one-handed-in-store user.

**(c) Multi-column reading order (Rule 7).** Also from research's handwriting tips. When the page has two clear columns, the prompt now instructs the model to read left-column-top-to-bottom *then* right-column-top-to-bottom, rather than interleaving row-by-row. This catches the bimodal-x-position case the research called out.

A new few-shot example demonstrates the `Kombucha ?` pattern in action so the model sees the expected output shape, not just the rule.

---

## Skipped / Deferred

| Item | Reason |
|------|--------|
| `npm install` of Capacitor packages | The build agent edits files but doesn't run installers. Matt: `npm install` is the only step needed to materialize them. |
| `npx cap add ios` / Xcode build | Requires Xcode 26 + Mac. `capacitor.config.ts` is ready; one command away. |
| Custom `VisionOCR` Swift plugin (Phase 3) | Lives at `ios/App/App/Plugins/VisionOCR/` — only exists after `npx cap add ios`. Plugin code from research is ready to drop in once the iOS project is generated. |
| `@capgo/capacitor-llm` install (Phase 4) | Requires iOS 26 device for testing. Wait for Phase 3 to land first. |
| RevenueCat / StoreKit 2 (Phase 6) | Requires App Store Connect products configured. |
| Instacart IDP application | Action item for Matt — apply at instacart.com/company/business/developers. |
| Deploy CF Worker | Requires `wrangler login` + Cloudflare account. Unchanged from prior session. |

---

## Files Changed

| File | Type | Notes |
|------|------|-------|
| `capacitor.config.ts` | new | Phase 2 scaffold |
| `package.json` | edit | + Capacitor deps |
| `src/lib/platform.js` | new | `isNative()`, `getPlatform()`, `keepScreenAwake()` |
| `src/components/InStoreMode.jsx` | edit | Wake lock now uses `platform.js` |
| `src/utils/groceryListPrompt.js` | edit | `flagged` field, confidence-`?` rule, multi-column rule, new few-shot |
| `src/hooks/useClaude.js` | edit | `ambiguous` → `flagged` in Ollama prompts + JS default |

---

## Build Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Cloudflare Workers proxy | ✅ Scaffolded — ready to deploy with `wrangler deploy` |
| 2 | Capacitor wrap + Xcode 26 | 🟡 Config + deps in place. One `npm install && npx cap add ios` away. |
| 3 | Apple Vision OCR plugin | ⏳ After Phase 2 |
| 4 | Apple Foundation Models normalization | ⏳ After Phase 3 |
| 5 | `useProTier()` + paywall sheets | ⏳ After Phase 4 |
| 6 | StoreKit 2 via RevenueCat | ⏳ After Phase 5 |
| 7 | BYO key fallback in settings | ⏳ After Phase 6 |
