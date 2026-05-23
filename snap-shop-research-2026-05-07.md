# Snap & Shop Research Report — 2026-05-07

---

## Top Findings

- **Phase 1 (CF Worker) is done — Phase 2 (Capacitor wrap) is the immediate unlock.** The workers/ scaffold exists with auth, CORS, and AI Gateway routing. Next action: `cd workers && wrangler deploy`, then add `@capacitor/core`, `@capacitor/ios`, and run `npx cap add ios`. The iOS project will live in `ios/`. Xcode 26 is already required for any App Store submission.
- **Write the Apple Vision OCR plugin yourself — don't depend on community plugins.** Both `capacitor-community/image-to-text` and `jcesarmobile/capacitor-ocr` are unmaintained. A local Capacitor plugin using `VNRecognizeTextRequest` takes ~80 lines of Swift and is the fastest path to Phase 3. Full pattern below.
- **`@capgo/capacitor-llm` is confirmed production-ready for Phase 4.** Set `path: 'Apple Intelligence'` and it auto-routes to the on-device 3B Foundation Model on iOS 26+ (A17 Pro and later). No `.task` model needed; avoid custom model paths — documented compatibility issues with `.task` format.
- **RevenueCat's native paywall for Capacitor works but has a known bug: `presentPaywall()` can hang after Restore Purchases.** Workaround: call `Purchases.restorePurchases()` manually and check entitlements yourself rather than relying on the paywall's built-in restore flow. Use `presentPaywallIfNeeded()` for the standard gate — it skips the paywall if the user already has an active entitlement.
- **Grocery AI (App Store) and PantryBox now offer photo-based item detection.** Neither does handwriting OCR + normalization + categorization in one step — the gap is still real, but new entrants are circling. Ship Phase 3 (Apple Vision OCR) before the window closes.

---

## Capacitor / Native Implementation Notes

### Phase 2 — First iOS Build (Do This Now)

Minimum steps to get the Capacitor iOS project generated:

```bash
# In snap-and-shop/
npm install @capacitor/core @capacitor/ios
npx cap init "Snap & Shop" com.snapandshop.app --web-dir dist
npx cap add ios
npm run build        # Vite build → dist/
npx cap sync ios     # Copies dist/ into ios/App/public/
npx cap open ios     # Opens Xcode 26
```

In Xcode 26: set the signing team, set the deployment target to iOS 26.0, and run on a physical device (Vision framework requires a real device for OCR testing, not Simulator). Simulator supports Vision framework APIs since Xcode 15 but handwriting recognition accuracy is lower.

