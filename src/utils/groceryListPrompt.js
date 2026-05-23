/**
 * Claude Vision API prompt and message builder for grocery list parsing.
 *
 * Image placed BEFORE text in the API message (Anthropic Vision best practice).
 * Three few-shot examples cover the highest-ROI edge cases: shorthand expansion,
 * crossed-out item filtering, and vague category expansion.
 */

/**
 * Stripped-down prompt for local models (Ollama / LM Studio).
 * Fewer rules = less confusion for sub-13B models. No few-shot examples.
 */
/**
 * Pass 2 prompt for Ollama three-pass flow.
 * Normalize raw transcription → clean item list, no categories.
 * Categories are assigned deterministically by categorizer.js in JS.
 */
export const OLLAMA_NORMALIZE_PROMPT = `You are cleaning up raw text read by OCR from a shopping list image.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{"items": [{"name": "Paper Towels", "quantity": null, "flagged": false, "note": null}]}

Rules:
- Each object MUST have a "name" field containing the item name as a plain string.
- Include ALL items from the list — groceries, supplements, household goods, office supplies, anything written as a thing to buy.
- If a line contains TWO separate items (e.g. "Feezy toothpicks"), create TWO separate entries, one for each item.
- Only fix OBVIOUS OCR errors where you are 100% certain: "Createin" → "Creatine", "Dishwaser pads" → "Dishwasher Pods", "cocona milk" → "Coconut Milk". Do NOT guess or rename unknown/brand words you don't recognise — keep them exactly as written.
- Expand common shorthand: "chx brst" → "Chicken Breast", "OJ" → "Orange Juice", "pb" → "Peanut Butter", "evoo" → "Olive Oil", "parm" → "Parmesan Cheese"
- Set "quantity" to the quantity string if present (e.g. "x2", "1 lb", "6 oz"), otherwise null.
- ONLY exclude obvious page decorations: color tab labels (Pink, Blue, Green…), motivational words (Happiness, Love, Trust, Magic, Believe…), page headers (DAILY PLANNER, NOTES…), and watermarks.
- Do NOT filter out items just because they are not food — include supplements, cleaning products, paper goods, etc.
- Do NOT add a "category" field.`

export const OLLAMA_SYSTEM_PROMPT = `You are a grocery list parser. Parse the provided text into a structured grocery list.

Return ONLY a JSON object — no explanation, no markdown fences:
{ "items": [ { "name": string, "quantity": string|null, "category": string, "flagged": boolean, "note": string|null } ] }

Category must be one of: Produce | Meat & Seafood | Dairy & Eggs | Bakery | Pantry & Dry Goods | Frozen | Beverages | Snacks | Household | Other

Rules:
- Include only actual grocery or household shopping items.
- EXCLUDE: motivational words (Happiness, Love, Trust…), color names (Pink, Blue…), decorative labels, header text, and anything that is clearly not something you would buy at a store.
- Ignore crossed-out items.
- Capture quantity if written (e.g. "x2", "1 lb"), otherwise null.
- If a real item is unclear or ambiguous, set flagged=true and add a brief note.`

export const GROCERY_SYSTEM_PROMPT = `You are a shopping list parser. The image you receive is a handwritten, typed, or photographed shopping list. It may contain abbreviations, multi-column layouts, struck-through items, smudged ink, and partial occlusions. Extract EVERY item and return structured JSON. Priming the model that the input is "handwritten" raises accuracy on ambiguous characters — keep this assumption explicit.

Rules:
1. Include ALL items — groceries, supplements, household goods, cleaning products, paper goods, personal care. Do not filter to food only.
2. Normalize shorthand: "OJ" → "Orange Juice", "chx" → "Chicken", "pb" → "Peanut Butter", "evoo" → "Olive Oil", "parm" → "Parmesan Cheese", "chx brst" → "Chicken Breast", "TP" → "Toilet Paper", "HB eggs" → "Hard Boiled Eggs", "Milk 2%" → "2% Milk".
3. Expand vague meal shorthand using common sense: "taco stuff" → ground beef, tortillas, shredded cheese, salsa, sour cream, lettuce. "pasta night" → pasta, marinara sauce, ground beef, parmesan, garlic. "sandwich stuff" → bread, deli meat, cheese, lettuce, tomato, mayo.
4. If handwriting is unclear, make your best reasonable guess — do not return null or skip the item.
5. Flag ambiguous items you cannot confidently expand or normalize: set flagged=true and add a brief clarifying note.
6. LOW-CONFIDENCE READS: if your reading of an item is plausible but you are NOT confident the word is correct (smudged ink, ambiguous loops, partially obscured), append " ?" to the name AND set flagged=true with note="Hard to read — please verify." Optionally include up to 2 plausible re-readings in an "alternatives" array. Do not skip items just because they're hard to read — guessing-with-a-flag beats omission every time.
7. READING ORDER: most lists read top-to-bottom. If the page clearly has TWO columns of items (items in two distinct horizontal bands of x-position with similar formatting), read the LEFT column top-to-bottom FIRST, then the right column top-to-bottom. Do not interleave columns row-by-row.
8. Categorize each item using ONLY these categories (closed set — do not invent your own): Produce | Meat & Seafood | Dairy & Eggs | Bakery | Pantry & Dry Goods | Frozen | Beverages | Snacks | Household | Other.
9. CROSSED-OUT items: include them in the output with crossedOut=true. Do NOT silently drop them — the client decides whether to display struck-through items based on context. Items not crossed out should set crossedOut=false (or omit the field).
10. Also ignore obvious non-purchase text: page headers (DAILY PLANNER, NOTES), motivational tab labels (Happiness, Love, Trust), color names (Pink, Blue, Green), dates, prices, and store names.
11. Preserve quantities when visible. Set "quantity" to the bare number ("2", "12") and "unit" to the unit token ("lb", "oz", "dozen") when both are present. If quantity is written as a single string ("1 dozen"), splitting is encouraged but optional. Use null when absent.
12. Return ONLY valid JSON. No explanatory text before or after the JSON.

Return format:
{ "items": [ { "name": string, "quantity": string|null, "unit": string|null, "category": string, "flagged": boolean, "crossedOut": boolean, "note": string|null, "alternatives": string[]|null } ] }`

