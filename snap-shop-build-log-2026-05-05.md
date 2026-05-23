# Snap & Shop Build Log — 2026-05-05

**Build phase at start of session:** Phase 1 (Cloudflare Workers proxy) — not yet done.  
**Build phase at end of session:** Phase 1 complete (proxy scaffolded + frontend wired). Phase 2 (Capacitor) is next.

---

## Summary

Four improvements implemented in this session, all aligned with Build Phase 1 of the roadmap.

---

## Changes Made

### 1. Cloudflare Workers proxy scaffold — `workers/`

**New files:**
- `workers/src/index.ts` — The Worker. Routes `POST /messages` and `POST /ocr` to the Anthropic Messages API. Validates the `X-API-Key` shared secret header. Optionally routes through Cloudflare AI Gateway when `CF_ACCOUNT` secret is set (adds usage analytics + spend cap). CORS headers on all responses.
- `workers/wrangler.toml` — Wrangler config. Name: `snap-shop-proxy`. Notes on how to set secrets and configure rate limiting in the dashboard.
- `workers/package.json` — Minimal package with `wrangler` and `@cloudflare/workers-types` devDependencies.
- `workers/tsconfig.json` — TypeScript config for Workers runtime types.
- `workers/.dev.vars.example` — Template for the gitignored `.dev.vars` file used in `wrangler dev`.

**To deploy:**
```bash
cd workers
npm install
cp .dev.vars.example .dev.vars   # fill in ANTHROPIC_KEY, API_SECRET
wrangler deploy
```
Then set `VITE_API_URL=https://snap-shop-proxy.your-subdomain.workers.dev` and `VITE_API_SECRET=<your secret>` in the PWA's `.env`.

**Skipped:** Rate limiting rule syntax in wrangler.toml (configure in CF dashboard — Workers & Pages → snap-shop-proxy → Settings → Rate Limiting). Recommended: 10 req/min per IP, 100/day per IP.

---

### 2. `src/lib/apiClient.js` + updated `src/hooks/useClaude.js`

**New file:** `src/lib/apiClient.js`

A routing-aware API client for all Anthropic calls:
- If `VITE_API_URL` is set → routes through the CF Worker. API key never touches the browser bundle.
- If only `VITE_ANTHROPIC_API_KEY` is set → falls back to direct Anthropic SDK (dev-only path, unchanged from before).
- Exports `callClaude({ system, messages, maxTokens })` and `USE_WORKER` flag.

**Modified file:** `src/hooks/useClaude.js`

- Removed `import Anthropic from '@anthropic-ai/sdk'`
- Removed `anthropicClient` `useMemo`
- `callAnthropic()` now delegates to `_callClaudeAPI()` from apiClient.js
- `suggestExpansions()` Anthropic branch now delegates to `_callClaudeAPI()`
- `PROVIDER` check updated: `(USE_WORKER || ANTHROPIC_KEY) ? 'anthropic' : 'ollama'`
- `hasApiKey` return value now reflects both sources
- All Ollama logic unchanged — existing local model path is unaffected

**Note:** The `@anthropic-ai/sdk` package remains in `package.json` as it's still imported by `apiClient.js` for the dev fallback path. Once the Worker is deployed to production you can remove it and set `VITE_API_URL` only.

---

### 3. Wake Lock API in `src/components/InStoreMode.jsx`

Added `navigator.wakeLock.request('screen')` on mount. Prevents the phone screen from sleeping while the user is shopping.

- Acquires the lock when InStoreMode mounts
- Re-acquires on `visibilitychange` (lock is released when the user switches apps)
- Releases on unmount
- Gracefully no-ops on browsers that don't support the Wake Lock API (Safari < 16.4 on PWA home-screen)
- No dependencies, no packages required

---

### 4. `GROCERY_SYSTEM_PROMPT` — Fixed missing categories + improved rules

**Modified file:** `src/utils/groceryListPrompt.js`

**Bug fixed:** `Snacks` and `Household` existed in `CATEGORIES` (categories.js) but were absent from the `GROCERY_SYSTEM_PROMPT` category list. This caused Claude to classify chips as "Other" and toilet paper as "Other" instead of their correct categories.

**Improvements:**
- Category list in prompt now matches `CATEGORIES` exactly: includes `Snacks` and `Household`
- Added rule: include ALL item types (supplements, cleaning products, paper goods, personal care — not food only)
- Added rule: "if handwriting is unclear, make your best reasonable guess — do not skip the item" (from research)
- Added explicit exclusion list: page headers, motivational tab labels, color names, dates, prices, store names
- Updated first few-shot example to include `TP → Toilet Paper (Household)` and `chips → Chips (Snacks)` so the model sees both new categories demonstrated

---

## Skipped / Deferred

| Item | Reason |
|------|--------|
| Capacitor wrap + Xcode 26 build | Requires Xcode 26 installed, iOS device, Apple developer account |
| Apple Vision OCR plugin (custom Swift) | Requires Xcode 26 + iOS project from Capacitor wrap |
| Apple Foundation Models (`@capgo/capacitor-llm`) | Requires iOS 26 device for testing |
| RevenueCat + StoreKit 2 | Requires App Store Connect products configured |
| Instacart IDP integration | Requires IDP approval (30–40 day queue) — apply at instacart.com/company/business/developers |
| `capacitor.config.ts` | No Capacitor installed yet — Phase 2 work |
| Deploy CF Worker | Requires Cloudflare account + `wrangler login` — scaffold is complete and ready |

---

## Build Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Cloudflare Workers proxy | ✅ Scaffolded — ready to deploy with `wrangler deploy` |
| 2 | Capacitor wrap + Xcode 26 | ⏳ Next — requires Xcode 26 |
| 3 | Apple Vision OCR plugin | ⏳ After Phase 2 |
| 4 | Apple Foundation Models normalization | ⏳ After Phase 3 |
| 5 | `useProTier()` + paywall sheets | ⏳ After Phase 4 |
| 6 | StoreKit 2 via RevenueCat | ⏳ After Phase 5 |
| 7 | BYO key fallback in settings | ⏳ After Phase 6 |
