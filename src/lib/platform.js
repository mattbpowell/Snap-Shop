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
 *   - canRecognizeTextOnDevice()  → true on iOS (Apple Vision available)
 *   - recognizeTextOnDevice(b64)  → on-device handwriting OCR via Vision
 *
 * Phases 4+ will add: normalizeWithLLM() (Foundation Models), etc.
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
 *   `@capacitor-community/keep-awake` — system-level lock; survives app foreground state.
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
      const mod = await import('@capacitor-community/keep-awake')
      if (mod?.KeepAwake?.keepAwake) {
        await mod.KeepAwake.keepAwake()
        return async () => {
          try { await mod.KeepAwake.allowSleep() } catch {}
        }
      }
    } catch (e) {
      // Plugin not installed yet — fall through to web path / no-op.
      console.warn('[platform] @capacitor-community/keep-awake unavailable:', e?.message)
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

// ── On-device OCR (Apple Vision) ────────────────────────────────────────────

/**
 * True if on-device handwriting OCR is available on this platform. Today that
 * means iOS, where the local `VisionOCR` Capacitor plugin (Apple Vision
 * framework) is registered. The web/PWA path uses the cloud worker instead —
 * `canRecognizeTextOnDevice()` lets callers decide which path to take.
 */
export function canRecognizeTextOnDevice() {
  return isNative() && getPlatform() === 'ios'
}

/**
 * Run handwriting OCR on a base64-encoded image using Apple Vision.
 *
 * Returns an array of recognized lines, each with text, confidence (0–1), and
 * normalized bounding box (origin bottom-left, width/height in 0–1). Bounding
 * boxes are kept so the caller can sort by reading order — for two-column
 * lists, the research file recommends left-column-top-down then
 * right-column-top-down rather than naive top-to-bottom.
 *
 * Throws if called when `canRecognizeTextOnDevice()` is false; callers should
 * fall back to the cloud path (apiClient → CF Worker → Claude) themselves.
 */

import { registerPlugin } from '@capacitor/core'

// Register the VisionOCR proxy once at module load (no dynamic import).
const VisionOCR = registerPlugin('VisionOCR')

export async function recognizeTextOnDevice(imageBase64) {
  if (!canRecognizeTextOnDevice()) {
    throw new Error('On-device OCR not available on this platform')
  }
  const result = await Promise.race([
    VisionOCR.recognize({ imageBase64 }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Vision OCR timed out after 30000ms')), 30000)
    ),
  ])
  return result?.lines || []
}

// ── Native camera / photo picker ────────────────────────────────────────────

/**
 * Capture or pick a photo. On native (iOS/Android) this uses the Capacitor
 * Camera plugin — far more stable than `<input type="file" capture="environment">`,
 * which on iOS triggers the Springboard photo capture sheet via WebKit and
 * occasionally crashes the app on real devices. On web/PWA we return null
 * and let the caller fall back to the file-input path.
 *
 * @param {'camera'|'photos'} source 'camera' to open the camera, 'photos' to
 *   open the library picker. Defaults to 'camera'.
 * @returns {Promise<File|null>} A File built from the captured image base64,
 *   ready to feed into existing pipelines. Or null if not native.
 */
export async function takePhotoNative(source = 'camera') {
  if (!isNative()) return null
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
  const photo = await Camera.getPhoto({
    quality: 92,
    allowEditing: false,
    resultType: CameraResultType.Base64,
    source: source === 'photos' ? CameraSource.Photos : CameraSource.Camera,
    saveToGallery: false,
    correctOrientation: true,
    presentationStyle: 'fullscreen',
  })
  if (!photo?.base64String) return null
  const mime = photo.format ? `image/${photo.format.toLowerCase()}` : 'image/jpeg'
  const bytes = base64ToUint8Array(photo.base64String)
  return new File([bytes], `photo.${photo.format || 'jpg'}`, { type: mime })
}

function base64ToUint8Array(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
