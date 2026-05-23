import { useState } from 'react'
import { CategorySection } from './CategorySection.jsx'
import { CATEGORIES, groupByCategory } from '../utils/categories.js'
import { ChevronLeftIcon, MoreIcon, SparkleIcon } from './icons.jsx'

export function StoreMode({ list, onBack, onToggle, onClearChecked, onNewList }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const total = list.items.length
  const checked = list.items.filter(i => i.checked).length
  const pct = total ? Math.round((checked / total) * 100) : 0

  const presentCategories = new Set(list.items.map(i => i.category))
  const displayOrder = [
    ...CATEGORIES.filter(c => presentCategories.has(c)),
    ...Array.from(presentCategories).filter(c => !CATEGORIES.includes(c))
  ]
  const groups = groupByCategory(list.items, displayOrder)

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-neutral-200/70">
        <div className="max-w-xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to list"
            className="btn-ghost rounded-lg px-2 py-1 text-sm"
          >
            <ChevronLeftIcon size={18} />
            <span>Edit</span>
          </button>
          <div className="flex-1 text-center">
            <div className="text-sm font-semibold tabular-nums text-neutral-900">
              {checked} <span className="text-neutral-300">/</span> {total}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-400">
              {pct}% done
            </div>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Menu"
              aria-expanded={menuOpen}
              className="btn-ghost w-9 h-9 rounded-lg"
            >
              <MoreIcon size={18} />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl shadow-lift border border-neutral-200/70 z-20 overflow-hidden animate-fade-up">
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); onClearChecked() }}
                    className="block w-full text-left px-3 py-2.5 text-sm hover:bg-neutral-50"
                  >
                    Clear checked items
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); onNewList() }}
                    className="block w-full text-left px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 border-t border-neutral-100"
                  >
                    Start a new list
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="h-[3px] bg-neutral-100">
          <div
            className="h-full bg-brand-600 transition-all duration-300 ease-out"
            style={{ width: pct + '%' }}
          />
        </div>
      </header>

      <main className="max-w-xl mx-auto px-3 py-4">
        {groups.length === 0 && (
          <div className="text-center text-neutral-500 py-16 text-sm">
            Your list is empty.
          </div>
        )}
        {groups.map(g => (
          <CategorySection
            key={g.name}
            name={g.name}
            items={g.items}
            mode="store"
            onToggle={onToggle}
          />
        ))}
        {total > 0 && checked === total && (
          <div className="mt-6 rounded-2xl bg-brand-50 border border-brand-100 p-6 text-center animate-fade-up">
            <span className="inline-flex w-12 h-12 rounded-full bg-brand-600 text-white items-center justify-center mb-3 shadow-soft">
              <SparkleIcon size={22} strokeWidth={1.8} />
            </span>
            <div className="text-base font-semibold text-brand-800">All done</div>
            <p className="mt-1 text-sm text-brand-700/80">
              Nice work. Everything is in the cart.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
