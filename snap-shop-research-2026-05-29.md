# Snap & Shop Research — 2026-05-29

**Angles this run:** competitor reality check, Capacitor + Apple AI (guided generation), AI/prompt improvements.

**Pivotal update vs. the May 10 report:** the "zero competitors do this" framing is no longer accurate. Several direct competitors shipped between Nov 2025 and now. The moat narrative needs to shift from "first to do this" to "fastest, most accurate, and one-handed-built." Details below.

---

## Top Findings

- **Direct competitors exist now.** Grocery AI (App Store id 1544118181) ships the full Snap & Shop pipeline today: handwritten list → categorized checklist, plus receipts, fridge photos, store-aisle reorder, Apple Watch, widgets. Target's in-app **List Scanner** (Nov 2025) does handwritten list → Target cart inline. "AI Grocery Shopping List" (PantryBox, id 6744852509), GroceryList.ai, Alist, and "AI Grocery List Shopping Maker" are all shipping with paywalls and photo input. The differentiator can no longer be *existence* of the pipeline — it has to be **speed (<10s), quality on partner-text-screenshots, and one-handed in-store UX**. Reframe the App Store positioning before launch.
- **Instacart IDP is closed.** Per the current docs page: *"Instacart is currently not accepting new applications, and there is no waitlist available at this time."* If we hadn't already applied, that revenue stream is on hold. Pivot the affiliate stack to ButcherBox ($20/signup, Impact), Blue Apron ($15/signup, CJ), and Thrive Market (up to $30/CPS, 14-day cookie) — all open and approving in days, not weeks. Monitor Instacart IDP weekly for reopen.
- **Apple Foundation Models guided generation (`@Generable`) collapses the normalization layer.** With iOS 26, attaching `@Generable` to a Swift struct returns a typed, constraint-decoded value directly — no JSON parse step, no schema drift. This is materially better than our planned "Foundation Models returns text → JS parses" flow. Build the Capacitor plugin so the Swift side does `@Generable struct ParsedItem` and returns the array already shaped. Less surface for parse errors, lower latency.
- **There are now TWO mature Capacitor on-device LLM plugins.** `@capgo/capacitor-llm` (community, what we picked May 10) and an official `Capacitor LocalLLM` plugin (new). Both wrap Apple Intelligence / Foundation Models. The official one has tighter alignment with the Capacitor docs site and unified TS surface across iOS/Android. **Recommendation: re-evaluate before integrating.** If the official plugin supports `@Generable`-typed responses, switch; otherwise stay on `@capgo`.
- **App Store SDK gate already in force.** As of April 28, 2026, every new App Store Connect submission must build with Xcode 26 + iOS 26 SDK. Our Phase 2 (Capacitor wrap) cannot ship via TestFlight without this. Confirm Xcode 26.0.1+ on the build machine before starting.

---

## Capacitor / Native Implementation Notes

**Foundation Models with `@Generable` (revised Phase 4 plan):**
- Define on the Swift side, inside the plugin:
  ```swift
  @Generable
  struct ParsedItem {
      @Guide(description: "Canonical product name, e.g. '2% Milk' not 'milk 2 percent'")
      let name: String
      @Guide(description: "Numeric quantity if specified; otherwise 1")
      let quantity: Int
      @Guide(description: "One of: ea, lb, oz, gal, qt, pt, doz, bunch, bag, box")
      let unit: String
      @Guide(description: "Section label from fixed list")
      let section: GrocerySection
      let crossedOut: Bool
  }
  enum GrocerySection: String, Generable, CaseIterable {
      case produce, dairy, meatSeafood, bakery, frozen, pantry, beverages, household, other
  }
  ```
- Constrained decoding means `section` literally cannot return anything outside the enum — eliminates a class of bugs the cloud Claude path has to handle with retries.
- Bridge: the plugin serializes the `[ParsedItem]` to JSON once, hands it to the WKWebView. JS sees the same `ParsedItem[]` contract as the cloud path. Contract locked.
- **Hardware floor stays the same**: iPhone 15 Pro / M-series. Use `SystemLanguageModel.default.availability` (not a hand-rolled feature check) — Apple's API tells you `.available`, `.unavailable(.deviceNotEligible)`, `.unavailable(.appleIntelligenceNotEnabled)`, etc. Route every non-`.available` case to cloud Claude, surface user-visible messaging only for `.appleIntelligenceNotEnabled` (they can fix that in Settings).

