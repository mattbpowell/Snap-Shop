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

export const GROCERY_SYSTEM_PROMPT = `You are a shopping list parser. Given an image of a handwritten, typed, or photographed shopping list, extract EVERY item and return structured JSON.

Rules:
1. Include ALL items — groceries, supplements, household goods, cleaning products, paper goods, personal care. Do not filter to food only.
2. Normalize shorthand: "OJ" → "Orange Juice", "chx" → "Chicken", "pb" → "Peanut Butter", "evoo" → "Olive Oil", "parm" → "Parmesan Cheese", "chx brst" → "Chicken Breast", "TP" → "Toilet Paper", "HB eggs" → "Hard Boiled Eggs".
3. Expand vague meal shorthand using common sense: "taco stuff" → ground beef, tortillas, shredded cheese, salsa, sour cream, lettuce. "pasta night" → pasta, marinara sauce, ground beef, parmesan, garlic. "sandwich stuff" → bread, deli meat, cheese, lettuce, tomato, mayo.
4. If handwriting is unclear, make your best reasonable guess — do not return null or skip the item.
5. Flag ambiguous items you cannot confidently expand or normalize: set flagged=true and add a brief clarifying note.
6. LOW-CONFIDENCE READS: if your reading of an item is plausible but you are NOT confident the word is correct (smudged ink, ambiguous loops, partially obscured), append " ?" to the name AND set flagged=true with note="Hard to read — please verify." This lets the shopper see your best guess but know to double-check it. Do not skip items just because they're hard to read — guessing-with-a-flag beats omission every time.
7. READING ORDER: most lists read top-to-bottom. If the page clearly has TWO columns of items (items in two distinct horizontal bands of x-position with similar formatting), read the LEFT column top-to-bottom FIRST, then the right column top-to-bottom. Do not interleave columns row-by-row.
8. Categorize each item using ONLY these categories: Produce | Meat & Seafood | Dairy & Eggs | Bakery | Pantry & Dry Goods | Frozen | Beverages | Snacks | Household | Other.
9. CRITICAL: Ignore any items that are crossed out, struck through, or otherwise marked as done. Do not include them in the output.
10. Also ignore obvious non-purchase text: page headers (DAILY PLANNER, NOTES), motivational tab labels (Happiness, Love, Trust), color names (Pink, Blue, Green), dates, prices, and store names.
11. Preserve quantities when visible. Use the format "2", "1 lb", "6 oz", "1 dozen", etc. Use null if no quantity is specified.
12. Return ONLY valid JSON. No explanatory text before or after the JSON.

Return format:
{ "items": [ { "name": string, "quantity": string|null, "category": string, "flagged": boolean, "note": string|null } ] }`

// Few-shot examples covering the edge cases most likely to trip up the model.
// Injected as alternating user/assistant turns before the real request.
//
// Note on the field name: we use `flagged` here (NOT `ambiguous`) because that's
// what the parser, FlaggedItemsSection, and item schema all read. Earlier
// versions of this prompt used `ambiguous`, which silently dropped on the floor
// — items the model marked as uncertain never made it into the "double-check"
// section of Review. Keep this consistent with parseResponse.js.
const FEW_SHOT_EXAMPLES = [
  {
    userText: `[Example grocery list image containing text: "pb&j stuff, oj x2, chx thighs, evoo, TP, chips"]`,
    assistantResponse: JSON.stringify({
      items: [
        { name: 'Peanut Butter', quantity: null, category: 'Pantry & Dry Goods', flagged: false, note: null },
        { name: 'Jelly', quantity: null, category: 'Pantry & Dry Goods', flagged: false, note: null },
        { name: 'Orange Juice', quantity: '2', category: 'Beverages', flagged: false, note: null },
        { name: 'Chicken Thighs', quantity: null, category: 'Meat & Seafood', flagged: false, note: null },
        { name: 'Olive Oil', quantity: null, category: 'Pantry & Dry Goods', flagged: false, note: null },
        { name: 'Toilet Paper', quantity: null, category: 'Household', flagged: false, note: null },
        { name: 'Chips', quantity: null, category: 'Snacks', flagged: false, note: null },
      ],
    }),
  },
  {
    userText: `[Example grocery list image: a handwritten list where "milk" is crossed out with a line through it, and "eggs" and "bread" are not crossed out]`,
    assistantResponse: JSON.stringify({
      items: [
        { name: 'Eggs', quantity: null, category: 'Dairy & Eggs', flagged: false, note: null },
        { name: 'Bread', quantity: null, category: 'Bakery', flagged: false, note: null },
      ],
    }),
  },
  {
    userText: `[Example grocery list image: "stuff for pasta night, the good cheese, bananas, and one item with smudged handwriting that looks like it could be 'kombucha' or 'kombuchu']`,
    assistantResponse: JSON.stringify({
      items: [
        { name: 'Pasta', quantity: null, category: 'Pantry & Dry Goods', flagged: false, note: null },
        { name: 'Marinara Sauce', quantity: null, category: 'Pantry & Dry Goods', flagged: false, note: null },
        { name: 'Ground Beef', quantity: null, category: 'Meat & Seafood', flagged: false, note: null },
        { name: 'Parmesan Cheese', quantity: null, category: 'Dairy & Eggs', flagged: false, note: null },
        { name: 'Garlic', quantity: null, category: 'Produce', flagged: false, note: null },
        { name: 'Cheese', quantity: null, category: 'Dairy & Eggs', flagged: true, note: 'Unspecified type — did you mean a specific cheese?' },
        { name: 'Bananas', quantity: null, category: 'Produce', flagged: false, note: null },
        { name: 'Kombucha ?', quantity: null, category: 'Beverages', flagged: true, note: 'Hard to read — please verify.' },
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