**Key Capacitor 8 gotcha with Swift Package Manager:** Plugin products are not always exposed in Xcode (issue #8325). If a plugin shows "plugin not implemented on iOS" even though it compiled, switch to CocoaPods. Add to `ios/App/Podfile` and run `pod install`.

---

### Phase 3 — Custom Apple Vision OCR Plugin (Local Plugin Pattern)

Create a **local plugin** rather than a published npm package. Local plugins live in the Xcode project folder and are registered directly — no npm publish, no wrangler, no peer-dependency headaches.

**File layout:**

```
ios/App/App/
  Plugins/
    VisionOCR/
      VisionOCRPlugin.m      ← Obj-C bridge (one line)
      VisionOCRPlugin.swift  ← CAPPlugin implementation
```

**VisionOCRPlugin.m** (just registers the plugin):
```objc
#import <Capacitor/Capacitor.h>
CAP_PLUGIN(VisionOCRPlugin, "VisionOCR",
  CAP_PLUGIN_METHOD(recognize, CAPPluginReturnPromise);
)
```

**VisionOCRPlugin.swift:**
```swift
import Capacitor
import Vision
import UIKit

@objc(VisionOCRPlugin)
public class VisionOCRPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VisionOCRPlugin"
    public let jsName = "VisionOCR"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "recognize", returnType: CAPPluginReturnPromise)
    ]

    @objc func recognize(_ call: CAPPluginCall) {
        guard let base64 = call.getString("imageBase64"),
              let imageData = Data(base64Encoded: base64),
              let uiImage = UIImage(data: imageData),
              let cgImage = uiImage.cgImage else {
            call.reject("Invalid image data")
            return
        }

        let request = VNRecognizeTextRequest { req, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            let observations = req.results as? [VNRecognizedTextObservation] ?? []
            let lines = observations.compactMap { $0.topCandidates(1).first?.string }
            call.resolve(["lines": lines])
        }
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        // Boost grocery-specific vocabulary
        request.customWords = ["romaine", "prosciutto", "broccolini", "kombucha",
                               "tempeh", "tahini", "mozzarella", "shiitake"]

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        DispatchQueue.global(qos: .userInitiated).async {
            try? handler.perform([request])
        }
    }
}
```

**JS-side call (in useClaude.js or a new useOCR.js hook):**
```js
import { registerPlugin } from '@capacitor/core'

const VisionOCR = registerPlugin('VisionOCR')

export async function ocrImage(base64: string): Promise<string[]> {
  const { lines } = await VisionOCR.recognize({ imageBase64: base64 })
  return lines
}
```

`customWords` is the highest-leverage tuning knob — Apple Vision has a vocabulary file you can augment with unusual grocery terms. Extend the array as you collect real user failure cases.

---

### Phase 4 — Apple Foundation Models (On-Device Normalization)

`@capgo/capacitor-llm` is confirmed working on iOS 26. The plugin auto-selects Apple Intelligence (the 3B on-device transformer) when `path: 'Apple Intelligence'` is set. No model download, no file path, no `.task` format — it just calls `FoundationModels.LanguageModelSession` natively.

**Install:**
```bash
npm install @capgo/capacitor-llm
npx cap sync ios
```

**Normalization call:**
```js
import { CapgoLLM } from '@capgo/capacitor-llm'

await CapgoLLM.setModel({ path: 'Apple Intelligence' })

const prompt = `
You are a grocery item normalizer. Given raw OCR text from a handwritten grocery list, 
return a JSON array of normalized items. Rules:
- Fix spelling ("tomatos" → "Tomatoes", "chix brst" → "Chicken Breast")
- Expand abbreviations ("OJ" → "Orange Juice", "whl mlk" → "Whole Milk")
- Preserve quantities inline ("2% milk", "3 lbs ground beef")
- Remove non-items (store names, dates, prices, scribbles)
- Output ONLY a raw JSON array, no markdown

Raw OCR lines: ${JSON.stringify(ocrLines)}
`

const { text } = await CapgoLLM.generate({ prompt })
const items = JSON.parse(text)  // string[] of normalized grocery items
```

**Latency on A17 Pro:** <500ms for a list of 10–20 items. Cloud fallback via CF Worker remains the safety net for older devices (A15 and earlier fall back to Claude API).

**Device compatibility gate:**
```js
// Only use on-device if Apple Intelligence available
const useOnDevice = Capacitor.getPlatform() === 'ios' && 
                    parseInt(Device.osVersion) >= 26
```

---

## Mobile UX Recommendations

- **Camera-to-OCR flow:** In the Capacitor-wrapped app, use `@capacitor/camera` with `resultType: CameraResultType.Base64` and `source: CameraSource.Camera`. Pass the base64 directly to the Vision OCR plugin — no round trip to the server for Phase 3+ devices.
- **Progressive disclosure for OCR results:** Show items appearing line by line as OCR resolves, then animate the normalization pass. Users feel the AI "working" rather than staring at a spinner. Use React state updates in the Promise chain: `setRawItems(lines)` → `setNormalizedItems(parsed)`.
- **Keep-awake in store mode:** `@capacitor/keep-awake` (`KeepAwake.keepAwake()`) prevents the screen from dimming during shopping. Add a toggle in the checklist header — one tap, visible at thumb reach.
- **Thumb-zone checklist:** Tap targets ≥48px height. Keep the ✓ checkbox on the left edge (left thumb can reach it one-handed). Item label centered. Delete/edit behind a right swipe — don't show destructive actions by default.
- **PWA home-screen camera bug is real:** `input[capture="environment"]` is ignored in PWA mode on iOS Safari — falls back to file picker. This is a strong argument to prioritize the Capacitor wrap before marketing the PWA. Don't advertise "snap a photo" on the landing page until the native wrap ships.

---

## AI / Prompt Improvements

### Categorization Prompt (Cloud Path — CF Worker)

After normalization, categorization runs against normalized items. Two-stage approach is cleaner than one monster prompt:

**Stage 1 (OCR + normalization — on-device or cloud):** Raw lines → normalized string[].

**Stage 2 (categorization — cloud, low-latency):**
```
You are a grocery store navigator. Assign each item a store section.
Sections: Produce, Meat & Seafood, Dairy & Eggs, Bakery, Frozen, 
          Pantry, Beverages, Snacks, Health & Beauty, Household, Deli, Other

Input: JSON array of normalized grocery items
Output: JSON array of objects: { "item": string, "category": string, "emoji": string }
Rules:
- emoji should be a single relevant food emoji
- When ambiguous, prefer the section the item is most commonly stocked in
- Output ONLY raw JSON, no markdown fence

Items: ${JSON.stringify(normalizedItems)}
```

**Few-shot examples to append for edge cases:**
```json
[
  {"item": "La Croix Lime 12-pack", "category": "Beverages", "emoji": "🥤"},
  {"item": "Greek Yogurt", "category": "Dairy & Eggs", "emoji": "🫙"},
  {"item": "Everything Bagel", "category": "Bakery", "emoji": "🥯"},
  {"item": "Tide Pods", "category": "Household", "emoji": "🧺"}
]
```

### Handwriting-Specific OCR Tips

- **Low-light pre-processing:** If image brightness is below a threshold, apply a contrast boost before passing to Vision. `CIFilter(name: "CIColorControls")` with `inputContrast: 1.3` helps for dim grocery store or fridge-door light.
- **Multi-column lists:** Vision returns bounding boxes. If lines have bimodal x-positions (left column / right column), sort by column first, then row — don't assume top-to-bottom reading order for two-column lists.
- **Confidence threshold:** `topCandidates(1).first?.confidence` — if confidence < 0.4, flag the item with a `?` suffix in the UI so users know to verify it.

---

## Competitor Intel

**AnyList:** Still a closed box — no API, no OCR. Recipe URL import is their AI-adjacent feature. No photo-based list ingestion. Strong in recipe management; weak in capture.

**Listonic:** AI-powered suggestions via predictive typing, voice input, auto-aisle sorting. No handwriting/photo input. Free tier aggressive. Their differentiation is voice — yours is vision.

**LystBot (new in 2026):** AI-first list app with a REST API, CLI, and Claude MCP integration. Free, no paywalls. Targets power users and developers who want LLM-accessible lists. No mobile photo capture. Not a direct threat but validates the "AI list management" market.

**Grocery AI (App Store):** Has barcode scanning and receipt import and "photo-based item detection." This is the closest direct competitor. Their photo detection appears to be barcode/label scanning (printed text), not handwriting OCR + normalization. The normalization + categorization pipeline remains unmatched.

**PantryBox:** Voice + photo + text item entry with "smart recognition." Product-focused (pantry management / expiry tracking) rather than list ingestion. Different use case.

**Gap still wide open:** No app does handwriting → normalized → categorized → tappable checklist in under 10 seconds. Build Phase 3 fast.

---

## Revenue Opportunities

### Instacart IDP — Apply Now
- **URL:** [instacart.com/company/business/developers](https://www.instacart.com/company/business/developers)
- Approval: 1-2 business days for review (revised from the 30-40 day estimate in prior research — the affiliate program via Impact is faster; the full IDP API integration takes longer)
- **Action:** Apply immediately. The affiliate tracking (Impact account) can be set up before Phase 6. Even without deep integration, a "Buy via Instacart" deep link from the checklist earns commission on attributed orders.
- Commission: 5% of cart value (7-day attribution window). On a $150 average grocery order, that's $7.50/conversion.

### Subscription Pricing Context
- RevenueCat free tier covers up to $2.5K Monthly Tracked Revenue (MTR), then 1% of MTR. For early-stage, zero cost.
- Target: $19.99/yr or $2.99/mo, 7-day free trial. Annual plan is the conversion target — 12-month LTV vs. monthly churn.
- RevenueCat pricing at $2.5K MTR: ~125 annual subscribers or ~833 monthly subscribers before you pay RevenueCat a cent.

### Affiliate Fallbacks (if Instacart IDP takes longer)
- **Thrive Market:** $40/signup (membership referral). Append a Thrive Market affiliate link to the "where to buy organic" expansion feature.
- **ButcherBox:** $20/signup. Trigger when user adds "ground beef," "salmon," "chicken breast" — contextual placement.
- **Blue Apron:** $15/signup. Trigger when user has ≥5 dinner-ingredient items on list.

---

## Long-Term Vision Notes (Research Awareness — Not Building Yet)

- **Mistral OCR 3** (released 2026) claims 74% win rate over its predecessor on handwriting recognition — worth benchmarking as a cloud OCR fallback for cases where Apple Vision confidence is low. Could plug into the CF Worker as a secondary provider when `confidence < 0.4`.
- **PaddleOCR-VL-1.5** (January 2026) hits 95% accuracy on document parsing benchmarks. Open source — could eventually run on-device via CoreML conversion for a fully private, offline-first pipeline.
- The "generic handwritten capture" long-term vision (meeting notes → Notion, to-dos → Reminders) is validated by LystBot's direction. Keep the OCR and normalization pipeline modular — the grocery categorizer is just one normalization target. Design `useOCR.js` so the categorization step is injected, not hardcoded.

---

## Build Queue — Ranked & Actionable

### 1. Deploy CF Worker (Phase 1 completion)
```bash
cd workers
npm install
cp .dev.vars.example .dev.vars  # fill in ANTHROPIC_KEY, API_SECRET
wrangler deploy
```
Set `VITE_API_URL` in the PWA `.env` to the worker URL. Test with `/health` GET.

### 2. Capacitor wrap + first iOS build (Phase 2)
```bash
npm install @capacitor/core @capacitor/ios @capacitor/camera @capacitor/keep-awake
npx cap init "Snap & Shop" com.snapandshop.app --web-dir dist
npx cap add ios
npm run build && npx cap sync ios && npx cap open ios
```
Run on a physical iPhone (not Simulator) for accurate camera testing.

### 3. Custom Vision OCR plugin (Phase 3)
- Create `ios/App/App/Plugins/VisionOCR/` with the two files above.
- Wire into Xcode project (drag folder into Xcode navigator, check "Add to target: App").
- Call `VisionOCR.recognize({ imageBase64 })` from the camera capture hook.
- Test with photos of handwritten grocery lists at varying light levels.

### 4. Foundation Models normalization (Phase 4)
- `npm install @capgo/capacitor-llm && npx cap sync ios`
- Add device compatibility gate — only call on iOS 26+ with Apple Intelligence enabled.
- Cloud fallback: existing CF Worker path for older devices.

### 5. `useProTier()` hook + paywall gate (Phase 5)
- RevenueCat setup: `npm install @revenuecat/purchases-capacitor @revenuecat/purchases-capacitor-ui`
- Configure in RevenueCat dashboard: one offering with annual ($19.99/yr) and monthly ($2.99/mo) products, 7-day free trial on both.
- `Purchases.configure({ apiKey: RC_API_KEY })` on app launch.
- `useProTier()` hook: `Purchases.getCustomerInfo()` → check `entitlements.active['pro']`.
- Gate: on-device OCR (Phase 3) and Foundation Models normalization (Phase 4) behind Pro. Cloud path remains free (rate-limited via CF Worker).

### 6. StoreKit 2 / RevenueCat paywall (Phase 6)
```js
import { RevenueCatUI } from '@revenuecat/purchases-capacitor-ui'

// Use presentPaywallIfNeeded — skips if already subscribed
const result = await RevenueCatUI.presentPaywallIfNeeded({
  requiredEntitlementIdentifier: 'pro'
})
// Bug workaround: if result.userCancelled is undefined after restore, 
// re-fetch CustomerInfo manually to confirm entitlement status.
```

### 7. Apply for Instacart IDP affiliate
- Apply at [instacart.com/company/business/developers](https://www.instacart.com/company/business/developers) today.
- Set up Impact account (required for commission tracking).
- Add "Buy via Instacart 🛒" button to checklist view — deep links to Instacart cart pre-populated with items.
