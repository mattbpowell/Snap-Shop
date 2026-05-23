/**
 * Snap & Shop — platform abstraction
 *
 * One place for "is this web or Capacitor / iOS / Android?" plus thin wrappers
 * over the cross-platform features we use today. Each wrapper:
 *
 *   1. Detects whether the Capacitor runtime is present (set on `window` once
 *      the iOS or Android shell loads).
 *   2. If yes, dynamically imports the matching plugin and uses it.
 *   3. If no, falls back to the standard web API.
 *   4. If neither is available, no-ops gracefully.
 *
 * The dynamic imports are intentional — Vite only bundles what's reachable
 * statically, and at the moment the Capacitor packages are listed in
 * package.json but may or may not be installed yet. Dynamic `import()` keeps
 * the web build buildable regardless, and lets Phase 2 (Capacitor wrap) work
 * the moment `npm install` runs without code changes here.
 *
 * Today this file is the source of truth for:
 *   - getPlatform()       → 'web' | 'ios' | 'android'
 *   - isNative()          → true on Capacitor (iOS/Android); false on web/PWA
 *   - keepScreenAwake()   → returns a release() function; works on web Wake
 *                           Lock and Capacitor KeepAwake transparently
 *
 * Phases 3+ will add: takePhoto(), recognizeText(), normalizeWithLLM(), etc.
 * Keeping these inside platform.js means UI components stay platform-agnostic.
 */

// ── Capacitor detection ─────────────────────────────────────────────────────

/**
 * True if the page is running inside a Capacitor shell (iOS / Android wrap).
 * `window.Capacitor` is set automatically by the Capacitor runtime; on a
 * regular web/PWA build it's undefined.
 */
export function isNative() {
  if (typeof window === 'undefined') return false
  const cap = window.Capacitor
  return Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())
}

/**
 * Returns 'web' | 'ios' | 'android'. Always 'web' for the PWA path.
 */
export function getPlatform() {
  if (typeof window === 'undefined') return 'web'
  const cap = window.Capacitor
  if (cap && typeof cap.getPlatform === 'function') {
    const p = cap.getPlatform()
    if (p === 'ios' || p === 'android') return p
  }
  return 'web'
}

// ── Keep-awake ──────────────────────────────────────────────────────────────

/**
 * Acquire a screen wake lock. The shopper should not lose progress because
 * their phone dimmed mid-aisle.
 *
 * Returns an async `release()` function. Idempotent — safe to call release()
 * multiple times. If neither path is supported, returns a no-op release().
 *
 * Native path (Capacitor):
 *   `@capacitor/keep-awake` — system-level lock; survives app foreground state.
 *
 * Web path:
 *   Screen Wake Lock API. Note: web wake locks are released automatically
 *   when the tab loses visibility. Callers that want to re-acquire on
 *   visibility change should listen themselves and call keepScreenAwake()
 *   again — see InStoreMode.jsx for the canonical pattern.
 */
export async function keepScreenAwake() {
  // ── Capacitor (iOS/Android) ──
  if (isNative()) {
    try {
      const mod = await import('@capacitor/keep-awake')
      if (mod?.KeepAwake?.keepAwake) {
        await mod.KeepAwake.keepAwake()
        return async () => {
          try { await mod.KeepAwake.allowSleep() } catch {}
        }
      }
    } catch (e) {
      // Plugin not installed yet — fall through to web path / no-op.
      console.warn('[platform] @capacitor/keep-awake unavailable:', e?.message)
    }
  }

  // ── Web (PWA / browser) ──
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    try {
      const lock = await navigator.wakeLock.request('screen')
      return async () => {
        try { await lock.release() } catch {}
      }
    } catch (e) {
      console.warn('[platform] wake lock not acquired:', e?.message)
    }
  }

  // ── No-op fallback ──
  return async () => {}
}

// ── Camera ──────────────────────────────────────────────────────────────────

/**
 * Capture a photo with the device camera. Returns a `Blob` ready to feed into
 * `preprocessImageForVision()` — the rest of the parse pipeline doesn't care
 * which capture path produced the bytes.
 *
 * Native path (Capacitor):
 *   `@capacitor/camera`. Uses the system camera UI, which iOS handles much
 *   better than `<input type=file capture=environment>` inside WKWebView
 *   (per research 2026-05-10 Capacitor Phase 2 notes — the native picker
 *   has saner permission UX, no Safari fullscreen quirk, and on iOS 26+
 *   gets the new privacy-first camera permission prompt for free).
 *
 *   Returns the photo as a Base64-decoded Blob. Source defaults to CAMERA
 *   (a `prompt: true` source-picker would let the user pick photo library,
 *   but we expose `takeFromLibrary()` for that case so the camera button is
 *   one tap, no chooser).
 *
 * Web path:
 *   Returns null. Callers fall back to a hidden `<input type=file>` element,
 *   which is what UploadScreen.jsx already does today. Keeping the web path
 *   as the existing implementation means PWA users see no behavior change.
 *
 * @param {object} [opts]
 * @param {'camera'|'library'} [opts.source='camera']  Where to source the photo.
 * @param {number} [opts.quality=90]                   Native JPEG quality 0-100.
 *                                                     90 is high enough to feed
 *                                                     into the existing
 *                                                     preprocessor without OCR
 *                                                     loss.
 * @returns {Promise<Blob|null>}  Blob on native; null on web (caller falls back).
 */
export async function takePhoto({ source = 'camera', quality = 90 } = {}) {
  if (!isNative()) return null

  try {
    const mod = await import('@capacitor/camera')
    const { Camera, CameraResultType, CameraSource } = mod
    if (!Camera?.getPhoto) return null

    const cameraSource = source === 'library' ? CameraSource.Photos : CameraSource.Camera

    const photo = await Camera.getPhoto({
      quality,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      // Force a portrait/landscape-aware orientation so wide grocery lists
      // shot landscape don't come back rotated.
      correctOrientation: true,
      source: cameraSource,
      // We let the preprocessor handle resizing — keep native output crisp.
      // The native plugin will skip a re-encode if `quality === 100`, which
      // we don't want (saves no bytes and the preprocessor handles size).
      saveToGallery: false,
    })

    const base64 = photo?.base64String
    if (!base64) return null

    const mime = photo.format ? `image/${photo.format}` : 'image/jpeg'
    return base64ToBlob(base64, mime)
  } catch (e) {
    if (e?.message && /User cancelled/i.test(e.message)) {
      // User backed out of the native camera UI — not an error, return null.
      return null
    }
    console.warn('[platform] takePhoto failed:', e?.message)
    return null
  }
}

/** Convenience for "pick from library" without a chooser sheet. */
export async function takeFromLibrary(opts = {}) {
  return takePhoto({ ...opts, source: 'library' })
}

/**
 * Decode a Base64 string into a Blob. Pure-JS, no DOM dependencies — this
 * runs in both the WKWebView (iOS Capacitor) and the regular browser.
 */
function base64ToBlob(base64, mime) {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

