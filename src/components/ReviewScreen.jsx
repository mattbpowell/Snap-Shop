import { useCallback, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { CategorySection } from './CategorySection.jsx'
import { CATEGORIES, groupByCategory } from '../utils/categories.js'
import { ChevronRightIcon, PlusIcon, PrintIcon } from './icons.jsx'
import { useClaude } from '../hooks/useClaude.js'
import { printList } from '../utils/printList.js'
import { FlaggedItemsSection } from './FlaggedItemsSection.jsx'

export function ReviewScreen({ list, onRename, onDelete, onAddItem, onStart, onDiscard }) {
  const { suggestExpansions } = useClaude()
  const [newCategory, setNewCategory] = useState('')
  const [draggedItem, setDraggedItem] = useState(null)
  const [overCategory, setOverCategory] = useState(null)

  // Stable identity so SuggestionsPanel's effect doesn't re-fire on every parent render.
  const handleSuggest = useCallback(
    (itemName) => suggestExpansions(itemName),
    [suggestExpansions]
  )
  const handleAddItems = useCallback(
    (items) => items.forEach(s => onAddItem(s.category, s.name)),
    [onAddItem]
  )
  const handleReplaceItems = useCallback(
    (id, items) => {
      onDelete(id)
      items.forEach(s => onAddItem(s.category, s.name))
    },
    [onDelete, onAddItem]
  )
  // Nest: keep the parent ("Tacos"), add each ingredient with a "for Tacos" note
  // so the relationship is visible on every row in Review and Store mode.
  const handleNestItems = useCallback(
    (_parentId, items, parentName) => {
      const tag = `for ${parentName}`
      items.forEach(s =>
        onAddItem(s.category, s.name, { note: tag })
      )
    },
    [onAddItem]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  // Flagged items get a dedicated "double-check" section above the categorized list
  // and are excluded from the per-category groups to avoid duplicate display.
  const flaggedItems = list.items.filter(i => i.flagged)
  const cleanItems = list.items.filter(i => !i.flagged)

  const presentCategories = new Set(cleanItems.map(i => i.category))
  const displayOrder = [
    ...CATEGORIES.filter(c => presentCategories.has(c)),
    ...Array.from(presentCategories).filter(c => !CATEGORIES.includes(c)),
  ]
  const groups = groupByCategory(cleanItems, displayOrder)
  const missingCategories = CATEGORIES.filter(c => !presentCategories.has(c))

  const handleResolveFlagged = (id, correctedName) => {
    onRename(id, { name: correctedName, flagged: false, note: null })
  }

  // While dragging, show all categories (including empty ones) as drop targets
  const emptyDropZones = draggedItem
    ? CATEGORIES.filter(c => !presentCategories.has(c)).map(c => ({ name: c, items: [] }))
    : []

  const handleDragStart = ({ active }) => {
    setDraggedItem(list.items.find(i => i.id === active.id) ?? null)
  }

  const handleDragOver = ({ over }) => {
    setOverCategory(over?.id ?? null)
  }

  const handleDragEnd = ({ active, over }) => {
    setDraggedItem(null)
    setOverCategory(null)
    if (!over) return
    const item = list.items.find(i => i.id === active.id)
    if (item && item.category !== over.id) {
      onRename(active.id, { category: over.id })
    }
  }

  const addNewCategoryItem = () => {
    if (!newCategory) return
    onAddItem(newCategory, 'New item')
    setNewCategory('')
  }

  return (
    <div
      className="max-w-xl mx-auto px-4"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 13rem)',
      }}
    >
      <header className="mb-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-900">Review your list</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            {list.items.length} items · tap to edit, drag to recategorize
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => printList(list)}
            disabled={list.items.length === 0}
            aria-label="Print list"
            title="Print list"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-neutral-600 hover:text-brand-700 hover:bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <PrintIcon size={16} />
            <span className="hidden sm:inline">Print</span>
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="text-sm text-neutral-500 hover:text-red-600 transition px-2 py-1"
          >
            Discard
          </button>
        </div>
      </header>

      <FlaggedItemsSection
        items={flaggedItems}
        onResolve={handleResolveFlagged}
        onDismiss={onDelete}
      />

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {groups.map(g => (
          <CategorySection
            key={g.name}
            name={g.name}
            items={g.items}
            mode="review"
            isDropTarget={overCategory === g.name && draggedItem?.category !== g.name}
            onRename={(id, next) => onRename(id, { name: next })}
            onDelete={onDelete}
            onAddItem={(name) => onAddItem(g.name, name)}
            onSuggest={handleSuggest}
            onAddItems={handleAddItems}
            onReplaceItems={handleReplaceItems}
            onNestItems={handleNestItems}
          />
        ))}

        {emptyDropZones.map(g => (
          <CategorySection
            key={g.name}
            name={g.name}
            items={[]}
            mode="review"
            isDropTarget={overCategory === g.name}
          />
        ))}

        <DragOverlay dropAnimation={null}>
          {draggedItem ? (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-brand-300 shadow-lg text-[15px] text-neutral-900 font-medium">
              {draggedItem.name}
              {draggedItem.quantity && (
                <span className="text-sm text-neutral-400 font-normal">{draggedItem.quantity}</span>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {missingCategories.length > 0 && (
        <div className="mt-4 p-3 bg-white rounded-2xl border border-neutral-200/70 shadow-soft flex gap-2 items-center">
          <select
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            className="input-base py-1.5 text-sm"
          >
            <option value="">Add a category…</option>
            {missingCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={addNewCategoryItem}
            disabled={!newCategory}
            className="btn-primary px-3 py-2 rounded-lg text-sm"
          >
            <PlusIcon size={14} />
            Add
          </button>
        </div>
      )}

      <div
        className="fixed left-0 right-0 p-4 bg-white/90 backdrop-blur border-t border-neutral-200/70 shadow-dock"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}
      >
        <div className="max-w-xl mx-auto">
          <button
            type="button"
            onClick={onStart}
            disabled={list.items.length === 0}
            className="btn-primary w-full py-3.5 rounded-xl text-base"
          >
            Start shopping
            <ChevronRightIcon size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
