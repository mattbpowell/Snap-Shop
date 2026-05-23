# Snap & Shop Research — 2026-05-10

**Angles this run:** Capacitor + Apple AI (build phases 2-4), AI/prompt improvements, competitor intel + revenue.

---

## Top Findings

- **Phase 4 just got cheap.** `@capgo/capacitor-llm` already wraps Apple Intelligence (Foundation Models) for Capacitor on iOS 26+. We do not need to write our own Foundation Models plugin — wire up the existing one and ship. Apple Intelligence is the supported default; MediaPipe is the Android fallback.
- **Phase 3 still needs a custom plugin.** No production-grade Capacitor plugin exists for `VNRecognizeTextRequest`. It's ~150 lines of Swift. The win versus cloud OCR: free, instant, works offline. The cost: handwriting accuracy is materially worse than Claude Vision, so keep cloud as fallback for low-confidence pages.
- **AI Gateway, not raw Workers.** Wire Cloudflare AI Gateway between the Worker proxy and Claude on day one. Caching, rate limiting, model fallback, and observability come for free; retrofitting later is painful.
- **Competitive moat is intact.** AnyList, OurGroceries, Nori, and Google Keep still have no photo→categorized-list pipeline. LystBot is the only AI-native entrant, but it's chat-first (MCP + Claude Desktop), not capture-first. We have months, not weeks.
- **Apply for Instacart IDP today.** 30-40 day approval window. If we wait until paywall ships, we'll miss the affiliate-revenue ramp by a month.

---

## Capacitor + Apple AI Implementation Notes

**Foundation Models (Phase 4):**
- iOS 26+ exposes a ~3B-parameter on-device model via the `FoundationModels` framework. No API keys, no network, fully private.
- Use `@capgo/capacitor-llm` directly. JS surface is `LLM.generate({ prompt, system })`. Works for our normalization step ("Milk 2%" → "2% Milk", "doz eggs" → "12 eggs").
- **Hardware floor**: iPhone 15 Pro / iPad with M-series chip. Branch on `Capabilities.foundationModelsAvailable` and route older devices to the cloud Claude path automatically — do not paywall the fallback.

**Vision OCR (Phase 3):**
- Build a minimal `CAPPlugin` exposing `recognize({ imagePath, recognitionLevel, languages, customWords })`.
- Use `recognitionLevel: .accurate` (not `.fast`) for static photos; `.fast` is for live camera streams.
- `customWords` is a real lever — pass a 500-word grocery vocabulary (organic, gala, kombucha, scallion, ribeye, etc.). Measurable accuracy lift on ambiguous handwriting per Apple docs.
- Pass `usesLanguageCorrection: true` and language hints `["en-US"]`.
- Return per-word bounding boxes + confidence. Items below ~0.7 confidence get re-routed to cloud Claude; pure on-device flow drops them as `needsConfirmation`.

**Capacitor wrap (Phase 2):**
- Capacitor 7 + Xcode 26. Keep the existing React + Tailwind UI intact — only the native plugins are new. Don't subclass `CAPBridgeViewController` unless we need a custom message handler (we don't yet).
- Use `@capacitor/camera`, NOT `getUserMedia`. iOS Safari photo permissions inside WKWebView are quirky and the prompt UX is worse than the native one.
- Set `WKAppBoundDomains` in `Info.plist` and configure `limitsNavigationsToAppBoundDomains` if we want to lock down where the webview can navigate (recommended once we wrap).

**JS interface parity:**
- Both cloud and on-device pipelines must return the same `{ items: ParsedItem[] }` shape so `useProTier()` can swap them transparently and we can A/B in production. Define this contract before building either plugin.

---

## Mobile UX Recommendations

