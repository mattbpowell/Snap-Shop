# Snap & Shop Research Report — 2026-05-05

---

## Top Findings

- **Xcode 26 is now mandatory.** As of April 28, 2026, Apple requires all App Store uploads to be built with Xcode 26 + iOS 26 SDK. This is a hard deadline — build phase 2 (Capacitor wrap → iOS build) must use Xcode 26. Most existing Capacitor code requires no rewriting, just a rebuild on the new SDK.
- **`@capgo/capacitor-llm` is the fastest path to Apple Foundation Models.** The plugin ships native Apple Intelligence support for iOS 26+ out of the box; calling `CapgoLLM.setModel({ path: 'Apple Intelligence' })` is all it takes. MediaPipe fallback exists for older devices but has known compatibility issues with `.task` format models — stick to Apple Intelligence as the primary path.
- **Instacart IDP pays 5% of total cart value** (7-day attribution window) once you have a live integration. Apply now — 30–40 day approval lag. This is the highest-leverage revenue integration to start early.
- **RevenueCat's Capacitor SDK (`@revenuecat/purchases-capacitor`) is production-ready.** Handles StoreKit 2, free trial setup, and remote paywall configuration. Pair with `@revenuecat/purchases-capacitor-ui` for `RevenueCatUI.presentPaywall()` — no custom UI needed for launch.
- **No competitor does the full pipeline.** AnyList v3 added recipe timers. Listonic added an AI assistant. Neither does photo → OCR → normalized + categorized checklist. The gap is still wide open.

---

## Capacitor / Native Implementation Notes

### Build Phase 2 — Xcode 26 + Capacitor Wrap