// Few-shot examples covering the edge cases most likely to trip up the model.
// Injected as alternating user/assistant turns before the real request.
//
// Order is research-driven (snap-shop-research-2026-05-10.md, AI section):
//   1. Clean handwriting, simple list             → straight pass-through
//   2. Abbreviations + meal-shorthand expansion   → normalization
//   3. Ambiguous quantities                       → quantity / unit splitting
//   4. Struck-through item                        → crossedOut=true (NOT omitted)
//   5. Multi-column / smudged                     → reading order + low-confidence
//
// Note on the field name: we use `flagged` here (NOT `ambiguous`) because that's
// what the parser, FlaggedItemsSection, and item schema all read. Earlier
// versions of this prompt used `ambiguous`, which silently dropped on the floor
// — items the model marked as uncertain never made it into the "double-check"
// section of Review. Keep this consistent with parseResponse.js.
//
// Tip from research: Claude Opus 4.6 / Sonnet 4.6 weight examples heavily —
// keep them tight and aligned with desired behavior. Each example below is a
// single concept demonstration; don't pile multiple lessons into one example.
const FEW_SHOT_EXAMPLES = [
  // 1. Clean handwriting, simple list — pure pass-through.
  {
    userText: `[Example grocery list image: a clean, neatly-printed list reading "milk, eggs, bread"]`,
    assistantResponse: JSON.stringify({
      items: [
        { name: 'Milk', quantity: null, unit: null, category: 'Dairy & Eggs', flagged: false, crossedOut: false, note: null },
        { name: 'Eggs', quantity: null, unit: null, category: 'Dairy & Eggs', flagged: false, crossedOut: false, note: null },
        { name: 'Bread', quantity: null, unit: null, category: 'Bakery', flagged: false, crossedOut: false, note: null },
      ],
    }),
  },
  // 2. Abbreviations + a meal-shorthand expansion.
  {
    userText: `[Example grocery list image containing text: "pb&j stuff, oj x2, chx thighs, evoo, Milk 2%, TP, chips"]`,
    assistantResponse: JSON.stringify({
      items: [
        { name: 'Peanut Butter', quantity: null, unit: null, category: 'Pantry & Dry Goods', flagged: false, crossedOut: false, note: null },
        { name: 'Jelly', quantity: null, unit: null, category: 'Pantry & Dry Goods', flagged: false, crossedOut: false, note: null },
        { name: 'Orange Juice', quantity: '2', unit: null, category: 'Beverages', flagged: false, crossedOut: false, note: null },
        { name: 'Chicken Thighs', quantity: null, unit: null, category: 'Meat & Seafood', flagged: false, crossedOut: false, note: null },
        { name: 'Olive Oil', quantity: null, unit: null, category: 'Pantry & Dry Goods', flagged: false, crossedOut: false, note: null },
        { name: '2% Milk', quantity: null, unit: null, category: 'Dairy & Eggs', flagged: false, crossedOut: false, note: null },
        { name: 'Toilet Paper', quantity: null, unit: null, category: 'Household', flagged: false, crossedOut: false, note: null },
        { name: 'Chips', quantity: null, unit: null, category: 'Snacks', flagged: false, crossedOut: false, note: null },
      ],
    }),
  },
  // 3. Ambiguous quantities — split into quantity + unit when both present.
  {
    userText: `[Example grocery list image: "doz eggs, 2 lb gr beef, 6 oz spinach, 1 gal milk"]`,
    assistantResponse: JSON.stringify({
      items: [
        { name: 'Eggs', quantity: '12', unit: null, category: 'Dairy & Eggs', flagged: false, crossedOut: false, note: null },
        { name: 'Ground Beef', quantity: '2', unit: 'lb', category: 'Meat & Seafood', flagged: false, crossedOut: false, note: null },
        { name: 'Spinach', quantity: '6', unit: 'oz', category: 'Produce', flagged: false, crossedOut: false, note: null },
        { name: 'Milk', quantity: '1', unit: 'gal', category: 'Dairy & Eggs', flagged: false, crossedOut: false, note: null },
      ],
    }),
  },
  // 4. Struck-through item — RETURNED with crossedOut=true, not omitted.
  {
    userText: `[Example grocery list image: a handwritten list where "milk" is crossed out with a single line, and "eggs" and "bread" are not crossed out]`,
    assistantResponse: JSON.stringify({
      items: [
        { name: 'Milk', quantity: null, unit: null, category: 'Dairy & Eggs', flagged: false, crossedOut: true, note: null },
        { name: 'Eggs', quantity: null, unit: null, category: 'Dairy & Eggs', flagged: false, crossedOut: false, note: null },
        { name: 'Bread', quantity: null, unit: null, category: 'Bakery', flagged: false, crossedOut: false, note: null },
      ],
    }),
  },
  // 5. Multi-column + smudged + meal expansion. Tests reading order, low
  // confidence ("Kombucha ?"), and the cheese-ambiguity note pattern.
  {
    userText: `[Example grocery list image: TWO COLUMNS — left column top-to-bottom reads "stuff for pasta night, the good cheese, bananas"; right column top-to-bottom reads "one item with smudged handwriting that looks like it could be 'kombucha' or 'kombuchu']`,
    assistantResponse: JSON.stringify({
      items: [
        { name: 'Pasta', quantity: null, unit: null, category: 'Pantry & Dry Goods', flagged: false, crossedOut: false, note: null },
        { name: 'Marinara Sauce', quantity: null, unit: null, category: 'Pantry & Dry Goods', flagged: false, crossedOut: false, note: null },
        { name: 'Ground Beef', quantity: null, unit: null, category: 'Meat & Seafood', flagged: false, crossedOut: false, note: null },
        { name: 'Parmesan Cheese', quantity: null, unit: null, category: 'Dairy & Eggs', flagged: false, crossedOut: false, note: null },
        { name: 'Garlic', quantity: null, unit: null, category: 'Produce', flagged: false, crossedOut: false, note: null },
        { name: 'Cheese', quantity: null, unit: null, category: 'Dairy & Eggs', flagged: true, crossedOut: false, note: 'Unspecified type — did you mean a specific cheese?' },
        { name: 'Bananas', quantity: null, unit: null, category: 'Produce', flagged: false, crossedOut: false, note: null },
        { name: 'Kombucha ?', quantity: null, unit: null, category: 'Beverages', flagged: true, crossedOut: false, note: 'Hard to read — please verify.', alternatives: ['Kombucha', 'Kombuchu'] },
      ],
    }),
  },
]

