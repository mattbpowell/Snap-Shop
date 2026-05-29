/**
 * Canonical grocery-name lookup — a deterministic pre/post-normalization step.
 *
 * Per the 2026-05-29 research: a small hand-curated table beats an LLM on the
 * long tail of obvious abbreviations and common misspellings, and is free at
 * runtime. We run every finalized item name through `normalizeItemName`:
 *   - On the on-device LLM paths it's cheap insurance (the model usually
 *     handles these, but the 3B model misses some).
 *   - On the deterministic fallback path (Apple Intelligence unavailable, or
 *     the safety net fired) it's the ONLY normalization that runs, so it
 *     matters most there.
 *   - On the cloud path it harmonizes output with the on-device path.
 *
 * Matching is EXACT on a normalized key (lowercased, single-spaced, trailing
 * punctuation stripped). No substring replacement — that avoids mangling
 * names that merely contain an abbreviation (e.g. "Bojangles" ≠ "oj").
 * Values are already in canonical Title Case, so a hit also fixes casing.
 *
 * To extend: add `'<what users write>': '<canonical name>'` to RAW. Keys are
 * normalized at load, so write them however is natural.
 */

const RAW = {
  // ── Abbreviations ─────────────────────────────────────────────────────
  'oj': 'Orange Juice',
  'o.j.': 'Orange Juice',
  'pb': 'Peanut Butter',
  'pb&j': 'Peanut Butter & Jelly',
  'pbj': 'Peanut Butter & Jelly',
  'tp': 'Toilet Paper',
  'pt': 'Paper Towels',
  'papertowels': 'Paper Towels',
  'mac n cheese': 'Macaroni & Cheese',
  'mac and cheese': 'Macaroni & Cheese',
  'mac & cheese': 'Macaroni & Cheese',
  'mac&cheese': 'Macaroni & Cheese',
  'macncheese': 'Macaroni & Cheese',
  'chx': 'Chicken',
  'chkn': 'Chicken',
  'chick': 'Chicken',
  'chx brst': 'Chicken Breast',
  'chicken brst': 'Chicken Breast',
  'chx breast': 'Chicken Breast',
  'grnd beef': 'Ground Beef',
  'grd beef': 'Ground Beef',
  'gr beef': 'Ground Beef',
  'grnd turkey': 'Ground Turkey',
  'doz': 'Dozen',
  'doz eggs': 'Dozen Eggs',
  'dz eggs': 'Dozen Eggs',
  'dozen eggs': 'Dozen Eggs',
  'veggies': 'Vegetables',
  'veg': 'Vegetables',
  'mayo': 'Mayonnaise',
  'avo': 'Avocado',
  'guac': 'Guacamole',
  'choc': 'Chocolate',
  'choco': 'Chocolate',
  'choc chips': 'Chocolate Chips',
  'half & half': 'Half & Half',
  'half and half': 'Half & Half',
  'half&half': 'Half & Half',
  'h2o': 'Water',
  'sparkling h2o': 'Sparkling Water',
  'whl mlk': 'Whole Milk',
  'mlk': 'Milk',
  'egs': 'Eggs',
  'bbq sauce': 'BBQ Sauce',
  'bbq': 'BBQ Sauce',
  'ranch': 'Ranch Dressing',
  'evoo': 'Olive Oil',
  'olive oyl': 'Olive Oil',
  'tortillas': 'Tortillas',
  'gv': 'Vegetables',

  // ── Quantity / variant casing ─────────────────────────────────────────
  '2% milk': '2% Milk',
  '1% milk': '1% Milk',
  'whole milk': 'Whole Milk',
  'skim milk': 'Skim Milk',
  'almond milk': 'Almond Milk',
  'oat milk': 'Oat Milk',
  'soy milk': 'Soy Milk',
  'heavy cream': 'Heavy Cream',
  'sour cream': 'Sour Cream',
  'cream cheese': 'Cream Cheese',
  'ice cream': 'Ice Cream',
  'greek yogurt': 'Greek Yogurt',

  // ── Common misspellings: produce ──────────────────────────────────────
  'bananna': 'Banana',
  'bannana': 'Banana',
  'bananas': 'Bananas',
  'tomatos': 'Tomatoes',
  'tomatoe': 'Tomato',
  'potatos': 'Potatoes',
  'potatoe': 'Potato',
  'avacado': 'Avocado',
  'avocodo': 'Avocado',
  'avacados': 'Avocados',
  'brocoli': 'Broccoli',
  'brocolli': 'Broccoli',
  'broccolli': 'Broccoli',
  'letuce': 'Lettuce',
  'lettice': 'Lettuce',
  'cucmber': 'Cucumber',
  'cucumer': 'Cucumber',
  'zucchinni': 'Zucchini',
  'zuchini': 'Zucchini',
  'jalapeno': 'Jalapeño',
  'jalepeno': 'Jalapeño',
  'jalapenos': 'Jalapeños',
  'cantelope': 'Cantaloupe',
  'canteloupe': 'Cantaloupe',
  'celary': 'Celery',
  'cellery': 'Celery',
  'onyon': 'Onion',
  'onin': 'Onion',
  'onions': 'Onions',
  'garlick': 'Garlic',
  'cilantro': 'Cilantro',
  'cilatro': 'Cilantro',
  'mushroms': 'Mushrooms',
  'mushrums': 'Mushrooms',
  'strawberys': 'Strawberries',
  'strawberries': 'Strawberries',
  'rasberries': 'Raspberries',
  'blueberys': 'Blueberries',
  'spinich': 'Spinach',
  'asparigus': 'Asparagus',

  // ── Common misspellings: dairy / cheese ───────────────────────────────
  'chedar': 'Cheddar',
  'chedder': 'Cheddar',
  'mozarella': 'Mozzarella',
  'mozzarela': 'Mozzarella',
  'mozzerella': 'Mozzarella',
  'parmesean': 'Parmesan',
  'parmasan': 'Parmesan',
  'parmegiano': 'Parmesan',
  'yogart': 'Yogurt',
  'yougurt': 'Yogurt',
  'yoghurt': 'Yogurt',
  'buttr': 'Butter',

  // ── Common misspellings: meat / pantry ────────────────────────────────
  'chiken': 'Chicken',
  'chickn': 'Chicken',
  'saussage': 'Sausage',
  'sausge': 'Sausage',
  'bacn': 'Bacon',
  'spagetti': 'Spaghetti',
  'spagghetti': 'Spaghetti',
  'maccaroni': 'Macaroni',
  'cofee': 'Coffee',
  'coffe': 'Coffee',
  'cerial': 'Cereal',
  'cereaal': 'Cereal',
  'biscit': 'Biscuit',
  'bred': 'Bread',
  'ketsup': 'Ketchup',
  'catsup': 'Ketchup',
  'mustad': 'Mustard',
  'pickels': 'Pickles',
  'peanutbutter': 'Peanut Butter',
  'penut butter': 'Peanut Butter',
  'flour tortillas': 'Flour Tortillas',

  // ── Common misspellings: household / health ───────────────────────────
  'detergant': 'Detergent',
  'detergnt': 'Detergent',
  'shampooo': 'Shampoo',
  'shampo': 'Shampoo',
  'condishiner': 'Conditioner',
  'toothpast': 'Toothpaste',
  'tooth paste': 'Toothpaste',
  'deoderant': 'Deodorant',
  'multivitamin': 'Multivitamin',
  'multivitamins': 'Multivitamins',
}

function normKey(s) {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.]+$/, '')
}

const CANON = new Map(Object.entries(RAW).map(([k, v]) => [normKey(k), v]))

/**
 * Return the canonical form of an item name if we recognize it, otherwise the
 * trimmed input unchanged. Exact normalized-key match only.
 */
export function normalizeItemName(name) {
  if (typeof name !== 'string') return name
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (!trimmed) return trimmed
  return CANON.get(normKey(trimmed)) || trimmed
}
