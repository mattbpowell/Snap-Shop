import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY_DISMISSED = 'pwa_prompt_dismissed'
const STORAGE_KEY_DISMISSED_AT = 'pwa_prompt_dismissed_at'
const SOFT_DISMISS_DAYS = 14

function detectIsIOS() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase())
}

function detectIsInstalled() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator?.standalone === true
}

function shouldSuppressBanner() {
  try {
    const dismissed = localStorage.getItem(STORAGE_KEY_DISMISSED)
    if (dismissed === 'permanent') return true
    if (dismissed === 'soft') {
      const at = parseInt(localStorage.getItem(STORAGE_KEY_DISMISSED_AT) ?? '0', 10)
      const daysSince = (Date.now() - at) / 86_400_000
      if (daysSince < SOFT_DISMISS_DAYS) return true
    }
  } catch {}
  return false
}

/**
 * Manages PWA install prompts for both Android (Chrome's beforeinstallprompt)
 * and iOS (custom bottom-sheet UI, since iOS Safari fires no install event).
 *
 * Highest-conversion moment to call triggerAfterSuccessfulScan() is right
 * after the first scan returns parsed items — that's the "aha" moment.
 */
export function usePWAInstallPrompt() {
  const deferredPromptRef = useRef(null)
  const [showIOSBanner, setShowIOSBanner] = useState(false)
  const [isInstalled, setIsInstalled] = useState(detectIsInstalled())
  const isIOS = detectIsIOS()

  useEffect(() => {
    if (isInstalled) return
    const handler = (e) => {
      e.preventDefault()
      deferredPromptRef.current = e
    }
    window.addEventListener('beforeinstallprompt', handler)
    const installedHandler = () => setIsInstalled(true)
    window.addEventListener('appinstalled', installedHandler)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [isInstalled])

  const triggerAfterSuccessfulScan = useCallback(() => {
    if (isInstalled) return
    if (shouldSuppressBanner()) return
    if (isIOS) {
      setShowIOSBanner(true)
    } else if (deferredPromptRef.current) {
      const evt = deferredPromptRef.current
      evt.prompt()
      evt.userChoice?.then((choice) => {
        if (choice?.outcome === 'dismissed') {
          try {
            localStorage.setItem(STORAGE_KEY_DISMISSED, 'soft')
            localStorage.setItem(STORAGE_KEY_DISMISSED_AT, String(Date.now()))
          } catch {}
        }
        deferredPromptRef.current = null
      })
    }
  }, [isIOS, isInstalled])

  const dismissIOSBanner = useCallback((permanent = false) => {
    setShowIOSBanner(false)
    try {
      localStorage.setItem(STORAGE_KEY_DISMISSED, permanent ? 'permanent' : 'soft')
      if (!permanent) {
        localStorage.setItem(STORAGE_KEY_DISMISSED_AT, String(Date.now()))
      }
    } catch {}
  }, [])

  return {
    triggerAfterSuccessfulScan,
    showIOSBanner,
    dismissIOSBanner,
    isInstalled,
    isIOS,
  }
}
