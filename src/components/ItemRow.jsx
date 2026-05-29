import { useEffect, useRef, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CheckIcon, FlagIcon, GripIcon, SparkleIcon, XIcon } from './icons.jsx'
import { SuggestionsPanel } from './SuggestionsPanel.jsx'

export function ItemRow({
  item,
  onToggle,
  onRename,
  onDelete,
  mode,
  onSuggest,
  onAddItems,
  onReplaceItems,
  onNestItems,
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(item.name)
  const [showSuggest, setShowSuggest] = useState(false)
  const inputRef = useRef(null)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    data: { item },
    disabled: mode !== 'review',
  })

  useEffect(() => { setDraft(item.name) }, [item.name])
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const commit = () => {
    const next = draft.trim()
    if (next && next !== item.name) onRename?.(next)
    else setDraft(item.name)
    setIsEditing(false)
  }

  if (mode === 'review') {
    // Suggestions route through Apple Foundation Models on native iOS,
    // through the cloud (Anthropic) or Ollama on web. The hook decides
    // which to call at runtime; the button is always shown.
    const canSuggest = typeof onSuggest === 'function' && !isEditing
    return (
      <div className="border-b border-neutral-100 last:border-b-0">
        <div
          ref={setNodeRef}
          className={
            'group flex items-center gap-2 px-4 py-3 transition-opacity ' +
            (isDragging ? 'opacity-40' : 'opacity-100')
          }
        >
          {/* Drag handle */}
          <button
            type="button"
            aria-label="Drag to recategorize"
            className="flex-none w-6 h-6 flex items-center justify-center text-neutral-300 hover:text-neutral-500 cursor-grab active:cursor-grabbing touch-none"
            {...listeners}
            {...attributes}
          >
            <GripIcon size={16} />
          </button>

          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={e => {
                  if (e.key === 'Enter') commit()
                  if (e.key === 'Escape') { setDraft(item.name); setIsEditing(false) }
                }}
                className="input-base py-1.5"
              />
            ) : (
              <button type="button" onClick={() => setIsEditing(true)} className="text-left w-full">
                <div className="text-[15px] text-neutral-900 truncate flex items-center gap-1.5">
                  {item.flagged && <FlagIcon size={13} className="text-amber-600 flex-none" />}
                  <span className="truncate">{item.name}</span>
                  {item.quantity && (
                    <span className="ml-1 text-sm text-neutral-400 font-normal">{item.quantity}</span>
                  )}
                </div>
                {item.note && (
                  <div className="mt-0.5 text-xs text-neutral-500 truncate">{item.note}</div>
                )}
              </button>
            )}
          </div>

          {canSuggest && (
            <button
              type="button"
              onClick={() => setShowSuggest(s => !s)}
              aria-label={`Suggest specific items for ${item.name}`}
              aria-expanded={showSuggest}
              title="Suggest more specific items"
              className={
                'flex-none h-8 px-2 inline-flex items-center gap-1 rounded-full text-xs font-medium transition ' +
                (showSuggest
                  ? 'bg-brand-50 text-brand-700 border border-brand-200'
                  : 'text-neutral-400 hover:text-brand-700 hover:bg-brand-50/60 border border-transparent')
              }
            >
              <SparkleIcon size={13} />
              <span className="hidden sm:inline">Specify</span>
            </button>
          )}

          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${item.name}`}
            className="flex-none w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-red-500 hover:bg-red-50 transition"
          >
            <XIcon size={16} />
          </button>
        </div>

        {showSuggest && canSuggest && (
          <SuggestionsPanel
            itemName={item.name}
            itemNote={item.note}
            onSuggest={onSuggest}
            onAddItems={items => onAddItems?.(items)}
            onReplaceItems={items => onReplaceItems?.(item.id, items)}
            onNestItems={onNestItems ? (items, parentName) => onNestItems(item.id, items, parentName) : undefined}
            onClose={() => setShowSuggest(false)}
          />
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={item.checked}
      className={
        'w-full flex items-center gap-3 px-4 min-h-[60px] border-b border-neutral-100 last:border-b-0 text-left transition-colors ' +
        (item.checked ? 'bg-neutral-50/60' : 'bg-white active:bg-neutral-50')
      }
    >
      <span
        className={
          'flex-none w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 ' +
          (item.checked
            ? 'bg-brand-600 text-white scale-100'
            : 'bg-white border-[1.5px] border-neutral-300 text-transparent')
        }
      >
        <CheckIcon size={15} strokeWidth={2.5} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          {item.flagged && !item.checked && (
            <FlagIcon size={13} className="text-amber-600 flex-none" />
          )}
          <span className={'block text-[15px] truncate ' + (item.checked ? 'line-through text-neutral-400' : 'text-neutral-900')}>
            {item.name}
          </span>
          {item.quantity && (
            <span className={'text-sm font-normal ' + (item.checked ? 'text-neutral-300 line-through' : 'text-neutral-400')}>
              {item.quantity}
            </span>
          )}
        </span>
        {item.note && (
          <span className={'block mt-0.5 text-xs truncate ' + (item.checked ? 'text-neutral-300' : 'text-neutral-500')}>
            {item.note}
          </span>
        )}
      </span>
    </button>
  )
}
