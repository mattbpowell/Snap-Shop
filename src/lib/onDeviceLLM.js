/**
 * On-device LLM normalization via the AppleLLM Capacitor plugin.
 *
 * Wraps Apple Foundation Models (`LanguageModelSession`) on iOS 26+. Bails
 * out cleanly on the simulator and on any device without Apple Intelligence
 * — `checkAppleIntelligence()` returns the reason so callers can fall back
 * to OCR-only output (or, eventually, a cloud LLM).
 *
 * The native plugin lives at ios/App/App/Plugins/AppleLLM/AppleLLMPlugin.swift.
 * It exposes two methods:
 *   - isAvailable()      → { available: boolean, reason: string }
 *   - generate({prompt, instructions?}) → { text: string }
 */

import { registerPlugin } from '@capacitor/core'
import { isNative, getPlatform } from './platform.js'

const AppleLLM = registerPlugin('AppleLLM')

const NORMALIZE_INSTRUCTIONS = `You clean up raw OCR output from photos of handwritten shopping lists.

The user message is a JSON array of OCR'd text lines. For each line, decide:

(A) Could this be something a person buys at a store? (food, household, pharmacy, hardware, beverages, snacks, pet, baby, etc.) Even if misspelled or unfamiliar, if it could plausibly be a purchasable item, treat it as one. Return the cleaned-up spelling.

(B) Is this clearly NOT something you can buy at a store? Examples: abstract concepts and feeling words printed on stationery (HAPPINESS, MAGIC, CREATIVITY, JOY, COURAGE, GRATITUDE, SMILES, KINDNESS, LOVE), page headers, scribbles. Return an empty string "".

Output a single JSON array of strings — one string per input line, in the same order. Same length as the input. NO objects, NO keys — just string values separated by commas.

Rules:
- The output is exactly one JSON array. The first character must be [ and the last must be ].
- Output one string per input line. Output length MUST equal input length.
- BIAS TOWARD KEEPING. Only emit "" when you are confident the line is non-purchasable decoration. When uncertain, emit the cleaned line.
- For kept items, fix obvious handwriting/OCR errors and use proper title case. Stay close to what the person wrote — do not substitute a different item.
- Preserve inline quantities and modifiers ("2%", "lbs", "x2", brand names) as written.
- Do NOT add items that aren't in the input. Do NOT pad with common groceries.
- Output the JSON array only. No markdown, no prose, no leading or trailing text.`

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    }),
  ])
}

/**
 * Forgiving JSON parser for small-LLM output. Tries strict JSON first; falls
 * back to bracketed comma-separated text where the model forgot to quote
 * strings (e.g. `[Hot Dog, Chicken Dog]`). Returns whatever it can extract,
 * or `null` if the text isn't list-shaped at all.
 */
