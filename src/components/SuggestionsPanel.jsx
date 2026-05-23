import { useEffect, useState } from 'react'
import { CheckIcon, PlusIcon, SparkleIcon, XIcon } from './icons.jsx'

/**
 * Inline panel shown beneath an item in Review mode when the user wants to
 * expand an entry (generic category, dish/meal, or specific item).
 *
 * Props:
 *   itemName        — original entry, used in the heading
 *   itemNote        — existing user note on the item (passed as context to the model)
 *   onSuggest       — async (itemName, { note }) => [{name, category}]
 *   onAddItems      — (items[]) => void  (keeps original, adds chosen items)
 *   onNestItems     — (items[], parentName) => void  (keeps original, adds with "for X" tag)
 *   onReplaceItems  — (items[]) => void  (deletes original, adds chosen items)
 *   onClose         — () => void
 */
export function SuggestionsPanel({
  itemName,
  itemNote,
  onSuggest,
  onAddItems,
  onNestItems,
  onReplaceItems,
  onClose,
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [selected, setSelected] = useState(() => new Set())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    onSuggest(itemName, { note: itemNote })
      .then(list => {
        if (cancelled) return
        setSuggestions(list)
        // Pre-select the top three so the common case is one tap.
        setSelected(new Set(list.slice(0, 3).map(s => s.name)))
      })
      .catch(e => {
        if (cancelled) return
        setError(e?.message || 'Could not get suggestions.')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [itemName, itemNote, onSuggest])

  const toggle = (name) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const chosen = suggestions.filter(s => selected.has(s.name))
  const hasChoice = chosen.length > 0

  const handleAdd = () => {
    if (!hasChoice) return
    onAddItems(chosen)
    onClose()
  }

  const handleReplace = () => {
    if (!hasChoice) return
    onReplaceItems(chosen)
    onClose()
  }

  const handleNest = () => {
    if (!hasChoice || !onNestItems) return
    onNestItems(chosen, itemName)
    onClose()
  }

  return (
    <div className="px-4 pb-3 -mt-1 animate-fade-up">
      <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <SparkleIcon size={13} className="text-brand-600 flex-none" />
            <span className="text-xs font-medium text-neutral-700 truncate">
              Make “{itemName}” more specific
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close suggestions"
            className="flex-none w-7 h-7 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-white transition"
          >
            <XIcon size={14} />
          </button>
        </div>

        {loading && (
          <div className="py-4 flex items-center justify-center gap-2 text-sm text-neutral-500">
            <span className="w-3.5 h-3.5 border-2 border-neutral-300 border-t-brand-600 rounded-full animate-spin" />
            Thinking…
          </div>
        )}

        {error && !loading && (
          <div className="py-2 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && suggestions.length === 0 && (
          <div className="py-2 text-sm text-neutral-500">
            No suggestions came back. Try a slightly different word.
          </div>
        )}

        {!loading && !error && suggestions.length > 0 && (
          <>
            <ul className="space-y-1">
              {suggestions.map(s => {
                const isSelected = selected.has(s.name)
                return (
                  <li key={s.name}>
                    <button
                      type="button"
                      onClick={() => toggle(s.name)}
                      aria-pressed={isSelected}
                      className={
                        'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-sm transition ' +
                        (isSelected
                          ? 'bg-white border border-brand-200'
                          : 'border border-transparent hover:bg-white')
                      }
                    >
                      <span
                        className={
                          'flex-none w-5 h-5 rounded-md flex items-center justify-center transition ' +
                          (isSelected
                            ? 'bg-brand-600 text-white'
                            : 'bg-white border-[1.5px] border-neutral-300 text-transparent')
                        }
                      >
                        <CheckIcon size={12} strokeWidth={2.6} />
                      </span>
                      <span className="flex-1 min-w-0 truncate text-neutral-900">
                        {s.name}
                      </span>
                      <span className="text-[11px] uppercase tracking-wider text-neutral-400">
                        {s.category}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <span className="text-[11px] text-neutral-400 mr-auto">
                {chosen.length} selected
              </span>
              <button
                type="button"
                onClick={handleReplace}
                disabled={!hasChoice}
                title={`Remove "${itemName}" and add the selected items`}
                className="btn-secondary px-3 py-1.5 rounded-lg text-xs"
              >
                Replace
              </button>
              {onNestItems && (
                <button
                  type="button"
                  onClick={handleNest}
                  disabled={!hasChoice}
                  title={`Keep "${itemName}" and tag the new items as part of it`}
                  className="btn-secondary px-3 py-1.5 rounded-lg text-xs"
                >
                  Nest under
                </button>
              )}
              <button
                type="button"
                onClick={handleAdd}
                disabled={!hasChoice}
                title={`Keep "${itemName}" and add the selected items as their own line items`}
                className="btn-primary px-3 py-1.5 rounded-lg text-xs"
              >
                <PlusIcon size={12} />
                Add
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