- Xcode 26 is required for App Store submission as of April 28, 2026. Install immediately if not already done.
- Capacitor itself requires minimal changes for Xcode 26 — it's primarily a rebuild. Watch for older community plugins that haven't been rebuilt against the iOS 26 SDK; check release notes before upgrading.
- Known issue: `capacitor-updater` from Cap-go has a reported Xcode 26 build failure (GitHub issue #614). If you're planning OTA updates, verify that plugin's status before depending on it.
- Capacitor 8 with Swift Package Manager has a known bug where plugin products aren't exposed in Xcode (issue #8325). If using SPM, stay aware and consider CocoaPods as a fallback.

### Build Phase 3 — Apple Vision OCR

Two community options exist:
1. **`capacitor-community/image-to-text`** — community plugin wrapping Apple's Vision framework for OCR.
2. **`jcesarmobile/capacitor-ocr`** — another community OCR plugin.

Neither is clearly maintained/production-hardened. **Recommendation:** Write a thin custom Capacitor plugin using the official Vision framework (`VNRecognizeTextRequest`) rather than depending on unmaintained community code. The WKWebView bridge pattern is straightforward — subclass `CAPBridgeViewController`, register a custom Swift plugin, call `VNRecognizeTextRequest` with `.accurate` recognition level. Return recognized strings as a JSON array over the bridge.

Key Swift snippet approach:
```swift
let request = VNRecognizeTextRequest { request, error in
    let observations = request.results as? [VNRecognizedTextObservation]
    let strings = observations?.compactMap { $0.topCandidates(1).first?.string } ?? []
    call.resolve(["text": strings])
}
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
```

### Build Phase 4 — Apple Foundation Models (On-Device Normalization)

- **`@capgo/capacitor-llm`** is the best available Capacitor plugin. It uses Apple Intelligence by default on iOS 26+ (3B parameter on-device transformer — runs on CPU/GPU/Neural Engine, fully offline, zero cost per call).
- API: `await CapgoLLM.setModel({ path: 'Apple Intelligence' })` then `await CapgoLLM.generate({ prompt: '...' })`.
- The model supports guided generation and constrained tool calling — ideal for structured output (normalized item names, category assignments).
- **On-device quality:** The Apple Foundation Models tech report (2025) shows the 3B model performs well on instruction-following and structured extraction tasks. For grocery normalization ("tomatos" → "Tomatoes", "OJ" → "Orange Juice") this is more than sufficient.
- **Latency expectation:** On-device inference on iPhone 15 Pro (A17 Pro Neural Engine) is fast for short prompts — expect <500ms for a list of 10–20 items. Cloud fallback via Claude API through your CF Worker remains the safety net for older devices.

---

## Mobile UX Recommendations

- **Camera flow on iOS Safari / Capacitor:** Use `input[type=file][accept="image/*"][capture="environment"]` for the PWA phase — this triggers the native camera directly without needing Capacitor camera permissions. Once wrapped in Capacitor, switch to `@capacitor/camera` for a smoother experience with proper permission handling.
- **One-handed cart UX:** Keep the checklist item tap target minimum 48px height. Bottom-sheet pattern for item editing (reachable with thumb). Avoid top-nav actions during shopping mode — everything should be within thumb reach in the lower 60% of the screen.
- **In-store mode:** Consider a "store mode" toggle that locks brightness to full and disables auto-lock. This is achievable in Capacitor via `@capacitor/keep-awake` plugin.
- **PWA → Native migration:** The `input[capture]` approach works in Safari but is unreliable in PWA home-screen mode on iOS — it often ignores the `capture` attribute and shows the file picker instead. This is a strong push to prioritize the Capacitor wrap (build phase 2) early.

---

## AI / Prompt Improvements

### OCR Prompt for Claude Vision API (Current Cloud Path)

The prompt should explicitly handle common grocery list formats. Recommended system prompt structure:

```
You are an OCR engine for grocery lists. Extract every distinct grocery item from this image.
Rules:
- Output ONLY a JSON array of strings, no other text
- Preserve quantity information inline (e.g., "2% milk", "3 apples", "lg eggs")
- Expand abbreviations when unambiguous (OJ → orange juice, chix → chicken)
- If handwriting is unclear, make your best reasonable guess — do not return null or skip
- Ignore non-grocery text (dates, prices, store names)
```

### Normalization Prompt for Foundation Models (On-Device)

```
Normalize this grocery item list for a shopping app. For each item:
1. Fix spelling
2. Expand common abbreviations
3. Assign a store section: produce, dairy, meat, bakery, frozen, pantry, beverages, household, personal_care, deli, other
Return ONLY valid JSON: [{"item": "...", "section": "..."}]

Items: {items}
```

### Ambiguity Handling

Add a low-confidence flag: if Claude's vision response includes items with unusual formatting or multiple plausible readings, surface them in the UI with an "edit" affordance highlighted — a small pencil icon inline — rather than silently guessing.

---

## Competitor Intel

| App | AI/OCR? | Photo Capture? | Auto-categorize? | Notes |
|-----|---------|----------------|-----------------|-------|
| AnyList | No | No | No | v3 added recipe timers; no AI pipeline |
| OurGroceries | No | No | Manual sections | Real-time sync focus |
| Listonic | Partial | No | No | Added "AI Assistant" (text input only) |
| Google Keep | No | No | No | Generic notes, no grocery UX |
| Bring! | No | Barcode only | No | Barcode scan, no handwriting |
| PantryBox (new) | Yes (claimed) | Yes | Partial | New entrant 2025; "smart recognition of products" — needs monitoring |
| Carrefour / Instacart Cart Assistant | Yes | No | Yes | Retailer-side AI; not consumer list app |

**Key gap still wide open:** No consumer app does handwriting photo → clean categorized list end-to-end in a polished mobile UX. PantryBox is the closest new entrant to watch.

---

## Revenue Opportunities

### Instacart Developer Platform (IDP) — Apply Now
- **Commission:** 5% of total cart value, 7-day attribution window
- **Integration model:** Add "Order on Instacart" CTA on checklist items or at cart completion. Deep link or embed Instacart cart-building API.
- **Approval timeline:** 30–40 days. Apply at instacart.com/company/business/developers immediately — don't wait for the app to launch.
- **Addressable upside:** A user with a $150 weekly grocery cart = $7.50/checkout. Even 10% conversion on active users compounds quickly.

### Affiliate Programs (Secondary Revenue Layer)

| Partner | Commission | Cookie | Fit |
|---------|-----------|--------|-----|
| Thrive Market | $5–$40/signup | 14 days | Strong — health-conscious grocery shoppers overlap perfectly |
| ButcherBox | $20/new subscription | 30 days | Good — "add to list" → meat subscription funnel |
| Blue Apron | ~$15/signup | 30 days | Moderate — meal kit upsell post-list-creation |

**Implementation approach:** Contextual placement. After a user scans a list containing "chicken breast" or "ground beef" → surface a soft "Get quality meat delivered — ButcherBox" card. After a Thrive Market-relevant scan (organic produce, specialty items) → Thrive Market prompt. Keep it opt-in and non-intrusive to protect retention.

### Pro Tier / RevenueCat ($19.99/yr or $2.99/mo)
- Free tier: unlimited scans (drives adoption and Instacart IDP revenue)
- Pro tier differentiators: offline mode, store-route optimization, multi-list support, recipe import, custom categories
- 7-day free trial via StoreKit 2 introductory offer — RevenueCat handles this automatically via `introductoryPrice` on the product

---

## Long-Term Vision Notes (Research Awareness Only)

- Apple Foundation Models' guided generation + constrained tool calling is architecturally identical for any handwritten capture domain — meeting notes, to-dos, plans. The normalization pipeline (image → OCR text → on-device structured extraction) is fully generic.
- The `VNRecognizeTextRequest` Vision framework handles printed and handwritten text across domains. No domain-specific tuning needed.
- Export targets (Apple Notes, Reminders, Notion) all have stable APIs. Notion API is well-documented. Apple Reminders is accessible via `EventKit` in Swift (Capacitor plugin `@capacitor-community/calendar` or custom).
- Signal: Carrefour is now integrating ChatGPT for grocery shopping (April 2026). Retail giants are moving into AI-assisted shopping. The consumer-side ingestion tool (Snap & Shop) has a narrow window before retailers close the gap with their own apps.

---

## Build Queue (Ranked, Actionable)

### 1. Cloudflare Workers Proxy (Immediate — enables all cloud calls)
- Scaffold with `wrangler init snap-shop-proxy`
- Route: `POST /ocr` → forward to Claude API with vision payload, return JSON items array
- Auth: simple shared secret header (`X-API-Key`) validated in Worker for now; upgrade to JWT later
- Rate limiting: use CF Rate Limiting (now GA as of Sept 2025) — 10 req/min per IP, 100/day per user token
- CORS: set `Access-Control-Allow-Origin: *` for PWA phase, lock down after Capacitor wrap
- AI Gateway: route through `https://gateway.ai.cloudflare.com/v1/{account_id}/snap-shop/anthropic` for usage analytics and caching

```typescript
// workers/src/index.ts (sketch)
export default {
  async fetch(req: Request, env: Env) {
    if (req.method === 'OPTIONS') return corsPreflightResponse();
    const key = req.headers.get('X-API-Key');
    if (key !== env.API_SECRET) return new Response('Unauthorized', { status: 401 });
    // forward to Anthropic via AI Gateway
    const body = await req.json();
    const resp = await fetch(`https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT}/snap-shop/anthropic/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    return new Response(await resp.text(), { headers: corsHeaders(resp.headers) });
  }
}
```

### 2. Apply for Instacart IDP (Today — 30–40 day queue)
- Go to instacart.com/company/business/developers
- No live app required to apply — describe the use case
- Sets up the revenue foundation before launch

### 3. Capacitor Wrap + Xcode 26 Build
- `npm install @capacitor/core @capacitor/ios @capacitor/cli`
- `npx cap init "Snap & Shop" com.snapandshop.app`
- `npx cap add ios`
- Open in Xcode 26, set deployment target iOS 16+ (Foundation Models requires iOS 18+, Vision is iOS 13+)
- Verify `WKWebView` bridge loads the Vite PWA correctly

### 4. Apple Vision OCR Plugin (Custom Swift)
- Create `ios/App/Plugins/VisionOCR.swift`
- Register as a Capacitor plugin: `@objc(VisionOCRPlugin)`
- Implement `recognizeText` method using `VNRecognizeTextRequest` (accurate mode)
- Call from JS: `Plugins.VisionOCRPlugin.recognizeText({ imageBase64: '...' })`

### 5. Foundation Models Normalization Plugin
- `npm install @capgo/capacitor-llm`
- `npx cap sync`
- Use for on-device normalization + categorization post-OCR
- Fallback: if device doesn't support Apple Intelligence (< iOS 26), route to CF Worker → Claude API

### 6. RevenueCat + Paywall
- `npm install @revenuecat/purchases-capacitor @revenuecat/purchases-capacitor-ui`
- Configure products in App Store Connect: `snap_shop_pro_monthly` ($2.99/mo, 7-day trial), `snap_shop_pro_yearly` ($19.99/yr, 7-day trial)
- Hook `useProTier()` to `Purchases.getCustomerInfo()` entitlement check
- Present paywall: `RevenueCatUI.presentPaywall()` on pro-feature tap

### 7. Instacart IDP Integration (Post-Approval)
- Add "Order via Instacart" button to checklist completion screen
- Use IDP cart-building API to pre-populate cart from normalized item list
- Register as affiliate via Impact platform for 5% commission tracking

---

*Report generated: 2026-05-05. Next run should cover: Mobile UX deep dive (camera flow edge cases, in-store mode) + AI prompt refinement with few-shot examples.*
