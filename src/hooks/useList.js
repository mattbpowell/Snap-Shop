import { useCallback, useEffect, useState } from 'react'
import { genId } from '../utils/parseResponse.js'
import { normalizeCategory } from '../utils/categories.js'

const ACTIVE_KEY = 'sas.activeList.v1'
const HISTORY_KEY = 'sas.history.v1'
const HISTORY_LIMIT = 5

function loadActive() {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.items)) return parsed
  } catch {}
  return null
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function useList() {
  const [list, setList] = useState(() => loadActive())
  const [history, setHistory] = useState(() => loadHistory())

  useEffect(() => {
    if (list) {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(list))
    } else {
      localStorage.removeItem(ACTIVE_KEY)
    }
  }, [list])

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  }, [history])

  const startList = useCallback((items) => {
    const safeItems = items.map(i => ({ ...i, checked: Boolean(i.checked) }))
    const newList = {
      id: genId(),
      createdAt: Date.now(),
      items: safeItems
    }
    setList(newList)
    return newList
  }, [])

  const updateItem = useCallback((id, patch) => {
    setList(prev => {
      if (!prev) return prev
      return {
        ...prev,
        items: prev.items.map(it => (it.id === id ? { ...it, ...patch } : it))
      }
    })
  }, [])

  const deleteItem = useCallback((id) => {
    setList(prev => {
      if (!prev) return prev
      return { ...prev, items: prev.items.filter(it => it.id !== id) }
    })
  }, [])

  const addItem = useCallback((category, name, extras = {}) => {
    const trimmed = (name || '').trim()
    if (!trimmed) return
    const item = {
      id: genId(),
      name: trimmed,
      original: typeof extras.original === 'string' ? extras.original : trimmed,
      category: normalizeCategory(category),
      quantity: extras.quantity ?? null,
      note: extras.note ?? null,
      flagged: Boolean(extras.flagged),
      checked: false
    }
    setList(prev => {
      if (!prev) return { id: genId(), createdAt: Date.now(), items: [item] }
      return { ...prev, items: [...prev.items, item] }
    })
  }, [])

  const toggleChecked = useCallback((id) => {
    setList(prev => {
      if (!prev) return prev
      return {
        ...prev,
        items: prev.items.map(it => (it.id === id ? { ...it, checked: !it.checked } : it))
      }
    })
  }, [])

  const clearChecked = useCallback(() => {
    setList(prev => {
      if (!prev) return prev
      return { ...prev, items: prev.items.filter(it => !it.checked) }
    })
  }, [])

  const archiveAndReset = useCallback(() => {
    setList(prev => {
      if (prev && prev.items.length) {
        const entry = {
          id: prev.id,
          date: prev.createdAt || Date.now(),
          count: prev.items.length
        }
        setHistory(h => [entry, ...h].slice(0, HISTORY_LIMIT))
      }
      return null
    })
  }, [])

  const discardList = useCallback(() => setList(null), [])

  return {
    list,
    history,
    startList,
    updateItem,
    deleteItem,
    addItem,
    toggleChecked,
    clearChecked,
    archiveAndReset,
    discardList
  }
}
