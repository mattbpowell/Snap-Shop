/**
 * Snap & Shop — `ParsedItem` contract.
 *
 * Single canonical JS shape that BOTH ingestion pipelines (cloud Claude path
 * and the on-device Apple Foundation Models / Vision OCR path) must return.
 * Locking the contract here means `useProTier()` can swap between providers
 * without leaking abstraction into the UI — `ReviewScreen`, `StoreMode`,
 * `FlaggedItemsSection` all read the same fields regardless of source.
 *
 * Build queue item 6 (research 2026-05-10).
 *
 * ── Schema ─────────────────────────────────────────────────────────────────
 *
 * @typedef {Object} ParsedItem
 * @property {string}   id                 Stable client-side UUID.
 * @property {string}   name               Canonical, human-readable item name.
 *                                         e.g. "2% Milk", not "milk 2%".
 * @property {string|null} quantity        Quantity string as written ("2", "1 lb",
 *                                         "1 dozen") or null.
 * @property {string|null} unit            Optional unit token, separated from
 *                                         quantity for downstream consumers
 *                                         (Instacart line items, Foundation
 *                                         Models normalization). null when not
 *                                         present.
 * @property {string}   category           Display category — one of CATEGORIES.
 *                                         Cloud path sets this, on-device path
 *                                         falls back to the JS categorizer.
 * @property {string}   section            Alias of `category` for the research
 *                                         contract. Always equals `category`;
 *                                         exposed so external consumers can use
 *                                         either name.
 * @property {boolean}  flagged            Item needs human review.
 * @property {boolean}  needsConfirmation  Alias for `flagged`. Both names are
 *                                         set so we don't break the existing
 *                                         FlaggedItemsSection UI while still
 *                                         honoring the research contract.
 * @property {string|null} note            Short explanation of WHY the item is
 *                                         flagged (or null).
 * @property {boolean}  crossedOut         True if struck through on the source
 *                                         list. Cloud path drops these by
 *                                         default; on-device path may surface
 *                                         them so users can decide.
 * @property {string[]} alternatives       Possible re-readings of an ambiguous
 *                                         item ("kombucha" vs "kombuchu"). Used
 *                                         by the planned AmbiguityPanel — empty
 *                                         array is the default.
 * @property {string}   original           As the model first read it, before
 *                                         normalization. Useful for debugging.
 * @property {boolean}  checked            UI-only: in-store check-off state.
 */

import { genId } from '../utils/parseResponse.js'
import { normalizeCategory } from '../utils/categories.js'

/**
 * Coerce a raw model item (cloud or on-device) into a canonical ParsedItem.
 *
 * Defensive about missing or wrong-typed fields — neither pipeline emits a
 * perfect schema every time. Order of resolution for each field:
 *
 *   1. Use the canonical name if the model emitted it.
 *   2. Fall through to legacy aliases (`section`→`category`, `needsConfirmation`→`flagged`, …).
 *   3. Apply a safe default (null / false / [] / 'Other').
 *
 * @param {object} raw  An item object as emitted by Claude or Foundation Models.
 * @returns {ParsedItem}
 */
export function normalizeParsedItem(raw) {
  if (!raw || typeof raw !== 'object') {
    return makeEmpty('')
  }

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const original = typeof raw.original === 'string' && raw.original
    ? raw.original
    : name

  const category = normalizeCategory(raw.category ?? raw.section)

  const flagged = Boolean(raw.flagged ?? raw.needsConfirmation)

  const alternatives = Array.isArray(raw.alternatives)
    ? raw.alternatives.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim())
    : []

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : genId(),
    name,
    original,
    quantity: raw.quantity != null && raw.quantity !== '' ? String(raw.quantity) : null,
    unit: typeof raw.unit === 'string' && raw.unit.trim() ? raw.unit.trim() : null,
    category,
    section: category,
    flagged,
    needsConfirmation: flagged,
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null,
    crossedOut: Boolean(raw.crossedOut),
    alternatives,
    checked: Boolean(raw.checked),
  }
}

/**
 * Empty shell ParsedItem — used as a fallback by `normalizeParsedItem` and
 * exposed for tests / Storybook fixtures.
 *
 * @param {string} name
 * @returns {ParsedItem}
 */
export function makeEmpty(name = '') {
  return {
    id: genId(),
    name,
    original: name,
    quantity: null,
    unit: null,
    category: 'Other',
    section: 'Other',
    flagged: false,
    needsConfirmation: false,
    note: null,
    crossedOut: false,
    alternatives: [],
    checked: false,
  }
}

/**
 * Pipeline-source tag. Useful for analytics ("did the on-device path produce
 * worse parses on average?") and for the UI to show a small "AI" badge for
 * cloud-derived items vs. nothing for on-device ones (privacy signal).
 */
export const PIPELINE_SOURCES = Object.freeze({
  CLOUD_CLAUDE: 'cloud-claude',
  ON_DEVICE_VISION: 'on-device-vision',
  ON_DEVICE_LLM: 'on-device-llm',
  TEXT_INPUT: 'text-input',
  OLLAMA: 'ollama',
})
