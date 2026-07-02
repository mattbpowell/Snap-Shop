/**
 * Heuristic filters for raw Apple Vision OCR output.
 *
 * Content-based only — no bounding-box / position filtering, since the
 * geometry of "where the noise lives" is a property of the photo, not the
 * grocery list. A page header at the top of one image could be a real first
 * item near the top of another. Anything image-shape-specific belongs in the
 * multimodal LLM pass, not a regex.
 *
 * What we do today:
 *   1. Drop empty / single-character lines.
 *   2. Drop lines containing form-template words that are virtually never
 *      part of an item — "PLANNER", "AGENDA", "TO DO", "week". Token-level
 *      match so partials like "LY PLANNER" get caught even when Vision
 *      clipped the leading characters.
 *   3. STRIP calendar words (weekdays, months) out of a line but keep the
 *      rest — meal plans annotate dishes with days ("Tacos Tuesday",
 *      "Wed: spaghetti") and the dish must survive as an item. Only if
 *      nothing meaningful remains does the line drop.
 *   4. Drop lines that are exactly one decorative/motivational word
 *      (planner margin tabs).
 */

// Form / planner furniture — a line containing any of these is template, not
// an item. Lower-cased, alpha-only token match.
const FORM_WORDS = new Set([
  'planner', 'menu', 'list', 'schedule', 'agenda', 'goals', 'tasks',
  'reminders', 'note', 'notes', 'today', 'week', 'weekof', 'date',
  'todo', 'shopping', 'grocery', 'groceries',
])

// Calendar words — these get REMOVED from a line, not the line removed.
// "Tacos Tuesday" → "Tacos"; a line that is ONLY calendar words drops.
const CALENDAR_WORDS = new Set([
  'mon', 'monday', 'tue', 'tues', 'tuesday', 'wed', 'wednesday',
  'thu', 'thur', 'thurs', 'thursday', 'fri', 'friday', 'sat', 'saturday',
  'sun', 'sunday',
  'jan', 'january', 'feb', 'february', 'mar', 'march', 'apr', 'april',
  'may', 'jun', 'june', 'jul', 'july', 'aug', 'august',
  'sep', 'sept', 'september', 'oct', 'october', 'nov', 'november',
  'dec', 'december',
])

// Abstract / motivational words that show up as decorative labels printed on
// planners and stationery (e.g. the colored margin tabs on a fridge planner).
// These are matched ONLY when a line is exactly one of these words — never as
// a sub-token — so real multi-word products that happen to contain one
// ("I Can't Believe It's Not Butter", "Magic Shell", "Love Corn") survive.
const DECORATIVE_SOLO_WORDS = new Set([
  'happiness', 'happy', 'magic', 'creativity', 'create', 'imagine',
  'smiles', 'smile', 'believe', 'trust', 'love', 'joy', 'hope', 'peace',
  'dream', 'dreams', 'gratitude', 'grateful', 'blessed', 'kindness',
  'courage', 'inspire', 'inspiration', 'faith', 'wonder', 'shine',
  'focus', 'motivation', 'positivity', 'calm', 'balance', 'wellness',
  'mindful', 'mindfulness', 'breathe', 'grow', 'flourish',
  'strength', 'harmony', 'serenity', 'bliss', 'thrive',
])

const normToken = (w) => w.toLowerCase().replace(/[^a-z]/g, '')

/**
 * Filter + clean raw OCR lines. Returns the surviving lines with calendar
 * words stripped from their text (other fields preserved).
 */
export function filterOcrLines(lines) {
  if (!Array.isArray(lines)) return []
  const out = []
  for (const line of lines) {
    const cleaned = cleanLine(line)
    if (cleaned) out.push(cleaned)
  }
  return out
}

function cleanLine(line) {
  const text = (line.text || '').trim()
  if (text.length < 2) return null

  const tokens = text.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  if (tokens.length === 0) return null

  // Form/template furniture → whole line is noise.
  if (tokens.some(t => FORM_WORDS.has(t))) return null

  // Strip calendar words, keep the remainder ("Tacos Tuesday" → "Tacos").
  const words = text.split(/\s+/)
  const kept = words.filter(w => {
    const n = normToken(w)
    return n.length > 0 && !CALENDAR_WORDS.has(n)
  })
  if (kept.length === 0) return null
  const strippedText = kept.join(' ').replace(/[\s:;,–-]+$/g, '').trim()
  if (strippedText.length < 2) return null

  const keptTokens = strippedText.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  if (keptTokens.length === 0) return null

  // Lone abstract/motivational word (planner margin label) → drop. Only when
  // it's the WHOLE line, so multi-word products containing the word survive.
  if (keptTokens.length === 1 && DECORATIVE_SOLO_WORDS.has(keptTokens[0])) return null

  return strippedText === text ? line : { ...line, text: strippedText }
}
