export const CATEGORIES = [
  'Produce',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Bakery',
  'Frozen',
  'Pantry & Dry Goods',
  'Beverages',
  'Snacks',
  'Household',
  'Other'
]

export function isKnownCategory(name) {
  return CATEGORIES.includes(name)
}

export function normalizeCategory(name) {
  if (!name) return 'Other'
  return isKnownCategory(name) ? name : 'Other'
}

export function groupByCategory(items, categoryOrder = CATEGORIES) {
  const groups = new Map()
  for (const cat of categoryOrder) groups.set(cat, [])
  for (const item of items) {
    const cat = normalizeCategory(item.category)
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat).push(item)
  }
  return Array.from(groups.entries())
    .filter(([, list]) => list.length > 0)
    .map(([name, list]) => ({ name, items: list }))
}
