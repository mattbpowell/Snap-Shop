/**
 * Capacitor configuration for Snap & Shop.
 *
 * Generated for Phase 2 of the build sequence (Capacitor wrap → first iOS build).
 * The bundle ID matches the research-recommended app identifier so RevenueCat,
 * StoreKit 2, and the App Store Connect record will all line up later.
 *
 * After installing dependencies (`npm install`), the standard bring-up sequence is:
 *
 *   npx cap init "Snap & Shop" com.snapandshop.app --web-dir dist  # (no-op if already initialized via this file)
 *   npm run build                                                  # Vite → dist/
 *   npx cap add ios                                                # creates ios/App
 *   npx cap sync ios                                               # copies dist/ into ios/App/public/
 *   npx cap open ios                                               # opens Xcode 26
 *
 * Server config: only set `server.url` for live-reload during dev. In production
 * the bundle is shipped from `dist/` (web-dir), so server config is unset.
 *
 * Plugin notes (Phases 3+):
 *   - VisionOCR — local Swift plugin lives at ios/App/App/Plugins/VisionOCR/
 *     and registers itself via the CAP_PLUGIN macro; no JS-side config here.
 *   - @capgo/capacitor-llm — Apple Foundation Models; Phase 4. Configured at
 *     runtime via `CapgoLLM.setModel({ path: 'Apple Intelligence' })`.
 *   - @revenuecat/purchases-capacitor — Phase 6. Configured at runtime with
 *     the public RC API key.
 */
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.snapandshop.app',
  appName: 'Snap & Shop',
  webDir: 'dist',
  ios: {
    // iOS 26 minimum (Apple Intelligence + Vision framework grocery vocab).
    // Older devices fall back to the cloud path via the CF Worker proxy.
    contentInset: 'automatic',
  },
  // No server.url in production — leave commented for dev live-reload:
  // server: {
  //   url: 'http://192.168.1.100:5173',
  //   cleartext: true,
  // },
}

export default config
