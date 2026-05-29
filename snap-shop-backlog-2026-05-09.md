# Snap & Shop — Post-OCR Backlog (2026-05-09)

Captured while the Apple Foundation Models path is still being debugged on
device. Address these *after* `Build my list` reliably runs OCR + on-device
normalization end-to-end.

---

## 1. Parse-time animation — make it feel 2035 not 2020

Today: a small green spinner with the text "Reading list…" / "Cleaning up…".

Want: a richer multi-stage animation that visually conveys "AI is reading
your handwriting." Ideas:
- Animated scan-line sweeping over the image preview as Vision OCR runs
- Words/lines popping in with a staggered fade as OCR resolves them, fed by
  the bounding-box data we already get from `recognizeTextOnDevice` in
  [src/lib/platform.js](src/lib/platform.js)
- Then a "✨ tidy up" pass where each detected line transforms (typo→clean
  spelling) when the Foundation Models step lands
- Subtle haptic tick on each item resolved (light impact)

Stages map to the existing pipeline:
1. Reading lines (Vision OCR returning)
2. Filtering noise (`filterOcrLines`)
3. Normalizing (Apple Foundation Models)
4. Categorizing (deterministic `categorizer.js`)

Tech: Framer Motion (or a CSS-only path if we want zero deps), with state
streamed from `parseList` via a new callback prop instead of one-shot setStatus.

---

## 2. Top bar goes under the iOS status bar; status bar not respected on scroll

When the Review screen renders, the title "Review your list" slides up
underneath the iOS status bar (notch / battery / wifi area), and the bar
doesn't gain a translucent backdrop on scroll. Same likely affects
UploadScreen's header.

Fix: respect `env(safe-area-inset-top)` on the outermost scroll container
and on any sticky headers. Probably also set
`viewport-fit=cover` is already in [index.html](index.html) — verify the
header padding-top uses safe-area math.

Spot-check needed:
- [src/components/ReviewScreen.jsx](src/components/ReviewScreen.jsx)
- [src/components/UploadScreen.jsx](src/components/UploadScreen.jsx)
- [src/components/InStoreMode.jsx](src/components/InStoreMode.jsx) (probably same)

---

## 3. Bottom bar grows in height at the end of the scroll

When the page is scrolled to its bottom, the fixed bottom bar/nav appears
to gain extra height. Likely safe-area-inset-bottom math compounding when
the iOS scroll-end overscroll happens.

Look at [src/components/UploadScreen.jsx](src/components/UploadScreen.jsx)
where I set `paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 13rem)'`
and the fixed bar's `bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)'`
— may be applying safe-area twice, or fighting with WKWebView's automatic
content inset. May need to switch `ios.contentInset` from `'automatic'` to
`'never'` in [capacitor.config.ts](capacitor.config.ts) and let the CSS
own all safe-area math.

---

## 4. Camera springboard crashes

Tapping the Camera button (in UploadScreen) crashes the app on device.
Likely: `@capacitor/camera` plugin isn't actually being used — the app
uses `<input type="file" capture="environment">` which fires the WebKit
file picker instead of Capacitor's native Camera plugin. On native iOS,
WebKit's file picker for camera capture has known stability issues.

Fix: switch to `Camera.getPhoto({ source: CameraSource.Camera, resultType:
CameraResultType.Base64 })` from `@capacitor/camera` when running native;
keep the file-input fallback for web/PWA. The plugin is already installed
and registered. Wire through `platform.js` similar to `recognizeTextOnDevice`.

Also add the Info.plist privacy strings for camera + photo library access
(otherwise iOS will hard-crash on first access):
- `NSCameraUsageDescription`
- `NSPhotoLibraryUsageDescription`

---

## 5. Typing a list still falls back to Ollama on native — should use Apple Intelligence

The text-input branch of `parseList` in
[src/hooks/useClaude.js](src/hooks/useClaude.js) (the `else` branch when
there's no file) routes through `PROVIDER` (anthropic if cloud configured,
otherwise ollama). On native iOS we have Foundation Models wired up for
the OCR path, but typed text bypasses it entirely.

Fix: mirror the OCR branch — if `canRecognizeTextOnDevice()` AND
`(await checkAppleIntelligence()).ok`, run the user's typed text through
`AppleLLM.generate` with the meal-plan / flexible-list instructions
(adapt `OLLAMA_FLEXIBLE_TEXT_PROMPT`), then deterministic categorize.
This makes the entire native path Ollama-free.

---

## Notes

- These are nice-to-haves AFTER the on-device LLM path is verified working
  end-to-end with a real grocery image on a real iPhone.
- 4 (camera crash) is the only one that's a hard blocker for shipping —
  prioritize once the OCR pipeline lands.
- 2 and 3 are layout polish — solve together when revisiting safe-area math.
- 1 and 5 are both quality-of-experience upgrades.
