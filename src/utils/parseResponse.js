import { normalizeCategory } from './categories.js'

function genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function stripFences(text) {
  if (typeof text !== 'string') return text
  const trimmed = text.trim()
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fence ? fence[1].trim() : trimmed
}

function extractJsonObject(text) {
  const cleaned = stripFences(text)
  try {
    return JSON.parse(cleaned)
  } catch {}
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end > start) {
    const slice = cleaned.slice(start, end + 1)
    try {
      return JSON.parse(slice)
    } catch {}
  }
  return null
}

export function parseClaudeResponse(text) {
  const obj = extractJsonObject(text)
  if (!obj || typeof obj !== 'object') {
    return { ok: false, error: 'Could not parse model output.' }
  }
  const rawItems = Array.isArray(obj.items) ? obj.items : []
  const items = rawItems
    .filter(i => i && typeof i.name === 'string' && i.name.trim())
    .map(i => ({
      id: typeof i.id === 'string' && i.id ? i.id : genId(),
      name: i.name.trim(),
      original: typeof i.original === 'string' ? i.original : i.name.trim(),
      category: normalizeCategory(i.category),
      quantity: i.quantity ? String(i.quantity) : null,
      note: i.note ? String(i.note) : null,
      flagged: Boolean(i.flagged),
      checked: false
    }))
  return {
    ok: true,
    items,
    ambiguous: Array.isArray(obj.ambiguous) ? obj.ambiguous.map(String) : [],
    unparseable: Array.isArray(obj.unparseable) ? obj.unparseable.map(String) : []
  }
}

export { genId }
