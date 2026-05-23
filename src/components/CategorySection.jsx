import { useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ItemRow } from './ItemRow.jsx'
import { CheckIcon, ChevronDownIcon, PlusIcon } from './icons.jsx'

export function CategorySection({
  name,
  items,
  mode,
  onToggle,
  onRename,
  onDelete,
  onAddItem,
  isDropTarget,
  onSuggest,
  onAddItems,
  onReplaceItems,
  onNestItems,
  RowComponent,
}) {
  const Row = RowComponent || ItemRow
  const total = items.length
  const checked = items.filter(i => i.checked).length
  const allDone = total > 0 && checked === total
  const wasAllDoneRef = useRef(allDone)
  const [collapsed, setCollapsed] = useState(false)
  const [pulse, setPulse] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const addInputRef = useRef(null)

  const { setNodeRef, isOver } = useDroppable({ id: name, disabled: mode !== 'review' })

  useEffect(() => {
    if (mode !== 'store') return
    if (allDone && !wasAllDoneRef.current) {
      setPulse(true)
      const t = setTimeout(() => { setPulse(false); setCollapsed(true) }, 1800)
      return () => clearTimeout(t)
    }
    if (!allDone && wasAllDoneRef.current) setCollapsed(false)
    wasAllDoneRef.current = allDone
  }, [allDone, mode])

  useEffect(() => {
    if (adding && addInputRef.current) addInputRef.current.focus()
  }, [adding])

  const sorted = mode === 'store'
    ? [...items].sort((a, b) => Number(a.checked) - Number(b.checked))
    : items

  const commitAdd = () => {
    const v = draft.trim()
    if (v) onAddItem?.(v)
    setDraft('')
    setAdding(false)
  }

  const highlight = mode === 'review' && (isOver || isDropTarget)

  return (
    <section
      ref={setNodeRef}
      className={
        'mb-3 rounded-2xl overflow-hidden border shadow-soft transition-colors ' +
        (highlight
          ? 'border-brand-400 bg-brand-50/60'
          : 'border-neutral-200/70 bg-white')
      }
    >
      <header
        className={
          'flex items-center justify-between px-4 py-2.5 transition-colors ' +
          (pulse ? 'animate-pulse-done' : '') +
          (mode === 'store' ? ' cursor-pointer select-none' : '')
        }
        onClick={() => mode === 'store' && setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-neutral-600">
            {name}
          </span>
          {mode === 'store' ? (
            allDone ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded-full bg-brand-50 text-brand-700">
                <CheckIcon size={11} strokeWidth={2.5} />
                Done
              </span>
            ) : (
              <span className="text-[11px] font-medium text-neutral-400 tabular-nums">
                {checked}/{total}
              </span>
            )
          ) : (
            <span className="text-[11px] font-medium text-neutral-400 tabular-nums">
              {total}
            </span>
          )}
        </div>
        {mode === 'store' && (
          <ChevronDownIcon
            size={16}
            className={'text-neutral-400 transition-transform ' + (collapsed ? '-rotate-90' : '')}
          />
        )}
      </header>

      {!collapsed && (
        <div className="border-t border-neutral-100">
          {sorted.length === 0 && mode === 'review' && (
            <div className={
              'px-4 py-5 text-center text-sm transition-colors ' +
              (highlight ? 'text-brand-600 font-medium' : 'text-neutral-400')
            }>
              {highlight ? 'Release to move here' : 'Drop item here'}
            </div>
          )}
          {sorted.map(item => (
            <Row
              key={item.id}
              item={item}
              mode={mode}
              onToggle={() => onToggle?.(item.id)}
              onRename={(next) => onRename?.(item.id, next)}
              onDelete={() => onDelete?.(item.id)}
              onSuggest={onSuggest}
              onAddItems={onAddItems}
              onReplaceItems={onReplaceItems}
              onNestItems={onNestItems}
            />
          ))}
          {mode === 'review' && sorted.length > 0 && (
            <div className="px-3 py-2 border-t border-neutral-100 bg-neutral-50/60">
              {adding ? (
                <input
                  ref={addInputRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitAdd()
                    if (e.key === 'Escape') { setDraft(''); setAdding(false) }
                  }}
                  onBlur={commitAdd}
                  placeholder={`Add to ${name}`}
                  className="input-base py-1.5 text-sm"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-sm text-neutral-500 hover:text-brand-700 rounded-md transition"
                >
                  <PlusIcon size={14} />
                  Add item
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
