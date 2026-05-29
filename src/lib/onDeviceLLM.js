/**
 * On-device LLM via the AppleLLM Capacitor plugin (Apple Foundation Models,
 * iOS 26+) using GUIDED GENERATION (@Generable).
 *
 * The Swift plugin fills typed Swift structs via constrained decoding, so the
 * model output is structurally guaranteed — we get back clean arrays/objects
 * across the Capacitor bridge with no loose-JSON parsing, no format repair,
 * and no schema drift. Instructions here focus purely on SEMANTICS (what to
 * include, drop, fix); the structure is enforced by the type system on the
 * Swift side.
 *
 * Plugin surface (ios/App/App/Plugins/AppleLLM/AppleLLMPlugin.swift):
 *   isAvailable()                        → { available, reason }
 *   parseGroceryList({ instructions, prompt }) → { items: [{ name, section, forDishes }] }
 *   suggestItems({ instructions, prompt })     → { suggestions: [string] }
 */

import { registerPlugin } from '@capacitor/core'
import { isNative, getPlatform } from './platform.js'

const AppleLLM = registerPlugin('AppleLLM')

const PARSE_TIMEOUT_MS = 120000
const READINESS_TIMEOUT_MS = 3000

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    }),
  ])
}

export async function checkAppleIntelligence() {
  if (!isNative() || getPlatform() !== 'ios') {
    return { ok: false, reason: 'not native iOS' }
  }
  try {
    const { available, reason } = await withTimeout(
      AppleLLM.isAvailable(),
      READINESS_TIMEOUT_MS,
      'isAvailable'
    )
    return { ok: !!available, reason: reason || (available ? 'available' : 'unknown') }
  } catch (e) {
    return { ok: false, reason: `isAvailable threw: ${e?.message || e}` }
  }
}

// Normalize one raw plugin item into our shape. `section` is already one of
// our category strings (the Swift enum maps to them exactly); `forDishes` is
// a guaranteed array.
function normalizeItem(raw) {
  const name = typeof raw?.name === 'string' ? raw.name.trim() : ''
  if (!name) return null
  const section = typeof raw?.section === 'string' ? raw.section : 'Other'
  const parents = Array.isArray(raw?.forDishes)
    ? raw.forDishes.map(d => String(d).trim()).filter(Boolean)
    : []
  return { name, section, parents }
}

// ── OCR cleanup ───────────────────────────────────────────────────────────

const OCR_INSTRUCTIONS = `You are cleaning up text recognized from a photo of a handwritten shopping list. The user message is the recognized lines, one item per line.

For each line:
- If it is something a person could buy at a store (food, household, pharmacy, hardware, etc.), include it — fix obvious handwriting/OCR spelling errors and assign the correct store section.
- If it is clearly NOT a purchasable item — decorative or motivational words printed on stationery (HAPPINESS, MAGIC, CREATIVITY, JOY, SMILES, GRATITUDE), page headers (PLANNER, MENU, LIST), calendar words, prices, or scribbles — omit it entirely.

Do not invent items that are not present in the input. These are direct list items, so leave forDishes empty for all of them. Bias toward keeping anything plausibly purchasable; the user can delete extras.`

/**
 * Clean an array of raw OCR strings into structured grocery items.
 * Returns [{ name, section, parents }] (parents always empty for OCR).
 */
export async function parseOcrLines(rawTexts) {
  const prompt = rawTexts.map((t, i) => `${i + 1}. ${t}`).join('\n')
  const { items } = await withTimeout(
    AppleLLM.parseGroceryList({ instructions: OCR_INSTRUCTIONS, prompt }),
    PARSE_TIMEOUT_MS,
    'AppleLLM.parseGroceryList (ocr)'
  )
  return (Array.isArray(items) ? items : []).map(normalizeItem).filter(Boolean)
}

// ── Free-form typed text → list (with dish nesting) ─────────────────────────

const FREEFORM_INSTRUCTIONS = `The user typed a shopping note. Each comma- or newline-separated entry is either a literal shopping item (e.g. "milk", "eggs", "sriracha") or the name of a dish or meal (e.g. "Tacos", "Spaghetti", "Breakfast Smoothies").

Produce the full shopping list:
- For each LITERAL item the user typed: output it cleaned, with forDishes EMPTY. Never attach a dish to an item the user typed directly.
- For each DISH the user named: output the dish name itself as one item (forDishes empty, so it stays as a header), AND output 4 to 8 specific ingredients needed to make that dish, each with forDishes set to that dish's name.
- If an ingredient is needed for MULTIPLE named dishes, output it once with every relevant dish in forDishes.

Each item must be a real, concrete, shoppable product. Assign every item its correct store section. Do not pad with items unrelated to what the user wrote.`

/**
 * Parse free-form typed text into structured items with optional dish nesting.
 * Returns [{ name, section, parents }] — `parents` lists the dish(es) an
 * ingredient belongs to (empty for literal items and dish headers).
 */
export async function parseFreeFormText(userText) {
  const { items } = await withTimeout(
    AppleLLM.parseGroceryList({ instructions: FREEFORM_INSTRUCTIONS, prompt: userText }),
    PARSE_TIMEOUT_MS,
    'AppleLLM.parseGroceryList (text)'
  )
  return (Array.isArray(items) ? items : []).map(normalizeItem).filter(Boolean)
}

// ── Specify (suggest more specific items) ───────────────────────────────────

const SUGGEST_INSTRUCTIONS = `You expand one shopping-list entry into 5–8 more specific items a shopper might pick up.

The user message is a JSON object: { "item": "<entry>", "hint": "<optional note>" }.

Classify the entry and respond accordingly:
- MEAL or DISH (e.g. "Tacos") → the specific ingredients used to make it.
- GENERIC CATEGORY (e.g. "Fruit", "Cleaning Supplies") → distinct specific items in that category.
- ALREADY-SPECIFIC ITEM (e.g. "Corn Dogs", "Greek Yogurt") → brand names or product varieties of that exact item; all suggestions must be the SAME kind of thing.

Each suggestion must be a real, concrete, shoppable item — never a category or a prepared dish. Never echo the input back. If a hint is given, align suggestions to it.`

/**
 * Suggest 5–8 specific items for a list entry. Returns an array of strings.
 */
export async function suggestSpecificItems(itemName, hint = '') {
  const prompt = JSON.stringify({ item: itemName, hint })
  const { suggestions } = await withTimeout(
    AppleLLM.suggestItems({ instructions: SUGGEST_INSTRUCTIONS, prompt }),
    PARSE_TIMEOUT_MS,
    'AppleLLM.suggestItems'
  )
  const original = itemName.trim().toLowerCase()
  return (Array.isArray(suggestions) ? suggestions : [])
    .map(s => String(s).trim())
    .filter(Boolean)
    .filter(s => s.toLowerCase() !== original)
}
