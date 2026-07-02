/**
 * Duplicate detection for finished item lists.
 *
 * Communal lists accumulate duplicates written by different people in
 * different words — "Chai" and "Paisleys chai", "milk" and "2% milk".
 * We NEVER silently merge or delete (traceability is the product rule);
 * instead the more specific / later entry gets `flagged: true` with a note
 * naming its likely twin, so it lands in the review screen's double-check
 * section for a human call.
 *
 * Detection is deterministic: two items are suspected duplicates when their
 * normalized word sets are equal, or one's words are a subset of the
 * other's ("chai" ⊂ "paisleys chai"). Word-subset only fires against
 * MEANINGFUL overlap — the shared words must include every word of the
 * shorter name, so "corn dogs" vs "corn" would match but "corn dogs" vs
 * "hot dogs" would not.
 */

const normWords = (name) =>
  String(name)
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9%]+/)
    .filter(Boolean)

function isSubset(a, b) {
  // every word of a appears in b
  return a.every(w => b.includes(w))
}

/**
 * Mark suspected duplicates in an items array (objects with `name`, `note`,
 * `flagged`). Returns the same array; later/more-specific entries get
 * flagged with a "Possible duplicate of …" note. Items generated for a dish
 * (note starting "for ") are exempt — a taco ingredient duplicating a
 * literal item is usually intentional overlap the model already merged.
 */
export function markDuplicates(items) {
  if (!Array.isArray(items) || items.length < 2) return items

  const isDishGenerated = (it) => typeof it.note === 'string' && it.note.startsWith('for ')
  const entries = items.map(it => ({ it, words: normWords(it.name) }))

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]
      const b = entries[j]
      if (a.words.length === 0 || b.words.length === 0) continue
      // Dish-generated ingredients are exempt — overlap with dish expansions
      // is common and intentional; we only police what people wrote.
      if (isDishGenerated(a.it) || isDishGenerated(b.it)) continue

      const aSubB = isSubset(a.words, b.words)
      const bSubA = isSubset(b.words, a.words)
      if (!aSubB && !bSubA) continue

      // Pick which one to flag: the more specific (more words) entry, or on
      // a tie the later one. Never flag something already flagged for this.
      const flagTarget = (b.words.length >= a.words.length) ? b : a
      const other = flagTarget === b ? a : b
      const t = flagTarget.it
      if (t.note && t.note.startsWith('Possible duplicate')) continue

      t.flagged = true
      const dupNote = `Possible duplicate of "${other.it.name}"`
      t.note = t.note ? `${dupNote} · ${t.note}` : dupNote
    }
  }
  return items
}
