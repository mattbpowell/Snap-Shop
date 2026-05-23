import { useEffect, useState } from 'react'
import { LogoMark, XIcon } from './icons.jsx'

/**
 * Bottom-sheet banner that walks iOS Safari users through Add-to-Home-Screen.
 * Render when usePWAInstallPrompt's `showIOSBanner` is true.
 */
export function IOSInstallBanner({ onDismiss }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={() => onDismiss(false)}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add Snap & Shop to your Home Screen"
        className={
          'fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-lift ' +
          'px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] ' +
          'transition-transform duration-300 ease-out ' +
          (visible ? 'translate-y-0' : 'translate-y-full')
        }
      >
        <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto mb-5" aria-hidden="true" />

        <button
          type="button"
          onClick={() => onDismiss(false)}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
        >
          <XIcon size={16} />
        </button>

        <div className="flex items-start gap-3 mb-5">
          <span className="flex-none w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-soft">
            <LogoMark size={26} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-neutral-900 leading-tight tracking-tight">
              Add Snap & Shop to your Home Screen
            </h2>
            <p className="text-sm text-neutral-500 mt-0.5">
              Shop faster — works offline, no browser chrome.
            </p>
          </div>
        </div>

        <ol className="space-y-3 mb-5">
          <Step n={1}>
            <span>
              Tap{' '}
              <span className="inline-flex items-center align-middle gap-1 text-blue-500 font-medium">
                <ShareGlyph />
                Share
              </span>{' '}
              at the bottom of Safari
            </span>
          </Step>
          <Step n={2}>
            Scroll down and tap <strong className="font-semibold">Add to Home Screen</strong>
          </Step>
          <Step n={3}>
            Tap <strong className="font-semibold">Add</strong> in the top right
          </Step>
        </ol>

        <button
          type="button"
          onClick={() => onDismiss(false)}
          className="w-full min-h-[44px] text-neutral-500 text-sm hover:text-neutral-800 transition"
        >
          Not now
        </button>
      </div>
    </>
  )
}

function Step({ n, children }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex-none w-7 h-7 rounded-full bg-brand-50 text-brand-700 text-sm font-semibold flex items-center justify-center">
        {n}
      </span>
      <span className="text-sm text-neutral-700">{children}</span>
    </li>
  )
}

function ShareGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="w-4 h-4 inline-block"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}