/**
 * Builds the messages array for the Anthropic SDK.
 * Image comes BEFORE text per Anthropic Vision best practices.
 * Few-shot examples injected as alternating user/assistant turns.
 */
export function buildParseListMessages(imageBase64, mediaType = 'image/webp') {
  const messages = []

  for (const example of FEW_SHOT_EXAMPLES) {
    messages.push({ role: 'user', content: example.userText })
    messages.push({ role: 'assistant', content: example.assistantResponse })
  }

  messages.push({
    role: 'user',
    content: [
      {
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: imageBase64 },
      },
      {
        type: 'text',
        text: 'Parse this grocery list and return the structured JSON.',
      },
    ],
  })

  return messages
}

/**
 * Builds an OpenAI-compatible messages array for Ollama / LM Studio.
 *
 * No few-shot examples — smaller local models tend to echo the example content
 * instead of treating them as demonstrations, producing hallucinated output.
 * A short, direct prompt works better for sub-13B vision models.
 */
export function buildOllamaMessages(imageBase64, mediaType = 'image/webp') {
  return [
    {
      role: 'system',
      content: OLLAMA_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:${mediaType};base64,${imageBase64}` },
        },
        {
          type: 'text',
          text: 'Look at this image carefully. List every item you can read, exactly as written. Then return the JSON.',
        },
      ],
    },
  ]
}
