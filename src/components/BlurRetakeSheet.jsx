import { useEffect, useState } from 'react'
import { CameraIcon, ScanTextIcon, XIcon } from './icons.jsx'

const COPY = {
  'pre-api': {
    title: 'Hard to read — try again?',
    body: 'Flatten the paper and tap a bright area on screen to focus before shooting.',
    primaryCTA: 'Retake photo',
    secondaryCTA: 'Use anyway',
  },
  'post-api': {
    title: 'I could only read part of this',
    body: 'The photo may be dim or out of focus. A clearer shot usually gives a complete list.',
    primaryCTA: 'Retake photo',
    secondaryCTA: 'Keep what I got',
  },
}

const TIPS = [
  'Move to a brighter spot or turn on a light',
  'Press the paper flat against a surface',
  'Tap the text area on screen before shooting',
]

/**
 * Bottom-sheet that surfaces blur / parse-confidence warnings.
 * variant = 'pre-api'   → preprocessor flagged blur before the LLM call
 * variant = 'post-api'  → LLM came back with low confidence / partial list
 */
export function BlurRetakeSheet({ variant = 'pre-api', onRetake, onContinue }) {
  const [visible, setVisible] = useState(false)
  const copy = COPY[variant] || COPY['pre-api']

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  const Icon = variant === 'post-api' ? ScanTextIcon : CameraIcon

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onContinue}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={copy.title}
        className={
          'fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-lift ' +
          'px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] ' +
          'transition-transform duration-300 ease-out ' +
          (visible ? 'translate-y-0' : 'translate-y-full')
        }
      >
        <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto mb-5" aria-hidden="true" />

        <button
          type="button"
          onClick={onContinue}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
        >
          <XIcon size={16} />
        </button>

        <div
          className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3"
          aria-hidden="true"
        >
          <Icon size={26} strokeWidth={1.6} />
        </div>

        <h2 className="text-base font-semibold text-neutral-900 text-center mb-1 tracking-tight">
          {copy.title}
        </h2>
        <p className="text-sm text-neutral-500 text-center leading-relaxed mb-5">
          {copy.body}
        </p>

        <ul className="space-y-2 mb-6">
          {TIPS.map((tip, i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm text-neutral-700">
              <span
                className="flex-none w-5 h-5 rounded-full bg-neutral-100 text-neutral-500 text-[11px] font-semibold flex items-center justify-center"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              {tip}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onRetake}
          autoFocus
          className="btn-primary w-full py-3.5 rounded-xl text-base mb-2"
        >
          {copy.primaryCTA}
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="w-full min-h-[44px] rounded-xl bg-neutral-100 text-neutral-600 font-medium text-sm hover:bg-neutral-200 transition"
        >
          {copy.secondaryCTA}
        </button>
      </div>
    </>
  )
}
