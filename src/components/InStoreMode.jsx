import { useEffect, useMemo, useState } from 'react'
import { CategorySection } from './CategorySection.jsx'
import { SwipeableListItem } from './SwipeableListItem.jsx'
import { groupByCategory, CATEGORIES } from '../utils/categories.js'
import { printList } from '../utils/printList.js'
import { PrintIcon } from './icons.jsx'
import { keepScreenAwake } from '../lib/platform.js'

export function InStoreMode({ list, onBack, onToggle, onClearChecked, onNewList }) {
  const [showCategoryBreakdown, setShowCategoryBreakdown] = useState(false)

  // ── Keep screen awake while shopping ──────────────────────────────────────
  // Delegated to platform.js: uses Capacitor's KeepAwake plugin on iOS/Android
  // and the Web Wake Lock API in the PWA. The web wake lock is released when
  // the tab loses visibility, so we re-acquire on visibilitychange. The native
  // KeepAwake plugin survives backgrounding — the visibility re-acquire is a
  // no-op cost there but harmless.
  useEffect(() => {
    let release = null
    let cancelled = false

    const acquire = async () => {
      const next = await keepScreenAwake()
      if (cancelled) {
        // Effect torn down before lock resolved — release immediately.
        next?.()
        return
      }
      // Replace any prior lock (idempotent on the native side, prevents
      // double-locks on the web side after a visibilitychange round-trip).
      if (release) { try { await release() } catch {} }
      release = next
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (release) release().catch(() => {})
    }
  }, [])

  const items = list.items
  const total = items.length
  const doneCount = items.filter(i => i.checked).length
  const remaining = total - doneCount
  const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0

  const handleToggle = (id) => {
    onToggle(id)
    if (navigator.vibrate) navigator.vibrate(40)
  }

  const handleClearChecked = () => {
    onClearChecked()
    if (navigator.vibrate) navigator.vibrate([40, 30, 40])
  }

  // Build category order: known categories first (in store layout order), then any extras
  const presentCategories = useMemo(() => {
    const seen = new Set(items.map(i => i.category))
    return [
      ...CATEGORIES.filter(c => seen.has(c)),
      ...Array.from(seen).filter(c => !CATEGORIES.includes(c)),
    ]
  }, [items])

  const groups = useMemo(
    () => groupByCategory(items, presentCategories),
    [items, presentCategories]
  )

  const categoryStats = useMemo(() => {
    return groups.map(g => ({
      name: g.name,
      total: g.items.length,
      done: g.items.filter(i => i.checked).length,
    }))
  }, [groups])

  return (
    <div className="flex flex-col bg-neutral-50 h-[100dvh] select-none">

      {/* Sticky progress header */}
      <button
        className="sticky top-0 z-10 w-full bg-white border-b border-neutral-100 px-4 text-left active:bg-neutral-50"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
          paddingBottom: '0.75rem',
        }}
        onClick={() => setShowCategoryBreakdown(v => !v)}
        aria-label="Toggle category breakdown"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-neutral-700">
            {remaining === 0 ? 'All done! 🎉' : `${remaining} of ${total} items left`}
          </span>
          <span className="text-xs text-neutral-400">
            {showCategoryBreakdown ? '▲' : '▼'} by aisle
          </span>
        </div>

        <div className="mt-2 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        {showCategoryBreakdown && (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
            {categoryStats.map(({ name, total: catTotal, done: catDone }) => {
              const catRemaining = catTotal - catDone
              return (
                <div key={name} className="flex justify-between text-xs">
                  <span className="text-neutral-600 truncate">{name}</span>
                  <span className={catRemaining === 0 ? 'text-brand-600 font-medium' : 'text-neutral-400'}>
                    {catRemaining === 0 ? '✓' : `${catRemaining} left`}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </button>

      {/* Scrollable grouped list */}
      <div className="flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 pb-32">
        {groups.map(g => (
          <CategorySection
            key={g.name}
            name={g.name}
            items={g.items}
            mode="store"
            onToggle={handleToggle}
            RowComponent={SwipeableListItem}
          />
        ))}

        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-neutral-400">
            <span className="text-4xl mb-2">🛒</span>
            <p className="text-sm">No items — scan a list to get started.</p>
          </div>
        )}

        {remaining === 0 && total > 0 && (
          <button
            onClick={onNewList}
            className="w-full min-h-[52px] mt-2 rounded-2xl bg-brand-50 border border-brand-200 text-brand-800 font-semibold text-base active:bg-brand-100 transition-colors"
          >
            Start a new list
          </button>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-100 px-4 pt-3 flex gap-3 pb-[calc(env(safe-area-inset-bottom,0px)+18px)]">
        <button
          aria-label="Print list"
          title="Print list"
          onClick={() => printList(list)}
          disabled={items.length === 0}
          className="flex-none w-[52px] min-h-[52px] rounded-2xl bg-neutral-100 text-neutral-600 flex items-center justify-center active:bg-neutral-200 disabled:opacity-40 transition-colors"
        >
          <PrintIcon size={20} />
        </button>
        {doneCount > 0 && (
          <button
            className="flex-1 min-h-[52px] rounded-2xl bg-neutral-100 text-neutral-700 font-semibold text-base active:bg-neutral-200 transition-colors"
            onClick={handleClearChecked}
          >
            Clear {doneCount} checked
          </button>
        )}
        <button
          className="flex-1 min-h-[52px] rounded-2xl bg-brand-600 text-white font-semibold text-base active:bg-brand-700 transition-colors"
          onClick={onBack}
        >
          Edit list
        </button>
      </div>
    </div>
  )
}
