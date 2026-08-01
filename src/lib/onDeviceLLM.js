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

// KILL-SWITCH for direct image input to Foundation Models.
//
// iOS 27 beta 1 through 4 (24A5380h, 24A5390f): on-device IMAGE inference
// gets the app SIGKILLed on contact (instant signal 9 with ~3.3GB free — a
// policy kill, not memory; text inference works fine). Retested on beta 4
// 2026-07-08 — identical instant kill, no fix. Apple Feedback filed
// 2026-07-07 (apple-feedback-fm-image-sigkill.md). Flip to true and rebuild
// on each new beta to retest.
const IMAGE_INPUT_ENABLED = false

export async function checkAppleIntelligence() {
  if (!isNative() || getPlatform() !== 'ios') {
    return { ok: false, reason: 'not native iOS', supportsImage: false }
  }
  try {
    const { available, reason, supportsImage } = await withTimeout(
      AppleLLM.isAvailable(),
      READINESS_TIMEOUT_MS,
      'isAvailable'
    )
    return {
      ok: !!available,
      reason: reason || (available ? 'available' : 'unknown'),
      // iOS 27+: the model accepts the photo directly (no OCR step).
      supportsImage: !!supportsImage && IMAGE_INPUT_ENABLED,
    }
  } catch (e) {
    return { ok: false, reason: `isAvailable threw: ${e?.message || e}`, supportsImage: false }
  }
}

const IMAGE_INSTRUCTIONS = `You read a photo of a shopping list or meal plan (handwritten on paper or a whiteboard, printed, or a screenshot) and produce the full shopping list.

Look at the image directly.

IGNORE anything that is part of the stationery, template, or background rather than what the person wrote: pre-printed planner headers, decorative margin labels (e.g. colored tabs reading HAPPINESS, MAGIC, CREATIVITY, BELIEVE, TRUST, LOVE), dates, page furniture. Only what the person actually wrote counts.

For each WRITTEN entry, decide whether it is a shopping ITEM or a DISH/MEAL name:
- ITEM (e.g. "milk", "eggs", "sriracha", "paper towels"): output it once, cleaned — fix spelling, use Title Case — with forDishes EMPTY.
- DISH or MEAL (e.g. "Tacos", "Spaghetti", "Smoothies"): output the dish name itself as one entry (forDishes empty, so it stays as a header), AND output 4 to 8 concrete ingredients needed to make that dish, each with forDishes set to that dish's name. Meal plans often annotate dishes with days ("Tacos Tuesday", "Wed: spaghetti") — strip the day words; the dish is "Tacos", not "Tacos Tuesday".
- An ingredient needed by MULTIPLE written dishes: output it once, with every relevant dish in forDishes.

Each output must be a real, concrete shoppable product with its correct store section. Do not invent items unrelated to what is written. Bias toward keeping real written entries; the user can delete extras.

Set needsClarification=true when the shopper should double-check an entry: personal shorthand (a possessive with a person's name like "Tabby's decaf" — expand to the likely product, e.g. "Tabby's Decaf Coffee", but flag it), a product with meaningfully different variants ("Pickle Chips" could be pickle-flavored chips or hamburger pickles), or hard-to-read handwriting you guessed at. Set it false for clear items and for ingredients you generated for a dish.`

/**
 * iOS 27+ only: hand the photo to the on-device model directly (no OCR).
 * Returns [{ name, section, parents }] — `parents` lists the dish(es) an
 * ingredient was generated for (empty for literal items and dish headers),
 * so a photographed meal plan behaves exactly like a typed one. Throws if
 * the plugin rejects (e.g. iOS < 27).
 */
export async function parseImageOnDevice(imageBase64) {
  const { items } = await withTimeout(
    AppleLLM.parseImage({
      imageBase64,
      instructions: IMAGE_INSTRUCTIONS,
      prompt: 'Read this photo of a shopping list or meal plan and produce the full shopping list.',
    }),
    PARSE_TIMEOUT_MS,
    'AppleLLM.parseImage'
  )
  return (Array.isArray(items) ? items : []).map(normalizeItem).filter(Boolean)
}

// Normalize one raw plugin item into our shape. `section` is already one of
// our category strings (the Swift enum maps to them exactly); `forDishes` is
// a guaranteed array; `needsClarification` marks entries the shopper should
// double-check (ambiguous handwriting, personal shorthand, variant choices).
function normalizeItem(raw) {
  const name = typeof raw?.name === 'string' ? raw.name.trim() : ''
  if (!name) return null
  const section = typeof raw?.section === 'string' ? raw.section : 'Other'
  const parents = Array.isArray(raw?.forDishes)
    ? raw.forDishes.map(d => String(d).trim()).filter(Boolean)
    : []
  return { name, section, parents, needsClarification: Boolean(raw?.needsClarification) }
}

// ── OCR cleanup ───────────────────────────────────────────────────────────

const OCR_INSTRUCTIONS = `You are cleaning up text recognized from a photo of a handwritten shopping list. The user message lists the recognized lines, numbered.

Process EVERY numbered line. Completeness matters most — do not skip, merge, or summarize lines. Aim to return roughly the same number of items as input lines.

For each line:
- If it could be something a person buys at a store (food, household, pharmacy, hardware, beverages, etc.), include it: fix obvious handwriting/OCR spelling errors and assign the correct store section. Even if a line is short, unfamiliar, or only probably an item, KEEP it.
- Omit a line when it is NOT a purchasable product. In particular, drop a line that is a single abstract word naming a feeling, virtue, mood, or concept rather than a physical object — e.g. happiness, love, believe, trust, magic, creativity, joy, hope, peace, gratitude, kindness, courage, focus, balance. These are decorative labels printed along the edges of planners and stationery, not shopping items. Also drop page headers (PLANNER, MENU, LIST), bare calendar words, prices, and scribbles.
- NEVER transform a non-product line into a product. Advertisements, event announcements, slogans, and random letter fragments must be OMITTED — e.g. "FREE EVENTS" is an ad, not french fries; "NOV 13" is a date, not an item. Only correct spelling when the intended product is evident from the letters actually written. If a line might be a product but you cannot tell what, keep it close to as-written and set needsClarification=true instead of guessing a different product.

Distinguish a lone abstract word (drop it) from a real product that happens to contain such a word (keep it): "Love" alone is decoration, but "Love Corn" or "I Can't Believe It's Not Butter" are products. When in doubt about a concrete PRODUCT, keep it — the user can delete extras.

Set needsClarification=true when the shopper should double-check an entry: personal shorthand (a possessive with a person's name like "Tabby's decaf" — expand to the likely product, e.g. "Tabby's Decaf Coffee", but flag it), a product with meaningfully different variants ("Pickle Chips" could be pickle-flavored chips or hamburger pickles), or a low-confidence reading. Set it false for clear, unambiguous items.`

/**
 * Clean an array of raw OCR strings into structured grocery items.
 * Returns [{ name, section, parents }] (parents always empty for OCR).
 */
export async function parseOcrLines(rawTexts) {
  const prompt =
    `Here are ${rawTexts.length} lines recognized from the photo:\n` +
    rawTexts.map((t, i) => `${i + 1}. ${t}`).join('\n')
  const { items } = await withTimeout(
    AppleLLM.cleanGroceryList({ instructions: OCR_INSTRUCTIONS, prompt }),
    PARSE_TIMEOUT_MS,
    'AppleLLM.cleanGroceryList'
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
