/**
 * Snap & Shop — Capacitor configuration
 *
 * Bring-up sequence (run from this directory):
 *   npm install
 *   npm run build              # populates dist/
 *   npx cap add ios            # generates ios/App
 *   npx cap sync ios           # copies dist/ into ios/App/App/public
 *   npx cap open ios           # opens Xcode 26
 *
 * In Xcode: set the signing team, deployment target = iOS 26.0, and run on a
 * physical device (Vision framework's handwriting OCR is unreliable on Simulator).
 */

import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.snapandshop.app',
  appName: 'Snap & Shop',
  webDir: 'dist',
  ios: {
    // 'never' — our CSS env(safe-area-inset-*) owns all spacing math.
    // 'automatic' double-applies insets at scroll-end, which made the
    // bottom bar appear to grow in height once the page bottomed out.
    contentInset: 'never',
  },
  // server: { url: 'http://<lan-ip>:5173', cleartext: true },  // dev live-reload only
}

export default config