function tolerantParse(text) {
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {}

  // Unquoted bracketed list: `[foo, bar, "baz"]`
  const bracket = trimmed.match(/^\[([\s\S]*)\]\s*$/)
  if (bracket) {
    return bracket[1]
      .split(',')
      .map(s => s.trim().replace(/^["'`]|["'`]$/g, '').trim())
      .filter(s => s.length > 0)
  }

  return null
}

export async function checkAppleIntelligence() {
  if (!isNative() || getPlatform() !== 'ios') {
    return { ok: false, reason: 'not native iOS' }
  }
  try {
    const { available, reason } = await withTimeout(
      AppleLLM.isAvailable(),
      3000,
      'isAvailable'
    )
    return { ok: !!available, reason: reason || (available ? 'available' : 'unknown') }
  } catch (e) {
    return { ok: false, reason: `isAvailable threw: ${e?.message || e}` }
  }
}

/**
 * Spell-check raw OCR strings via Apple Foundation Models.
 *
 * Returns an array of cleaned strings of the same length as the input. If the
 * model returns a different length (defies instructions), or any item is
 * empty, falls back to the original raw string for that index. Throws only
 * on plugin failure / timeout / unparseable output.
 *
 * The first call after app install can take 10-30s while iOS warms up
 * Foundation Models. We allow up to 60s before bailing out.
 */
export async function spellCheckLines(rawTexts) {
  const promptInput = JSON.stringify(rawTexts)
  const prompt = `OCR lines:\n${promptInput}`
  const { text } = await withTimeout(
    AppleLLM.generate({ prompt, instructions: NORMALIZE_INSTRUCTIONS }),
    120000,
    'AppleLLM.generate'
  )

  const cleaned = (text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')

  const parsed = tolerantParse(cleaned)
  if (parsed === null) {
    throw new Error(`Foundation Models returned non-JSON: ${cleaned.slice(0, 120)}`)
  }

  // Expected shape: flat array of strings. Tolerate (a) the old
  // {items:[{cleaned:""}]} shape and (b) plain object {k1:"v1",k2:"v2"}
  // because the small model occasionally regresses to either. Anything we
  // can't extract falls back to raw OCR per index so we never silently drop
  // data.
  let candidates = []
  if (Array.isArray(parsed)) {
    candidates = parsed
  } else if (Array.isArray(parsed?.items)) {
    candidates = parsed.items.map(i =>
      typeof i === 'string' ? i : (i && typeof i.cleaned === 'string' ? i.cleaned : null)
    )
  } else if (parsed && typeof parsed === 'object') {
    candidates = Object.values(parsed).filter(v => typeof v === 'string')
  }

  return rawTexts.map((raw, i) => {
    const c = candidates[i]
    if (typeof c === 'string') return c.trim() // "" deliberately means drop
    return raw
  })
}

// ── Free-form text → grocery list ─────────────────────────────────────────

const FLEXIBLE_TEXT_INSTRUCTIONS = `You turn a free-form shopping note into a clean shopping list, tagging ingredients to the dish they came from.

The user message contains text the shopper typed. Each comma- or newline-separated entry is one of:
- A literal shopping item (e.g. "milk", "eggs", "sriracha")
- A dish or meal name (e.g. "Tacos", "Spaghetti", "Breakfast Smoothies")

For each LITERAL item: output the cleaned name as a plain string.

For each DISH: output BOTH the dish name itself AND every ingredient needed to make it. The ingredient name comes FIRST, with the parent dish in parentheses AFTER, exactly like English would phrase it: "Ground Beef (for Tacos)".

If an ingredient is needed for MULTIPLE dishes from the input, output it ONCE with the dishes comma-separated inside the parentheses: "Garlic (for Tacos, Spaghetti)".

Output a single JSON array of strings. The first character must be [ and the last must be ]. Inside, only string values separated by commas.

CRITICAL — ingredient direction:
- The thing you BUY at the store goes on the left.
- The dish you're cooking goes on the right, inside "(for ...)".
- Never write "Tacos (for Ground Beef)". Always "Ground Beef (for Tacos)".

Rules:
- Use proper title case for both items and dish names.
- Each ingredient must be a real, concrete shoppable item.
- Don't double-count pantry staples — combine into one entry with comma-separated parents instead.
- Stay strictly on-topic to what the user wrote.
- Output the JSON array only. No objects, no keys, no markdown, no prose.`

/**
 * Parse free-form typed text into items, with optional parent-dish nesting.
 *
 * Returns an array of `{ name, parents? }` where `parents` is a list of
 * dish names this item belongs to (if the model tagged it with `@Dish`).
 * Plain literal items have no `parents` field.
 *
 * The dish names themselves are also returned as items so they stay on the
 * list as headers — the caller decides how to render the parent / child
 * relationship (typically as a "for <Dish>" note on each ingredient).
 */
export async function parseFreeFormText(userText) {
  const { text } = await withTimeout(
    AppleLLM.generate({ prompt: userText, instructions: FLEXIBLE_TEXT_INSTRUCTIONS }),
    120000,
    'AppleLLM.generate (text)'
  )

  const cleaned = (text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')

  const parsed = tolerantParse(cleaned)
  if (parsed === null) {
    throw new Error(`Foundation Models returned non-JSON: ${cleaned.slice(0, 120)}`)
  }
  let strings = []
  if (Array.isArray(parsed)) {
    strings = parsed.filter(x => typeof x === 'string')
  } else if (Array.isArray(parsed?.items)) {
    strings = parsed.items
      .map(i => typeof i === 'string' ? i : (i && typeof i.name === 'string' ? i.name : null))
      .filter(Boolean)
  } else if (parsed && typeof parsed === 'object') {
    strings = Object.values(parsed).filter(v => typeof v === 'string')
  }

  // Each entry is either:
  //   - Plain item:                   "Milk"
  //   - Ingredient with parent:       "Ground Beef (for Tacos)"
  //   - Ingredient with parents:      "Garlic (for Tacos, Spaghetti)"
  // The parens are the parent marker. Anything inside "(for ...)" is one or
  // more dish names separated by commas. Match the LAST "(for ...)" suffix
  // so an item with parens earlier in its name (rare) doesn't get split.
  const PARENT_RE = /^(.+?)\s*\(\s*for\s+([^()]+?)\s*\)\s*$/i
  return strings
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const m = s.match(PARENT_RE)
      if (!m) return { name: s }
      const name = m[1].trim()
      const parents = m[2].split(',').map(p => p.trim()).filter(Boolean)
      if (!name) return null
      return parents.length > 0 ? { name, parents } : { name }
    })
    .filter(Boolean)
}

// ── Specify (suggest more specific items) ─────────────────────────────────

const SUGGEST_INSTRUCTIONS = `You expand one shopping-list entry into 5–8 more specific items the shopper might pick up.

The user message is a JSON object: { "item": "<entry>", "hint": "<optional user note>" }.

First, classify the entry into one of three cases. Then generate suggestions accordingly:

CASE A — MEAL or DISH (e.g. "Tacos", "Spaghetti", "Smoothies", "Stir Fry"):
Suggest 5–8 specific ingredients used to make that meal. Each must be an item found on a store shelf, not a prepared dish. Stay strictly on-topic — for "Tacos" include things like ground beef, tortillas, salsa, lettuce, cheese, sour cream; do NOT include unrelated foods.

CASE B — GENERIC CATEGORY (e.g. "Fruit", "Snacks", "Cleaning Supplies", "Beverages"):
Suggest 5–8 distinct, specific shoppable items that fit the category. Vary across the category — for "Fruit" mix different fruits (apples, bananas, berries, oranges, grapes). Never pad with unrelated categories.

CASE C — ALREADY-SPECIFIC ITEM (e.g. "Corn Dogs", "Greek Yogurt", "Granny Smith Apples", "Parmesan"):
Suggest 5–8 brand names or product variations of that exact item — things a shopper might pick between when reaching for it on the shelf. Prefer well-known brand names you recognize. If you cannot recall specific brands, give distinct varieties or sub-types instead (e.g. mini vs full-size, beef vs chicken, plain vs flavored, organic vs regular). The suggestions must all be of the SAME thing — for "Corn Dogs" all suggestions must be corn dogs, not hot dogs or bacon; for "Granny Smith Apples" all must be apple varieties.

Output a single JSON array of strings. The first character must be [ and the last must be ]. Inside, only string values separated by commas.

Rules:
- 5 to 8 strings, ordered by relevance.
- Each must be different from every other and different from the input — never echo the input back.
- Each must be a real, concrete shoppable item — never a category, dish name, or recipe.
- Use proper title case.
- If a hint is provided, treat it as a strong signal about what the shopper wants and align suggestions to it.
- Output the JSON array only. No object, no keys, no markdown, no prose, no leading or trailing text.`

export async function suggestSpecificItems(itemName, hint = '') {
  const userMessage = JSON.stringify({ item: itemName, hint })
  const { text } = await withTimeout(
    AppleLLM.generate({ prompt: userMessage, instructions: SUGGEST_INSTRUCTIONS }),
    60000,
    'AppleLLM.generate (suggest)'
  )

  const cleaned = (text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')

  const parsed = tolerantParse(cleaned)
  if (parsed === null) {
    throw new Error(`Foundation Models returned non-JSON: ${cleaned.slice(0, 120)}`)
  }
  // Expected: a flat array of strings. Tolerate (a) {suggestions:[{name:""}]}
  // and (b) plain {k1:"v1",k2:"v2"} — small model regression patterns.
  let names = []
  if (Array.isArray(parsed)) {
    names = parsed.filter(x => typeof x === 'string')
  } else if (Array.isArray(parsed?.suggestions)) {
    names = parsed.suggestions
      .map(s => typeof s === 'string' ? s : (s && typeof s.name === 'string' ? s.name : null))
      .filter(Boolean)
  } else if (parsed && typeof parsed === 'object') {
    names = Object.values(parsed).filter(v => typeof v === 'string')
  }
  return names
    .map(n => n.trim())
    .filter(Boolean)
    .map(name => ({ name }))
}
