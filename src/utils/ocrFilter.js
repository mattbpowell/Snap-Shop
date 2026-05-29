/**
 * Heuristic filters for raw Apple Vision OCR output.
 *
 * Content-based only — no bounding-box / position filtering, since the
 * geometry of "where the noise lives" is a property of the photo, not the
 * grocery list. A page header at the top of one image could be a real first
 * item near the top of another. Anything image-shape-specific belongs in an
 * LLM normalization pass (Phase 4), not a regex.
 *
 * What we filter today:
 *   1. Empty / single-character lines
 *   2. Form-template words that are virtually never grocery items —
 *      weekdays, months, "PLANNER", "AGENDA", "TO DO". Token-level match
 *      so partials like "DAILY PLANNER" get caught even if Vision clipped
 *      the leading characters.
 */

// Lower-cased, alpha-only — match key is `text.toLowerCase().replace(/[^a-z]/g, '')`.
const STOP_WORDS = new Set([
  // Form / planner headers
  'planner', 'menu', 'list', 'schedule', 'agenda', 'goals', 'tasks',
  'reminders', 'note', 'notes', 'today', 'week', 'weekof', 'date',
  'todo', 'shopping', 'grocery', 'groceries',
  // Weekdays
  'mon', 'monday', 'tue', 'tues', 'tuesday', 'wed', 'wednesday',
  'thu', 'thur', 'thurs', 'thursday', 'fri', 'friday', 'sat', 'saturday',
  'sun', 'sunday',
  // Months
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
  'mindful', 'mindfulness', 'breathe', 'grow', 'flourish', 'gratitude',
  'strength', 'harmony', 'serenity', 'bliss', 'thrive',
])

export function filterOcrLines(lines) {
  if (!Array.isArray(lines)) return []
  return lines.filter(isLikelyItem)
}

function isLikelyItem(line) {
  const text = (line.text || '').trim()
  if (text.length < 2) return false

  // Token-level stop-word match — catches partials like "LY PLANNER" where
  // OCR clipped the leading characters. Tokenize on whitespace + punctuation;
  // drop the line if any token is a known form/calendar word.
  const tokens = text.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  if (tokens.length === 0) return false
  if (tokens.some(t => STOP_WORDS.has(t))) return false

  // Lone abstract/motivational word (planner margin label) → drop. Only when
  // it's the WHOLE line, so multi-word products containing the word survive.
  if (tokens.length === 1 && DECORATIVE_SOLO_WORDS.has(tokens[0])) return false

  return true
}
