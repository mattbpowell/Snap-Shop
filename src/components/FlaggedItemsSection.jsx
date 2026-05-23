import { useEffect, useRef, useState } from 'react'
import { CheckIcon, FlagIcon, XIcon } from './icons.jsx'

/**
 * Renders a titled section of flagged items above the main categorized list.
 * Maps to the existing schema: name (normalized), original (raw), note (reason).
 *
 * Props:
 *   items       — array of flagged items
 *   onResolve   — (id, correctedName) => void
 *   onDismiss   — (id) => void  (optional)
 */
export function FlaggedItemsSection({ items, onResolve, onDismiss }) {
  if (!items?.length) return null
  return (
    <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 animate-fade-up">
      <header className="mb-3 flex items-start gap-2">
        <span
          className="flex-none w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center mt-0.5"
          aria-hidden="true"
        >
          <FlagIcon size={14} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-amber-900 tracking-tight">
            Double-check {items.length === 1 ? 'this item' : `these ${items.length} items`}
          </h3>
          <p className="text-xs text-amber-800/80 mt-0.5">
            Tap any item to correct it.
          </p>
        </div>
      </header>
      <div className="space-y-2">
        {items.map(item => (
          <FlaggedItemCard
            key={item.id}
            item={item}
            onResolve={(correctedName) => onResolve?.(item.id, correctedName)}
            onDismiss={onDismiss ? () => onDismiss(item.id) : undefined}
          />
        ))}
      </div>
    </section>
  )
}

function FlaggedItemCard({ item, onResolve, onDismiss }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(item.name)
  const [resolvedName, setResolvedName] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setEditValue(item.name)
  }, [item.name])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSave = () => {
    const trimmed = editValue.trim()
    if (!trimmed) return
    onResolve(trimmed)
    setResolvedName(trimmed)
    setIsEditing(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setEditValue(item.name)
      setIsEditing(false)
    }
  }

  // Once resolved, render as a normal-looking item (no amber, no flag)
  if (resolvedName) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-neutral-200">
        <span className="flex-none w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center">
          <CheckIcon size={12} strokeWidth={2.6} />
        </span>
        <span className="text-[15px] text-neutral-900">{resolvedName}</span>
        {item.quantity && (
          <span className="text-sm text-neutral-400">{item.quantity}</span>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        aria-label={`Flagged item: ${item.name}. Tap to edit.`}
        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-white border border-amber-200 hover:border-amber-300 text-left transition"
      >
        <span
          className="flex-none w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold"
          aria-hidden="true"
        >
          ?
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-medium text-neutral-900 truncate">
            {item.name}
            {item.quantity && (
              <span className="ml-1.5 text-sm text-neutral-400 font-normal">{item.quantity}</span>
            )}
          </span>
          {item.note && (
            <span className="block text-xs text-amber-800 mt-0.5 leading-tight">
              {item.note}
            </span>
          )}
          {item.original && item.original.toLowerCase() !== item.name.toLowerCase() && (
            <span className="block text-[11px] text-neutral-500 mt-0.5">
              As written: “{item.original}”
            </span>
          )}
          <span className="block text-[11px] text-amber-700/80 mt-1">Tap to edit</span>
        </span>
        <span className="flex-none text-amber-700 text-lg leading-none" aria-hidden="true">›</span>
      </button>

      {isEditing && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => {
              setEditValue(item.name)
              setIsEditing(false)
            }}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit flagged item"
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-lift px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] animate-fade-up"
          >
            <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto mb-4" aria-hidden="true" />

            <button
              type="button"
              onClick={() => {
                setEditValue(item.name)
                setIsEditing(false)
              }}
              aria-label="Close"
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
            >
              <XIcon size={16} />
            </button>

            {item.original && (
              <p className="text-xs text-neutral-500 mb-1">
                As written: <span className="font-medium text-neutral-700">“{item.original}”</span>
              </p>
            )}
            {item.note && (
              <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg mb-4 flex items-start gap-2">
                <FlagIcon size={14} className="text-amber-600 flex-none mt-0.5" />
                <span>{item.note}</span>
              </div>
            )}

            <label htmlFor="flagged-item-input" className="block text-sm font-medium text-neutral-700 mb-2">
              What is this item?
            </label>
            <input
              id="flagged-item-input"
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., Whole Milk"
              autoCapitalize="words"
              autoCorrect="on"
              className="w-full px-3.5 py-3 text-base rounded-xl border-[1.5px] border-neutral-200 bg-neutral-50 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:bg-white outline-none transition"
            />

            <div className="flex items-center gap-2 mt-4">
              {onDismiss && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false)
                    onDismiss()
                  }}
                  className="flex-none px-4 py-3 rounded-xl text-sm font-medium text-red-600 border-[1.5px] border-red-200 hover:bg-red-50 transition"
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={!editValue.trim()}
                className="btn-primary flex-1 py-3 rounded-xl text-base"
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