**Vision OCR plugin (Phase 3) — confirmed scope:**
- `VNRecognizeTextRequest` API surface unchanged from prior research. The May 10 plan still holds: `.accurate`, `usesLanguageCorrection: true`, `customWords`, `["en-US"]`, per-word bounding boxes + confidence.
- **Known iOS 26 caveat**: VisionKit (the document-scanner UI, distinct from the Vision framework's OCR API) has cosmetic regression on iOS/iPadOS 26 — top bar appears as a gray strip, edit buttons hard to see. We're using the Vision *framework* directly, not VisionKit's `VNDocumentCameraViewController`, so this doesn't affect us. But if we ever consider VisionKit's auto-scan UI, hold off until Apple ships a fix.
- Use `RecognizeTextRequest` (the newer Swift Concurrency form) instead of `VNRecognizeTextRequest` for new code — async/await, cleaner.

**Capacitor wrap (Phase 2):**
- Capacitor 7 is fully compatible with Xcode 26 + iOS 26 SDK. No migration work on the Capacitor side.
- NodeJS 22+ required for the build machine.
- iOS deployment target: 14.0 (Capacitor default) is fine for the WebView shell, but Foundation Models / Apple Intelligence features require iOS 26 + A17 Pro / M-series at runtime. Two-layer compatibility floor.

**Cloudflare Workers proxy (Phase 1) — no change to prior plan:**
- Worker → AI Gateway → Claude. Auth on JWT user ID, not IP. Caching, rate limits, fallback all configured at the Gateway.
- Gateway endpoint format: `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/anthropic/`. Change `baseURL` in the SDK, leave everything else alone.

---

## Mobile UX Recommendations

- **Re-evaluate the camera-first home screen given competition.** Grocery AI and Target's List Scanner are also camera-first. The differentiator isn't camera-first; it's **time-to-list**. Instrument the capture-to-checklist latency and make it the visible North Star metric in dev. <10s end-to-end on a mid-decile phone is the bar; <5s is the headline-worthy claim. If we can credibly say "5 seconds from photo to shopping" on the App Store page, we win the funnel.
- **Partner-text-screenshot is the unowned use case.** None of the competitors specifically tout the "screenshot of partner's text" flow — they all emphasize handwritten lists, receipts, or fridge photos. But screenshots of iMessage/WhatsApp/SMS are how a lot of real lists actually arrive in 2026. Train and test on this format explicitly: stylized bubbles, sender bars, timestamps, sometimes-mixed emoji. Surface it on the marketing site as a hero use case.
- **One-handed in-store UX is still wide open.** OurGroceries, AnyList, and Grocery AI all use standard checkboxes. None has built a checklist designed *specifically* for thumb reach with a cart-pushing hand. Full-row tap targets, bottom-anchored section nav, persistent scroll across backgrounding, haptic-on-check, swipe-down to dismiss section — these are still differentiators.
- **First-photo flow without login remains critical.** All the new entrants paywall or signup-gate eventually; very few do the first scan zero-friction. Keep this. The single best App Store screenshot will be the second tap of the app on a fresh install showing a captured list — no signup interstitial in the middle.
- **Capture-quality nudge stays in.** Blur and lighting are the #1 source of bad parses in any field-tested OCR pipeline; a "retake or send anyway" sheet costs ~1 day and saves user-perceived quality enormously.

---

## AI / Prompt Improvements

**Cloud Claude path — refinements on top of May 10's plan:**
- **Add explicit "this is handwritten" priming** in the system prompt. Anthropic's own multimodal best-practices doc confirms this is the highest-leverage single prompt change for handwriting OCR.
- **Push the few-shot exemplars deeper.** The May 10 plan listed 5; Anthropic's vision cookbook recommends 3–5, but for the *specific* failure modes our app sees (crossed-out items, multi-column, screenshot bubbles), each failure mode deserves its own exemplar. Suggested 8-exemplar set:
  1. Clean printed list → pass-through
  2. Cursive handwriting with abbreviations (OJ, PB, doz) → expanded
  3. Crossed-out items → `crossedOut: true`, not omitted
  4. Multi-column layout → flat list, reading order preserved
  5. iMessage screenshot with bubbles + timestamps → text only, no metadata
  6. Mixed printed + handwritten margin notes → both captured
  7. Quantity in front of item ("2 milk") → `{quantity: 2, name: "Milk", unit: "ea"}`
  8. Unit ambiguity ("1 lb chicken") → `{quantity: 1, unit: "lb", name: "Chicken"}`
- Wrap examples in `<examples><example>...</example></examples>` per Anthropic guidance. Don't skip this — it materially affects how Claude segments the prompt.
- **Closed enum for section labels** (already in May 10 plan) — confirm again post-implementation by sampling 100 prod outputs and asserting `section ∈ <closed set>`. Drift is the #1 sign the few-shot is being ignored.

**On-device Foundation Models path:**
- `@Generable` *guarantees* structural validity at the type level. The remaining failure mode is semantic — wrong name, wrong section. Eval the on-device path against the same 50-photo held-out set as the cloud path. Headline metric: side-by-side parse-correctness % and median latency. Decision rule for routing: if on-device wins on latency by >2× AND parse-correctness within 5 pp, route by default; otherwise cloud for free users, on-device for Pro who explicitly opt-in.
- **Two-shot, not few-shot, for on-device.** The 3B-parameter on-device model has a smaller context budget than Claude. Use 2 strong exemplars max (cursive + crossed-out), rely on the type system for structure.

**Semantic normalization specifically:**
- Use a small canonical-name lookup as a post-processing step before either model runs. Map `oj → orange juice`, `milk 2% → 2% milk`, `pb → peanut butter`, `doz eggs → 12 eggs`, etc. A 200-entry hand-curated list will outperform LLM normalization on the long tail of obvious abbreviations and is essentially free at runtime. Save the LLM for the cases the lookup doesn't catch.

---

## Competitor Intel

**Grocery AI (groceryai.com / App Store id 1544118181) — the closest direct competitor.**
- Full feature parity with our planned pipeline: handwritten list, receipts, fridge/pantry photos, AI classification, store-aisle reordering, voice add, real-time pricing across Target/Walmart/Costco, Apple Watch, widgets, multi-device.
- Multi-platform from day one (iPhone, iPad, Mac, Watch). We're iPhone-only for v1 — that's a comparative deficit if a reviewer looks at both apps.
- Founded 2021 (based on App Store ID), so multi-year head start.
- **Action:** install it, test our 10 toughest sample lists against it, document where it fails. Those failures are our marketing copy.

**Target's "List Scanner" (Nov 2025).**
- In-app feature, not a standalone product. Scans handwritten lists directly into Target cart. Located under My Target → Lists & Favorites → My Shopping List.
- Strategic risk: if Walmart, Kroger, or Whole Foods ship the same feature in their apps, the "scan a list" capability gets commoditized by the retailers themselves. Our wedge becomes "store-agnostic + better UX" — which is defensible but not novel.

**Other shipping AI grocery list apps (lower threat each, but stacked up they crowd the search results):**
- **AI Grocery Shopping List / PantryBox** (id 6744852509) — voice, photo, text with smart product/quantity/store recognition. Family + Personal subscription tiers. 3-day free trial (shorter than our planned 7-day).
- **GroceryList.ai** (id 6737476969) — listed on App Store, AI-branded grocery list.
- **Grocery Shopping List - Alist** (id 6739451339) — AI Recipe Scanner extracts ingredients from recipe photos.
- **AI Grocery List Shopping Maker** (id 6744245155) — smart suggestions and categories.

**Apps still without AI/OCR (May 10 confirmation holds):**
- **AnyList** — still recipe import and voice assistant integration only, no photo OCR. Our individual paid pricing is $19.99/yr vs. their ~$10/yr; we need to justify the premium with quality.
- **OurGroceries** — barcode scan + "add item by photo" (object recognition, not list OCR) only. No full-list OCR pipeline. Database of 17M UPCs is theirs, not ours.
- **Google Keep** — still no OCR pipeline for lists.

**Key takeaway:** the competitive map split into two tiers since May. Tier 1 (Grocery AI, Target) are real threats. Tier 2 (AnyList, OurGroceries, Keep) is unchanged. Our positioning needs to win the head-to-head against Grocery AI specifically.

---

## Revenue Opportunities

**Instacart IDP — CLOSED, no waitlist.**
- Per docs: not accepting applications, no waitlist. Either we're already in (May 10 plan said to apply that week — confirm status in the dashboard) or this stream is paused indefinitely.
- **Action:** if we did apply on/around May 10, check approval status. If denied or pending, don't block the launch on Instacart revenue. Set a calendar reminder to re-check eligibility monthly.

**Affiliate stack still open and approving:**
- **ButcherBox**: $20/sub, 30-day cookie, Impact program, free to join in the US.
- **Blue Apron**: $15/confirmed sale, 30-day cookie, CJ program, $50 minimum payout threshold.
- **Thrive Market**: up to $30 CPS, 14-day cookie. Shorter cookie window — surface affiliate suggestions in-session, not as background email nudges.

**Pricing — no change to May 10 plan, but tighten the trial offer.**
- $19.99/yr or $2.99/mo, 7-day trial. PantryBox runs a 3-day trial; our 7-day is a meaningful concession in our favor and worth A/B testing.
- Free tier of 5 scans/month still feels right. Validate with the first 1000 users — if conversion below 4%, drop to 3 scans/month before lowering price.

**RevenueCat — same recommendation as May 10.**
- Capacitor SDK is mature; paywalls v2 for Capacitor is roadmapped but no ETA. Ship with paywalls v1 templates, migrate when v2 lands.
- Free up to $2.5K MTR; 1% after. Effectively zero infrastructure cost until product-market fit.

---

## Long-Term Vision Notes (research only)

- **The competition specifically does NOT generalize.** Grocery AI is hyper-focused on grocery; Target's scanner is locked to Target inventory. If we keep the ingestion pipeline generic (the May 10 plan), we maintain the *unique* future path toward general handwritten capture (meeting notes, todos, plans, etc.) while still being the best grocery app today. The generalization is the long-term moat against Grocery AI specifically.
- **Apple Foundation Models has a near-perfect fit for an intent classifier.** A single `@Generable enum CapturedContent { case grocery, todo, meeting, recipe, mixed, other }` Swift type is two lines of code, on-device, free, and fast. Once this exists, downstream rendering branches on type. This is the cleanest path to the "general capture" vision.
- **iOS 26's on-device model is small (~3B).** It's good enough for normalization and classification but not for novel reasoning. Architectural lesson for the long-term: cloud Claude does interpretation; on-device Foundation Models does normalization, classification, and structural cleanup. That split keeps costs down and quality up as we expand to other capture types.
- **Apple Notes / Reminders / Notion export via share sheet remains the right v2 mechanism.** No new platform-side blockers since May 10.

---

## Build Queue (ranked, actionable)

### THIS WEEK
1. **Install Grocery AI, test it against our 10 hardest sample lists.** Document where it fails (handwriting style, layout, screenshots). Those failures become the App Store screenshots and the marketing site hero examples. Two hours of work; highest-leverage competitive intel we can do.
2. **Verify Instacart IDP application status** (assuming we applied per May 10 plan). If pending, do nothing. If we never applied, mark as deferred — the program is closed.
3. **Lock the `ParsedItem` JSON contract.** Same contract both cloud and on-device paths return. Define once, in `src/types/parsedItem.ts`, and import everywhere. Without this lock, the `@Generable` Swift struct in Phase 4 won't line up cleanly with the cloud path.
4. **Confirm build machine has Xcode 26.0.1+** (or 26.2 on Tahoe). App Store submissions without this fail.

### NEXT 2-4 WEEKS
5. **Cloudflare Worker + AI Gateway proxy** — unchanged from May 10. Worker → Gateway → Claude. JWT auth, caching, rate limit by user ID. Highest-impact infra task remaining.
6. **Capacitor wrap (Phase 2).** Capacitor 7, Xcode 26. Keep React UI intact. Add `@capacitor/camera`. First TestFlight build for iPhone 15 Pro.
7. **Custom Apple Vision OCR plugin (Phase 3).** Use `RecognizeTextRequest` (async form), `.accurate`, `usesLanguageCorrection: true`, 500-word `customWords` grocery vocab, `["en-US"]`. Confidence threshold of 0.7 routes low-confidence items to cloud Claude.
8. **8-exemplar few-shot prompt for cloud path.** Build the eval harness alongside it — 50 held-out photos, parse-correctness % as headline metric, latency p50/p95 alongside.
9. **200-entry canonical-name lookup table.** Pre-LLM normalization step. JSON file checked into the repo. Cheap, beats LLM on the obvious cases, frees up the LLM context budget for the hard ones.

### 1-2 MONTHS OUT
10. **Foundation Models plugin with `@Generable` typed output (revised Phase 4).** Re-evaluate `@capgo/capacitor-llm` vs. official `Capacitor LocalLLM` for `@Generable` support before integrating. Hardware floor check via `SystemLanguageModel.default.availability`. Older devices and non-Apple-Intelligence-enabled cases fall through to cloud — silently, not paywalled.
11. **`useProTier()` + paywall bottom sheet (Phase 5).** Tiers: `free` (5 scans/mo), `pro` (unlimited + on-device + future features). Trigger sheet on scan #6 with a "scans reset in N days" countdown.
12. **RevenueCat + StoreKit 2 (Phase 6).** Two Offerings: "Trial" (7-day on monthly + annual) and "No-Trial". `SubscriptionStoreView` with a RevenueCat Offering on iOS 17+.
13. **BYO key fallback UI (Phase 7).** Settings screen for user's own Anthropic API key, stored in Keychain. Worker proxies via user's key when set.
14. **In-store mode auto-activation.** Geofence on grocery chains, forced dark mode, larger tap targets, persistent scroll, haptic on check-off.

### BACKBURNER
15. ButcherBox / Blue Apron / Thrive Market affiliate integration (apply for all three in parallel; surface contextual recs once approved).
16. Generic intent classifier via Foundation Models (`@Generable enum CapturedContent`). Groundwork for the broader vision.
17. Per-item Instacart affiliate links (only if IDP reopens).
18. Multi-platform expansion (iPad, Mac, Apple Watch). Grocery AI has this; we don't. Real cost but no urgency until iPhone funnel is dialed in.

---

## Sources

- [Grocery AI on the App Store](https://apps.apple.com/us/app/grocery-ai/id1544118181)
- [Grocery AI website](https://www.groceryai.com/)
- [Target debuts list scanner tool — Grocery Dive](https://www.grocerydive.com/news/target-debuts-list-scanner-tool/805438/)
- [Target's AI-powered holiday shopping launch announcement](https://corporate.target.com/press/release/2025/11/target-launches-new-ai-powered-features-to-make-holiday-shopping-easier,-smarter-and-more-fun)
- [AI Grocery Shopping List (PantryBox)](https://apps.apple.com/us/app/ai-grocery-shopping-list/id6744852509)
- [Best Grocery List Apps for iPhone 2026](https://iosapplists.com/best-grocery-list-apps-for-iphone/)
- [Apple Foundation Models documentation](https://developer.apple.com/documentation/FoundationModels)
- [Guided Generation with FoundationModels (Medium)](https://medium.com/@luizfernandosalvaterra/guided-generation-with-foundationmodels-how-to-get-swift-structs-from-llms-ad663e60d716)
- [Working with @Generable and @Guide (AppCoda)](https://www.appcoda.com/generable/)
- [Meet the Foundation Models framework — WWDC25](https://developer.apple.com/videos/play/wwdc2025/286/)
- [Capacitor LocalLLM (official) plugin docs](https://capacitorjs.com/docs/apis/local-llm)
- [@capgo/capacitor-llm on npm](https://www.npmjs.com/package/@capgo/capacitor-llm)
- [Apple's Xcode 26 requirement for Capacitor apps](https://capawesome.io/blog/xcode-26-requirement-for-capacitor-apps/)
- [Capacitor 7 environment setup](https://capacitorjs.com/docs/getting-started/environment-setup)
- [RecognizeTextRequest documentation](https://developer.apple.com/documentation/vision/recognizetextrequest)
- [Apple Vision framework — built-in features](https://blakecrosley.com/blog/vision-framework-built-in)
- [Claude vision best practices](https://platform.claude.com/cookbook/multimodal-best-practices-for-vision)
- [Claude prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- [Cloudflare AI Gateway REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/)
- [Cloudflare AI Gateway rate limiting](https://developers.cloudflare.com/ai-gateway/features/rate-limiting/)
- [Instacart Developer Platform approval process](https://docs.instacart.com/developer_platform_api/guide/concepts/launch_activities/approval_process/)
- [Instacart conversion tracking and payments](https://docs.instacart.com/developer_platform_api/guide/concepts/launch_activities/conversions_and_payments/)
- [RevenueCat Capacitor SDK docs](https://www.revenuecat.com/docs/getting-started/installation/capacitor)
- [RevenueCat Capacitor SDK on GitHub](https://github.com/RevenueCat/purchases-capacitor)
- [StoreKit 2 vs RevenueCat — 2026](https://theswiftk.it.com/blog/storekit-2-vs-revenuecat-ios-subscriptions)
- [ButcherBox Affiliate Program (UpPromote directory)](https://uppromote.com/affiliate-program-directory/butcherbox/)
- [Blue Apron Affiliate Program](https://www.way2earning.com/2024/11/blue-apron-affiliate-program/)
- [Thrive Market Affiliate Program](https://thrivemarket.com/affiliate-program)