- **Camera-first home screen.** For returning users with no active list, open the camera by default. One giant capture button at thumb height. Auto-stabilize and auto-crop; do NOT require a "looks good?" tap before processing — show a 1-second preview during the upload and process in parallel. Time-to-list is the whole product.
- **One-handed checklist.** Sticky section headers at top (Produce, Dairy, Meat...). Bottom-sheet checklist with rows tall enough that the entire row is the tap target — never require hitting a 24px checkbox while pushing a cart. OurGroceries gets this wrong; we should not.
- **In-store mode.** Auto-activate when geolocation matches a known grocery store (Foursquare Places API or hardcoded chains via reverse geocoding). Forced dark mode, larger tap targets, haptic on every check-off, animated strikethrough. Persist scroll position when the app goes background and comes back — shoppers context-switch to maps, messages, etc. constantly.
- **No login wall on first scan.** First photo → list flow must work in <10 seconds for a brand-new user with zero account. Sign-in only when they want sync across devices or hit the paywall. This is also the gating UX metric for app store reviews.
- **PWA → native migration UX.** When the iOS app launches, detect existing PWA users (via shared Keychain group or first-run import flow) and auto-migrate their lists. Don't make them re-onboard.
- **Capture quality nudge.** If the photo is blurry or under-lit, show a "retake or send anyway" sheet with a one-tap retake. Don't silently process a bad image and return garbage.

---

## AI / Prompt Improvements

**System prompt for cloud Claude path:**
- Prime explicitly: *"This is a handwritten grocery list. It may contain abbreviations, multi-column layouts, or crossed-out items. Items crossed out should be returned with `crossedOut: true` but not omitted."* Recent benchmark studies show priming with "this is handwritten" raises accuracy on ambiguous characters meaningfully.
- Enumerate the closed set of section labels — don't let the model invent its own. `["Produce", "Dairy", "Meat & Seafood", "Bakery", "Frozen", "Pantry", "Beverages", "Household", "Other"]`. Reduces drift across runs.

**Few-shot exemplars (5, in order):**
1. Clean handwriting, simple list → straight pass-through
2. Abbreviations: "OJ" → "Orange Juice", "Milk 2%" → "2% Milk", "PB" → "Peanut Butter"
3. Ambiguous quantities: "doz eggs" → `{ name: "Eggs", quantity: 12 }`, "2 lb gr beef" → `{ name: "Ground Beef", quantity: 2, unit: "lb" }`
4. Struck-through item → returned with `crossedOut: true`
5. Multi-column / messy layout → reading order preserved

Claude Opus 4.6 / Sonnet 4.6 weight examples heavily — keep them tight and aligned with desired behavior.

**Two-pass for ambiguity:**
- Low-confidence items return `{ name, alternatives: [...], needsConfirmation: true }`. Show inline edit chip in UI rather than discarding. Better than guessing wrong.

