// The canonical ParsedItem normalizer in src/lib/parsedItem.js handles
// category resolution alongside `section`, `flagged`/`needsConfirmation`,
// etc. There's a circular import here (parsedItem.js imports `genId` from
// this file) — ES modules handle this fine because both `genId` and
// `normalizeParsedItem` are referenced only at call time, not during module
// top-level evaluation, and ES module bindings are live.
import { normalizeParsedItem } from '../lib/parsedItem.js'

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

/**
 * Parse a Claude (or local-model) JSON response into the canonical ParsedItem
 * shape. Drops crossed-out items by default — that's the historical UX:
 * the cloud prompt instructs the model to omit them, and the on-device path
 * sets `crossedOut: true` if it surfaces them at all.
 */
export function parseClaudeResponse(text, { dropCrossedOut = true } = {}) {
  const obj = extractJsonObject(text)
  if (!obj || typeof obj !== 'object') {
    return { ok: false, error: 'Could not parse model output.' }
  }
  const rawItems = Array.isArray(obj.items) ? obj.items : []
  const items = rawItems
    .filter(i => i && typeof i.name === 'string' && i.name.trim())
    .map(i => normalizeParsedItem(i))
    .filter(i => dropCrossedOut ? !i.crossedOut : true)
  return {
    ok: true,
    items,
    ambiguous: Array.isArray(obj.ambiguous) ? obj.ambiguous.map(String) : [],
    unparseable: Array.isArray(obj.unparseable) ? obj.unparseable.map(String) : []
  }
}

export { genId }