**Image preprocessing on client (before upload):**
- Downscale to 1568px max edge (Claude's preferred, no quality loss for OCR).
- Convert to 8-bit RGB, strip alpha, flatten transparency.
- JPEG quality 85.
- Cuts upload payload ~70% and reduces our Cloudflare egress cost. Claude tokenizes the same way regardless of input size beyond 1568px.

**On-device normalization prompt (Foundation Models path):**
- Keep it tiny: "Normalize each grocery item to its canonical name. Title case. Singular unless the original quantity implies plural. Return JSON array."
- Foundation Models is ~3B params; complex instructions degrade quickly. Push categorization to a separate small lookup or model call rather than asking for both at once.

---

## Competitor Intel

- **AnyList ($9.99/yr individual, $14.99 household)** — polished, deep recipe import, meal planning, fast shared lists. No OCR/AI image ingestion. Moat is recipe + scaling, not capture. Their pricing is the anchor we're priced against.
- **OurGroceries (free + paid)** — fastest real-time sync, weak on recipes, no OCR. Differentiated on simplicity, not AI.
- **LystBot** — AI-first via MCP server + Claude Desktop. Natural-language list management ("add ingredients for pad thai"). No mobile photo capture story confirmed. **Watch closely — this is the only player with an AI-native posture, and they could add image ingestion at any time.**
- **Nori** — best family shopping list app per multiple 2026 reviews. Meal-plan → grocery automation, voice input. Voice is adjacent but not the same wedge as photo; doesn't currently compete on ingestion.
- **Google Keep** — generic OCR exists but no grocery normalization or section sorting. Same story for Apple Notes scan.
- **Net read:** "photo of any existing list → categorized checklist in <10 seconds" remains genuinely uncontested. The window closes when LystBot or Nori ship image ingestion, which is plausible within 6 months. Move fast on iOS-native polish.

---

## Revenue Opportunities

**Instacart IDP — apply this week.**
- ~30-40 day approval from access request to production key. Affiliate payments run through Impact, requires an Instacart Tastemakers account.
- Wire affiliate links per matched item once approved. "Tap to order this list on Instacart" CTA at checklist bottom = high-intent, contextual.

**Pricing — $19.99/yr or $2.99/mo with 7-day trial.**
- 2x AnyList's individual price. Justified ONLY if parse quality is consistently good. If we ship and the parse fails on >15% of real-world handwritten lists, drop to $9.99/yr.
- Free tier: 5 scans/month (rather than feature-gating). Users feel the value of unlimited capture before hitting the wall.
- Annual is the goal: 7-day trial → annual converts at ~3-4x the rate of monthly per RevenueCat industry data. Set up two Offerings: "Trial" (with 7-day on monthly + annual) and "No-Trial" (post-trial).

**RevenueCat is the right call.**
- Free up to $2.5K MTR, then 1%. Effectively zero cost until product-market fit.
- Remote-config paywalls = iterate paywall copy, layouts, and prices without an app submission. Critical for the first 3-6 months.
- Use `StoreView` / `SubscriptionStoreView` with a RevenueCat Offering on iOS 17+ — gets us the native StoreKit UI plus RevenueCat's analytics and entitlement management.

**Affiliate stack to apply for in parallel:**
- Thrive Market ($40/signup), ButcherBox ($20/signup), Blue Apron ($15/signup). Surface as contextual suggestions when relevant items appear on a list ("looks like you're buying meat — try ButcherBox").
- Each program has its own approval path; start them all now so they land within the first 60 days post-launch.

---

## Long-Term Vision Notes (research only)

- LystBot's MCP-based architecture is a real signal that "list management via natural-language interface" is a credible product wedge. If we extend Snap & Shop into general handwritten capture (notes, todos, meeting scribbles), the same Vision OCR + on-device normalization pipeline carries over with no rebuild.
- Foundation Models is well-suited to a single-call **intent classifier**: "Is this image a grocery list, a to-do, a meeting note, a recipe, or something else?" That classifier could route to specialized renderers downstream. Worth building the parsing pipeline so the "grocery" assumption isn't hardcoded — keep ingestion generic.
- Export targets are all REST-accessible from a mobile app via share sheet or MCP: Apple Notes, Reminders, Notion, Things, Obsidian. Generic capture + share-sheet exports = a credible "handwritten capture as universal input layer" play long-term.
- Voice + photo + handwriting → structured data is the natural three-input surface. Nori is going voice-first. We're going photo-first. Whoever builds all three with the same pipeline wins the bigger market.

---

## Build Queue (ranked, actionable)

### THIS WEEK
1. **Apply for Instacart IDP.** Form at instacart.com/company/business/developers. Create the Instacart Tastemakers account in parallel. Clock starts on 30-40 day approval — this is the longest lead-time item in the entire roadmap.
2. **Cloudflare Worker + AI Gateway proxy.** Worker → AI Gateway → Claude (NOT direct). Caching, rate limiting, fallback come free. Rate-limit key = `user_id` from a signed JWT in `Authorization: Bearer ...`. **Do not key on IP** — shared NAT will burn legitimate users.
3. **Client-side image preprocessing.** Downscale to 1568px max edge, strip alpha, JPEG q=85. Ship into the existing PWA before the Worker proxy lands — cuts costs from day one and the change is contained to `useUploadImage`.

### NEXT 2-4 WEEKS
4. **Capacitor wrap (Phase 2).** Capacitor 7, Xcode 26. Add `@capacitor/camera`. Keep React UI intact. First TestFlight build — target iPhone 15 Pro for Foundation Models compatibility.
5. **Custom Apple Vision OCR plugin (Phase 3).** ~150 lines Swift. JS surface: `vision.recognize({ imagePath, recognitionLevel: 'accurate', languages: ['en-US'], customWords: <500-word grocery vocab> })`. Returns per-word bounding boxes + confidence. Items below 0.7 confidence are re-routed to cloud Claude.
6. **Define `ParsedItem` contract.** Lock the JS shape: `{ name, quantity, unit, section, crossedOut, needsConfirmation, alternatives }`. Both cloud and on-device pipelines return this. Without a stable contract, `useProTier()` swap will leak abstraction.
7. **Few-shot prompt overhaul for cloud path.** 5 hand-curated exemplars (see AI section above). Eval against a held-out set of 50 real handwritten photos before shipping. Track parse-correctness % as the headline metric.

### 1-2 MONTHS OUT
8. **`@capgo/capacitor-llm` integration (Phase 4).** On-device Foundation Models for normalization. Branch on hardware capability — older devices fall through to cloud Claude (do NOT paywall the fallback).
9. **`useProTier()` hook + paywall bottom sheet (Phase 5).** Tier states: `free` (5 scans/mo), `pro` (unlimited + on-device + future features). Trigger sheet on scan #6.
10. **RevenueCat + StoreKit 2 (Phase 6).** Two Offerings: "Trial" (7-day on monthly + annual) and "No-Trial". Use `SubscriptionStoreView` with a RevenueCat Offering for native UI + RevenueCat analytics.
11. **BYO key fallback UI (Phase 7).** Settings screen for user's own Anthropic API key. Store in Keychain. When set, Worker proxies via user's key. Important escape hatch for power users and privacy-focused holdouts who won't subscribe.
12. **In-store mode auto-activation.** Geofence on known grocery chains, dark mode, larger tap targets, persistent scroll, haptic on check-off.

### BACKBURNER
13. Per-item Instacart affiliate links (post-IDP approval).
14. Thrive Market / ButcherBox / Blue Apron contextual suggestions.
15. Generic intent classifier via Foundation Models — groundwork for the broader handwritten-capture vision. Don't build until grocery flow is rock-solid.

---

## Sources

- [Apple Foundation Models documentation](https://developer.apple.com/documentation/FoundationModels)
- [@capgo/capacitor-llm (npm)](https://www.npmjs.com/package/@capgo/capacitor-llm)
- [Cap-go/capacitor-llm (GitHub)](https://github.com/Cap-go/capacitor-llm)
- [VNRecognizeTextRequest documentation](https://developer.apple.com/documentation/vision/vnrecognizetextrequest)
- [Capacitor iOS Plugin Guide](https://capacitorjs.com/docs/plugins/ios)
- [Custom Native iOS Code (Capacitor)](https://capacitorjs.com/docs/ios/custom-code)
- [Cloudflare AI Gateway rate limiting](https://developers.cloudflare.com/ai-gateway/features/rate-limiting/)
- [Cloudflare Workers rate limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [RevenueCat StoreKit 2 paywall guide](https://www.revenuecat.com/blog/engineering/storekit-views-guide-paywall-swift-ui/)
- [StoreKit 2 vs RevenueCat — 2026 comparison](https://theswiftk.it.com/blog/storekit-2-vs-revenuecat-ios-subscriptions)
- [Instacart Developer Platform — approval process](https://docs.instacart.com/developer_platform_api/guide/concepts/launch_activities/approval_process/)
- [Instacart conversion tracking and affiliate payments](https://docs.instacart.com/developer_platform_api/guide/concepts/launch_activities/conversions_and_payments/)
- [Best Grocery List Apps 2026 (LystBot)](https://lystbot.com/blog/best-grocery-list-apps/)
- [Best Family Shopping List App 2026 (Nori)](https://heynori.com/blog/best-family-shopping-list-app)
- [Claude prompt engineering best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- [LLM OCR Prompt Engineering Guide Q1 2026](https://zenn.dev/coffin299/articles/60ba24446c0c27?locale=en)
- [Benchmarking LLMs for Handwritten Text Recognition](https://arxiv.org/pdf/2503.15195)
