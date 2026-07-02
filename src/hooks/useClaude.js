import { useCallback, useState } from 'react'
import { callClaude as _callClaudeAPI, USE_WORKER } from '../lib/apiClient.js'
import { parseClaudeResponse, genId } from '../utils/parseResponse.js'
import { preprocessImageForVision, blobToBase64 } from '../utils/imagePreprocessor.js'
import { categorizeItem } from '../utils/categorizer.js'
import { CATEGORIES } from '../utils/categories.js'
import { normalizeItemName } from '../utils/canonicalNames.js'
import { markDuplicates } from '../utils/duplicates.js'
import { canRecognizeTextOnDevice, recognizeTextOnDevice } from '../lib/platform.js'
import { filterOcrLines } from '../utils/ocrFilter.js'
import {
  checkAppleIntelligence,
  parseOcrLines,
  parseImageOnDevice,
  suggestSpecificItems,
  parseFreeFormText,
} from '../lib/onDeviceLLM.js'
import {
  GROCERY_SYSTEM_PROMPT,
  OLLAMA_NORMALIZE_PROMPT,
  OLLAMA_SYSTEM_PROMPT,
  buildParseListMessages,
} from '../utils/groceryListPrompt.js'

// ---------------------------------------------------------------------------
// Provider config
// ---------------------------------------------------------------------------
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const OLLAMA_BASE   = (import.meta.env.VITE_OLLAMA_URL  || 'http://localhost:11434').replace(/\/$/, '')
const OLLAMA_MODEL  =  import.meta.env.VITE_OLLAMA_MODEL || 'llama3.2-vision:11b'

// Anthropic provider is active when a CF Worker URL or a direct API key is configured.
// Ollama is the fallback for fully local / offline use.
const PROVIDER = (USE_WORKER || ANTHROPIC_KEY) ? 'anthropic' : 'ollama'

// System prompt for the "expand this entry" suggestion flow.
// The input can be one of three things — the model picks the right behavior:
//   (a) Generic category    "Fruit", "Candy", "Cleaning supplies"  → specific items
//   (b) Dish or meal name   "Tacos", "Spaghetti", "Smoothies"      → grocery ingredients
//   (c) Specific item       "Granny Smith apples"                  → related alternatives
const SUGGEST_SYSTEM_PROMPT = `You help shoppers expand a shopping list entry into a list of specific items they should buy.

The input is ONE of three things — pick the right behavior:
  (a) A generic category (e.g. "Fruit", "Candy", "Cleaning supplies")
      → Return 5–8 specific items in that category.
  (b) A dish, meal, or recipe name (e.g. "Tacos", "Spaghetti carbonara",
      "Breakfast smoothies", "Chicken stir fry")
      → Return the actual grocery ingredients you'd buy to make that dish.
        Include proteins, produce, dairy, and key pantry items.
  (c) An already-specific item (e.g. "Granny Smith apples", "Kerrygold butter")
      → Return 5–8 substitutions, brand alternatives, or close pairings.

When in doubt between (a) and (b), prefer (b): if the word names a food
someone cooks or eats as a meal, break it into ingredients.

CRITICAL CORRECTNESS RULES — read carefully:
- Every suggestion MUST be a direct ingredient of the input or a clear
  member of the input's category. If you are not confident an item belongs,
  OMIT IT. Five strong, on-topic suggestions are far better than eight with
  weak or unrelated ones.
- Never include unrelated foods just to fill the list. (For "Tacos", do NOT
  include cake, pita, olives, etc. — only items used IN tacos.)
- Each name must be a real grocery item — concrete, recognizable on a shelf.
  Never a cooked dish, kit, sauce mix, or prepared meal.

If the user provided a hint or note (shown as "user note" in the prompt),
treat it as a strong signal about what they want and align suggestions to it.

EXAMPLES:
  Input: "Tacos"
  → ["Ground beef" (Meat), "Corn tortillas" (Bakery), "Cheddar cheese" (Dairy),
     "Lettuce" (Produce), "Tomato" (Produce), "Salsa" (Pantry), "Sour cream" (Dairy)]

  Input: "Spaghetti"
  → ["Spaghetti pasta" (Pantry), "Marinara sauce" (Pantry),
     "Ground beef" (Meat), "Parmesan cheese" (Dairy), "Garlic" (Produce),
     "Onion" (Produce)]

  Input: "Fruit"
  → ["Bananas" (Produce), "Apples" (Produce), "Strawberries" (Produce),
     "Blueberries" (Produce), "Oranges" (Produce), "Grapes" (Produce)]

  Input: "Granny Smith apples"
  → ["Honeycrisp apples" (Produce), "Fuji apples" (Produce),
     "Gala apples" (Produce), "Pink Lady apples" (Produce)]

Return ONLY valid JSON in this exact shape:
{"suggestions":[{"name":"<short specific item>","category":"<one category>"}]}

Other rules:
- Provide 5 to 8 suggestions, ordered by importance / commonness.
- "category" must be one of: Produce | Meat & Seafood | Dairy & Eggs | Bakery | Frozen | Pantry & Dry Goods | Beverages | Snacks | Household | Other.
- Skip ultra-basic pantry staples the user already has (salt, pepper, water).
- Don't include the original input as a suggestion on its own.
- No prose, no markdown, no commentary — only the JSON object.`

// Text-input system prompt for Ollama (and any local model). Accepts either a
// literal shopping list OR a meal plan / dish description, and returns one
// JSON shape regardless. Categorization happens deterministically in JS afterward,
// so this prompt does NOT include category fields.
const OLLAMA_FLEXIBLE_TEXT_PROMPT = `You parse a user's shopping note into structured JSON.

The note is ONE of:
  (a) A literal shopping list (e.g. "milk, eggs, bread, chx brst x2")
       → Extract each item. Fix obvious shorthand and misspellings only.
       → Examples: "chx brst" → "Chicken Breast", "OJ" → "Orange Juice",
                   "pb" → "Peanut Butter", "evoo" → "Olive Oil".
  (b) A meal plan or list of dishes (e.g. "Tacos Tuesday, spaghetti Wednesday,
      smoothies for breakfast all week", "dinner: stir fry, lunch: salads")
       → Generate the specific grocery ingredients needed to make those meals
         for a household. Include proteins, produce, dairy, and key pantry items.
       → Don't double-count items that appear across meals (e.g. olive oil
         needed for two dishes appears once).

Decide which case it is and respond accordingly. If a single line names a
dish you would cook ("Tacos", "Spaghetti", "Smoothies"), expand it.

Return ONLY valid JSON in this exact structure (no markdown, no explanation):
{"items": [{"name": "Chicken Breast", "quantity": "1 lb" or null, "flagged": false, "note": null}]}

Rules:
- Each "name" must be a concrete grocery item — short, recognizable on a shelf.
- Set "quantity" to a quantity string when natural ("1 lb", "6 oz", "2", "1 dozen"); otherwise null.
- If a meal mentions a dish with many common variants (e.g. "pasta sauce"
  without specifying jarred vs fresh), set "flagged": true and put a brief
  clarifying question in "note".
- Skip ultra-basic pantry staples the user surely has (salt, pepper, water).
- No filler items, no "kit" products, no prepared meals — list real groceries.`

// System prompt for Pass 1 — vision model extracts and normalizes in one shot
const TRANSCRIBE_SYSTEM_PROMPT = `You are reading a shopping list from an image. Extract all items and return ONLY valid JSON.

Use this exact structure:
{"items": [{"name": "Paper Towels", "quantity": null, "flagged": false, "note": null}]}

Rules:
- Include ALL items: groceries, supplements, household goods, office supplies — everything written as a thing to buy.
- One entry per item. If two items appear on the same line, create two separate entries.
- Fix only clear spelling mistakes. Keep brand names and unrecognized words exactly as written.
- Set "quantity" to the quantity string if present (e.g. "x2", "1 lb", "6 oz"), otherwise null.
- EXCLUDE: page headers (DAILY PLANNER), motivational tab labels (Happiness, Magic, Love, Believe, Trust, Smiles, Creativity), and color names (Pink, Blue, Green).
- Do NOT add a "category" field.`

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useClaude() {
  const [loading, setLoading] = useState(false)
  const [status, setStatus]   = useState('')
  const [error, setError]     = useState(null)

  const callAnthropic = useCallback(async (messages) => {
    return _callClaudeAPI({ system: GROCERY_SYSTEM_PROMPT, messages, maxTokens: 4096 })
  }, [])

  /**
   * Streaming call to Ollama's native /api/chat endpoint.
   * Native endpoint:
   *   - Supports `images: [base64]` directly on the user message (cleaner than OpenAI-compat data: URLs).
   *   - Supports `format: 'json'` to force structured JSON output (eliminates parse failures).
   *   - Supports streaming so the UI can show real progress instead of a 60s freeze.
   * Returns the full assistant message content once `done: true` arrives.
   */
  const callOllamaChatStream = useCallback(async ({
    messages,
    options = {},
    format = null,
    signal,
    onProgress,
  } = {}) => {
    let res
    try {
      res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages,
          stream: true,
          ...(format ? { format } : {}),
          options: { num_ctx: 8192, ...options },
        }),
      })
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      throw new Error(
        `Cannot reach Ollama at ${OLLAMA_BASE}. Most likely CORS or Ollama isn't running. Start it with: OLLAMA_ORIGINS=${typeof window !== 'undefined' ? window.location.origin : '*'} ollama serve`
      )
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (res.status === 404) {
        throw new Error(`Ollama 404: model "${OLLAMA_MODEL}" not found. Pull it first: ollama pull ${OLLAMA_MODEL}`)
      }
      throw new Error(`Ollama ${res.status}: ${body || res.statusText}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    let firstTokenAt = null

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let nl
        // Ollama streams NDJSON — one JSON object per line
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (!line) continue
          let obj
          try { obj = JSON.parse(line) } catch { continue }
          if (obj.error) throw new Error(`Ollama error: ${obj.error}`)
          const chunk = obj.message?.content
          if (chunk) {
            if (firstTokenAt == null) firstTokenAt = performance.now()
            content += chunk
            onProgress?.({ content, chunk, firstTokenAt })
          }
          if (obj.done) {
            return content
          }
        }
      }
    } finally {
      try { reader.cancel() } catch {}
    }
    return content
  }, [])

  const callOllama = useCallback(async (messages, options = {}) => {
    let res
    try {
      res = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false, options: { num_ctx: 8192, ...options } }),
      })
    } catch (e) {
      // fetch() throws TypeError for network errors, CORS rejections, and
      // mixed-content blocks. Surface the most common causes.
      const isHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:'
      const isHttpTarget = OLLAMA_BASE.startsWith('http://')
      const hint = isHttps && isHttpTarget
        ? 'The page is served over HTTPS but Ollama is on http:// — the browser is blocking this as mixed content. Serve the app over http:// in dev, or put Ollama behind a TLS proxy.'
        : `Most likely CORS or Ollama isn't running. Start it with: OLLAMA_ORIGINS=${typeof window !== 'undefined' ? window.location.origin : '*'} ollama serve`
      throw new Error(`Cannot reach Ollama at ${OLLAMA_BASE}. ${hint}`)
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (res.status === 404) {
        throw new Error(`Ollama 404: model "${OLLAMA_MODEL}" not found. Pull it first: ollama pull ${OLLAMA_MODEL}`)
      }
      throw new Error(`Ollama ${res.status}: ${body || res.statusText}`)
    }
    const data = await res.json()
    return data.choices[0].message.content
  }, [])

  /**
   * Connectivity check against the Ollama server. Runs two probes:
   *   1. GET  /api/tags  — confirms server is reachable and lists models.
   *   2. POST /api/show  — exercises the POST + JSON CORS preflight path
   *      that real completions also use. Some Ollama setups allow GET but
   *      block preflighted POSTs, which is the most common silent failure.
   * Returns a structured result so the UI can render targeted guidance.
   */
  const pingOllama = useCallback(async () => {
    const isHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:'
    const isHttpTarget = OLLAMA_BASE.startsWith('http://')
    const origin = typeof window !== 'undefined' ? window.location.origin : '*'

    const fetchError = (e) => {
      if (isHttps && isHttpTarget) {
        return {
          kind: 'mixed-content',
          message: 'Browser blocked the request as mixed content.',
          suggestion: 'The page is on HTTPS but Ollama is on plain HTTP. Use the dev server over http://, or put Ollama behind a TLS proxy.',
          error: e?.message || String(e),
        }
      }
      return {
        kind: 'network',
        message: `Could not reach ${OLLAMA_BASE}.`,
        suggestion: `Make sure Ollama is running. Start it with: OLLAMA_ORIGINS=${origin} ollama serve`,
        error: e?.message || String(e),
      }
    }

    // 1. GET /api/tags — basic reachability
    const startGet = performance.now()
    let tagsRes
    try {
      tagsRes = await fetch(`${OLLAMA_BASE}/api/tags`, { method: 'GET' })
    } catch (e) {
      return { ok: false, ...fetchError(e), stage: 'get' }
    }
    if (!tagsRes.ok) {
      return {
        ok: false,
        kind: 'http',
        status: tagsRes.status,
        message: `GET /api/tags returned ${tagsRes.status} ${tagsRes.statusText}.`,
        suggestion: 'Check the Ollama server logs for details.',
        stage: 'get',
      }
    }
    const tagsData = await tagsRes.json().catch(() => null)
    const models = Array.isArray(tagsData?.models) ? tagsData.models.map(m => m.name).filter(Boolean) : []
    const getLatencyMs = Math.round(performance.now() - startGet)

    // 2. POST /api/show — exercises CORS preflight on POST + Content-Type: application/json,
    //    same shape as the real /v1/chat/completions calls.
    const startPost = performance.now()
    let showRes
    try {
      showRes = await fetch(`${OLLAMA_BASE}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: OLLAMA_MODEL }),
      })
    } catch (e) {
      // GET worked but POST failed → preflight is the issue.
      return {
        ok: false,
        kind: 'cors-post',
        message: 'GET works but POST is blocked by the browser.',
        suggestion: `Ollama needs to allow preflighted POST requests from this origin. Restart with: OLLAMA_ORIGINS=${origin} ollama serve  (or OLLAMA_ORIGINS=* for any origin)`,
        error: e?.message || String(e),
        stage: 'post',
        models,
      }
    }
    const postLatencyMs = Math.round(performance.now() - startPost)

    if (showRes.status === 404) {
      return {
        ok: true,
        latencyMs: getLatencyMs + postLatencyMs,
        models,
        hasExactModel: false,
        hasModelFamily: false,
        modelMissing: true,
      }
    }
    if (!showRes.ok) {
      return {
        ok: false,
        kind: 'http',
        status: showRes.status,
        message: `POST /api/show returned ${showRes.status} ${showRes.statusText}.`,
        suggestion: 'Check the Ollama server logs for details.',
        stage: 'post',
        models,
      }
    }

    const baseName = OLLAMA_MODEL.split(':')[0]
    const hasExact = models.includes(OLLAMA_MODEL)
    const hasFamily = models.some(n => n === baseName || n.startsWith(baseName + ':'))
    return {
      ok: true,
      latencyMs: getLatencyMs + postLatencyMs,
      models,
      hasExactModel: hasExact,
      hasModelFamily: hasFamily,
      modelMissing: !hasExact && !hasFamily,
    }
  }, [])

  /**
   * Two-LLM-pass flow for Ollama image inputs.
   *
   * Pass 1 — Vision extract (vision LLM):
   *   Reads the image and returns structured JSON directly.
   *   Combining OCR + normalization in one shot works better for vision
   *   models than a separate text-only normalize step.
   *
   * Pass 2 — Categorize (deterministic JS rules):
   *   Keyword lookup in categorizer.js — consistent, instant, user-tunable.
   *   No LLM involved; same item always gets the same category.
   */
  const threePassOllama = useCallback(async (base64, setStatusFn) => {
    // Pass 1: vision model extracts + normalizes items as JSON in one shot.
    // We use the native /api/chat endpoint with:
    //   - images: [base64]   — cleaner than embedding a data: URL
    //   - format: 'json'     — forces strict JSON output, no markdown wrappers
    //   - stream: true       — so the UI shows real progress instead of a 60s freeze
    //   - AbortController    — hard 3-minute ceiling so a wedged call fails fast

    const TIMEOUT_MS = 180_000 // 3 min — first vision call cold-starts the model
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const start = performance.now()
    let firstTokenAt = null
    let charsSoFar = 0

    const composeStatus = () => {
      const elapsed = Math.round((performance.now() - start) / 1000)
      if (firstTokenAt == null) {
        return elapsed < 3 ? 'Reading image…' : `Reading image · ${elapsed}s`
      }
      return `Reading image · ${elapsed}s · ${charsSoFar} chars`
    }
    const ticker = setInterval(() => setStatusFn(composeStatus()), 1000)
    setStatusFn(composeStatus())

    if (typeof base64 === 'string') {
      // ~size visibility for diagnostics
      console.log(`[vision] image base64 length: ${base64.length} chars (~${Math.round(base64.length * 0.75 / 1024)} KB)`)
    }

    const messages = [
      { role: 'system', content: TRANSCRIBE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: 'Extract every item from this shopping list and return the JSON.',
        images: [base64],
      },
    ]

    let raw
    try {
      raw = await callOllamaChatStream({
        messages,
        options: { num_predict: 500 },
        format: 'json',
        signal: controller.signal,
        onProgress: ({ content, firstTokenAt: ft }) => {
          if (firstTokenAt == null && ft != null) firstTokenAt = ft
          charsSoFar = content.length
          setStatusFn(composeStatus())
        },
      })
    } catch (e) {
      if (e?.name === 'AbortError') {
        throw new Error(
          `Vision model timed out after ${TIMEOUT_MS / 1000}s. The first image is always slowest while Ollama loads the model into memory — try again, or check that Ollama has enough RAM/VRAM. On CPU-only machines, llama3.2-vision:11b can take 1–3 min per image.`
        )
      }
      throw e
    } finally {
      clearInterval(ticker)
      clearTimeout(timeout)
    }

    console.log('[Pass1 raw]', raw)

    // With format:'json' the response is guaranteed to be valid JSON — but the
    // model can still hit num_predict mid-object on a long list. One retry with
    // a "be brief" nudge is the safety net.
    let parsed
    try {
      parsed = JSON.parse(raw.trim())
    } catch {
      setStatusFn('Retrying…')
      const retryController = new AbortController()
      const retryTimeout = setTimeout(() => retryController.abort(), TIMEOUT_MS)
      try {
        const retry = await callOllamaChatStream({
          messages: [
            ...messages,
            { role: 'assistant', content: raw },
            { role: 'user', content: 'The previous response was truncated. Re-emit a complete, minimal JSON object — short names only, no extra fields.' },
          ],
          options: { num_predict: 500 },
          format: 'json',
          signal: retryController.signal,
        })
        parsed = JSON.parse(retry.trim())
      } finally {
        clearTimeout(retryTimeout)
      }
    }

    if (!parsed?.items?.length) {
      throw new Error('No items found in image. Try a clearer photo or paste the list as text.')
    }

    // Pass 2: deterministic JS categorization
    setStatusFn('Categorizing…')
    const items = (parsed.items || [])
      .map(item => {
        if (typeof item === 'string') return { name: item.trim(), quantity: null, flagged: false, note: null }
        const name = (item.name || item.item || item.text || item.description || '').trim()
        return { ...item, name }
      })
      .filter(item => item.name)
      .map(item => ({ ...item, category: categorizeItem(item.name) }))

    return JSON.stringify({ items })
  }, [callOllama])

  /**
   * Suggest specific items for a list entry. Handles three cases:
   *   - Generic category ("Fruit") → specific items
   *   - Dish/meal name ("Tacos") → grocery ingredients
   *   - Specific item ("Granny Smith apples") → related alternatives
   *
   * Pass any existing item.note via `context.note` so the model isn't
   * guessing blind — it'll align suggestions to what the user already
   * indicated.
   *
   * On Ollama we use the native /api/chat endpoint with format:'json' and
   * a low temperature so smaller models stay on-task. On Anthropic the
   * prompt + few-shot examples are enough.
   */
  const suggestExpansions = useCallback(async (itemName, context = {}) => {
    const trimmed = (itemName || '').trim()
    if (!trimmed) return []
    const noteHint = context.note ? ` (user note: "${context.note.trim()}")` : ''
    const userPrompt = `Suggest specific grocery items for: "${trimmed}"${noteHint}`

    // Native iOS: prefer Apple Foundation Models when available so the
    // Specify feature works without any network round-trip and without a
    // configured cloud key. Suggestions come back as plain names (guided
    // generation); the deterministic JS categorizer assigns sections.
    const aiCheck = await checkAppleIntelligence()
    if (aiCheck.ok) {
      try {
        const names = await suggestSpecificItems(trimmed, context.note || '')
        return names.map(name => ({ name, category: categorizeItem(name) }))
      } catch (e) {
        console.log('[suggestExpansions] AppleLLM failed, falling back:', e?.message)
        // fall through to cloud / ollama path
      }
    }

    let raw
    if (PROVIDER === 'anthropic') {
      raw = await _callClaudeAPI({
        system: SUGGEST_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 800,
      })
    } else {
      raw = await callOllamaChatStream({
        messages: [
          { role: 'system', content: SUGGEST_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        format: 'json',
        options: {
          num_predict: 400,
          temperature: 0.2, // keep small models on-topic
          top_p: 0.9,
        },
      })
    }

    const cleaned = (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          parsed = JSON.parse(match[0])
        } catch {
          parsed = null
        }
      }
    }

    const originalLower = trimmed.toLowerCase()
    const list = Array.isArray(parsed?.suggestions) ? parsed.suggestions : []
    return list
      .filter(s => s && typeof s.name === 'string' && s.name.trim())
      .map(s => {
        const name = s.name.trim()
        const modelCategory = typeof s.category === 'string' ? s.category.trim() : ''
        // Only trust the model's category if it's a canonical one; otherwise
        // fall back to the deterministic JS categorizer so e.g. "Dairy" (model
        // shorthand) doesn't get dumped into "Other" by the normalizer.
        const category = CATEGORIES.includes(modelCategory)
          ? modelCategory
          : categorizeItem(name)
        return { name, category }
      })
      // Defense in depth: drop the original input echoed back as a suggestion.
      .filter(s => s.name.toLowerCase() !== originalLower)
  }, [callOllamaChatStream])

  const parseList = useCallback(async ({ file, text }) => {
    setLoading(true)
    setStatus('')
    setError(null)
    try {
      let raw
      let blurWarning = null

      if (file) {
        setStatus('Preparing photo…')

        // Always try the canvas resize / WebP preprocessing first — it keeps
        // the base64 we ship across Capacitor's bridge to ~50–200KB instead
        // of multi-MB. createImageBitmap can hang on certain HDR JPEG
        // variants under iOS WebKit, so we wrap it in a 10s timeout and
        // fall back to the raw blob if it doesn't complete in time.
        let base64
        try {
          const preprocessed = await Promise.race([
            preprocessImageForVision(file),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('preprocess-timeout')), 10000)
            ),
          ])
          if (preprocessed.tooBlurry) {
            blurWarning = 'Image may be blurry — results might be incomplete. Try a clearer photo.'
          }
          base64 = await blobToBase64(preprocessed.blob)
        } catch (e) {
          console.log('[parseList] preprocess failed, using raw blob:', e?.message)
          base64 = await blobToBase64(file)
        }

        // ── Native iOS: Apple Vision OCR → optional Apple Foundation Models
        // normalization → deterministic categorize. Fully on-device. The
        // Foundation Models step is gated on availability (iOS 26 + Apple
        // Intelligence enabled); on older hardware we skip it and fall back
        // to raw OCR + the heuristic noise filter.
        if (canRecognizeTextOnDevice()) {
          const aiCheck = await checkAppleIntelligence()

          // iOS 27+: hand the photo to the model directly — no OCR step. The
          // model sees layout, color, and handwriting, so it natively ignores
          // pre-printed template furniture (planner margin tabs, decorative
          // labels) that the text-only path could never tell apart from real
          // items. This is the multimodal win from WWDC 2026.
          if (aiCheck.ok && aiCheck.supportsImage) {
            try {
              setStatus('Reading photo…')
              const parsed = await parseImageOnDevice(base64)
              if (parsed.length > 0) {
                const items = parsed.map(p => {
                  const name = normalizeItemName(p.name)
                  // Photographed meal plans behave like typed ones: dish
                  // headers come through plain; generated ingredients carry
                  // their parent dish(es) as a "for <Dish>" note. Ambiguous
                  // entries (shorthand, variant choices) come back flagged so
                  // they land in the double-check section with ✨ suggestions.
                  const note = p.parents && p.parents.length > 0
                    ? `for ${p.parents.join(', ')}`
                    : (p.needsClarification ? 'Double-check — tap ✨ for options' : null)
                  return {
                    id: genId(),
                    name,
                    original: p.name,
                    category: p.section && p.section !== 'Other'
                      ? p.section
                      : categorizeItem(name),
                    quantity: null,
                    note,
                    flagged: Boolean(p.needsClarification),
                    checked: false,
                  }
                })
                return { ok: true, items: markDuplicates(items), blurWarning }
              }
              // empty → fall through to the OCR path below
            } catch (e) {
              console.log('[parseList] image parse failed, falling back to OCR:', e?.message)
            }
          }

          // iOS 26 path (or image parse fell through): Vision OCR → noise
          // filter → Foundation Models cleanup → deterministic categorize.
          setStatus('Reading text…')
          const ocrLines = await recognizeTextOnDevice(base64)
          const filtered = filterOcrLines(ocrLines)
          if (filtered.length === 0) {
            throw new Error('No text recognized in image. Try a clearer photo.')
          }

          if (aiCheck.ok) {
            try {
              setStatus('Cleaning up…')
              const parsed = await parseOcrLines(filtered.map(l => l.text))
              // Safety net: the small on-device model sometimes collapses a
              // long list down to a handful of items. If it returned far
              // fewer than we fed in, don't trust the cleanup — fall back to
              // raw OCR below so the user never loses most of their list.
              // (A modest drop is fine: real lists do contain some noise.)
              const enoughSurvived = parsed.length >= Math.ceil(filtered.length * 0.6)
              if (parsed.length > 0 && enoughSurvived) {
                const items = parsed.map(p => {
                  const name = normalizeItemName(p.name)
                  return {
                    id: genId(),
                    name,
                    original: p.name,
                    // Trust the model's section unless it punted to "Other",
                    // where the deterministic keyword categorizer may still win.
                    category: p.section && p.section !== 'Other'
                      ? p.section
                      : categorizeItem(name),
                    quantity: null,
                    note: p.needsClarification ? 'Double-check — tap ✨ for options' : null,
                    flagged: Boolean(p.needsClarification),
                    checked: false,
                  }
                })
                return { ok: true, items: markDuplicates(items), blurWarning }
              }
              console.log(
                `[parseList] AppleLLM returned ${parsed.length}/${filtered.length} items — ` +
                'too few, using raw OCR'
              )
              // else fall through to raw-OCR path below
            } catch (e) {
              console.log('[parseList] AppleLLM OCR cleanup failed, using raw OCR:', e?.message)
            }
          }

          // Fallback: raw OCR text + canonical lookup + deterministic
          // categorize (AI unavailable or it errored). The canonical lookup
          // is the only normalization that runs here, so it matters most.
          // Low-confidence lines get flagged for review.
          const items = filtered.map(line => {
            const raw = (line.text || '').trim()
            const name = normalizeItemName(raw)
            const lowConfidence = typeof line.confidence === 'number' && line.confidence < 0.4
            return {
              id: genId(),
              name,
              original: raw,
              category: categorizeItem(name),
              quantity: null,
              note: lowConfidence ? 'Hard to read — please verify.' : null,
              flagged: lowConfidence,
              checked: false,
            }
          })
          if (items.length === 0) {
            throw new Error('No grocery items found. Try a clearer photo.')
          }
          return { ok: true, items: markDuplicates(items), blurWarning }
        }

        if (PROVIDER === 'anthropic') {
          setStatus('Reading list…')
          raw = await callAnthropic(buildParseListMessages(base64, 'image/webp'))
        } else {
          raw = await threePassOllama(base64, setStatus)
        }
      } else {
        setStatus('Building list…')
        const userMsg = { role: 'user', content: `Raw list:\n${text.trim()}` }

        // ── Native iOS: Apple Foundation Models is the canonical text path.
        // We do NOT fall through to Ollama on native — Ollama lives on the
        // dev mac and can't be reached from the phone, and the cloud key
        // isn't configured yet. So if AppleLLM fails on native, surface the
        // actual error rather than silently routing to a dead endpoint.
        if (canRecognizeTextOnDevice()) {
          const aiCheck = await checkAppleIntelligence()
          if (!aiCheck.ok) {
            try {
              const { Dialog } = await import('@capacitor/dialog')
              await Dialog.alert({
                title: 'On-device LLM',
                message: `Apple Intelligence not available — ${aiCheck.reason}`,
              })
            } catch {}
            throw new Error(`Apple Intelligence unavailable: ${aiCheck.reason}`)
          }
          try {
            // Returns [{ name, section, parents }] via guided generation.
            // `parents` lists dish names an ingredient belongs to (structured,
            // so direction can't reverse). We mirror the existing "nest"
            // pattern — the dish stays as a header item (empty parents) and
            // each ingredient gets a "for <Dish>" note.
            const parsed = await parseFreeFormText(text.trim())
            if (parsed.length === 0) {
              throw new Error('Apple Intelligence returned no items — try rephrasing')
            }
            const items = parsed.map(entry => {
              const name = normalizeItemName(entry.name)
              const note = entry.parents && entry.parents.length > 0
                ? `for ${entry.parents.join(', ')}`
                : (entry.needsClarification ? 'Double-check — tap ✨ for options' : null)
              return {
                id: genId(),
                name,
                original: entry.name,
                category: entry.section && entry.section !== 'Other'
                  ? entry.section
                  : categorizeItem(name),
                quantity: null,
                note,
                flagged: Boolean(entry.needsClarification),
                checked: false,
              }
            })
            return { ok: true, items: markDuplicates(items), blurWarning: null }
          } catch (e) {
            console.log('[parseList] AppleLLM text path failed:', e?.message)
            try {
              const { Dialog } = await import('@capacitor/dialog')
              await Dialog.alert({
                title: 'On-device LLM',
                message: `Apple Intelligence error: ${e?.message || e}`,
              })
            } catch {}
            throw e
          }
        }

        if (PROVIDER === 'anthropic') {
          // Flexible prompt: accept either a literal shopping list OR a free-form
          // description (meal plan, recipe rundown, "stuff for tacos all week").
          // The model figures out which it is and expands accordingly. Items it
          // can't pin down should come back flagged so the user can clarify.
          const flexibleInstructions = `The user input below may be one of:
  (a) a literal shopping list (item names, possibly with quantities), OR
  (b) a meal plan, recipe rundown, or list of dishes they want to cook
      (e.g. "Mon: tacos, Tue: spaghetti, breakfasts: smoothies").

If it's a list, parse and categorize each item directly.

If it's a meal plan or dishes, generate a complete grocery list of the
specific ingredients needed for those meals — common, recognizable
items, sensible default quantities for a household. Don't double-count
pantry staples that appear across meals.

When the user names a dish where the brand or specific variant is
unclear (e.g. "pasta sauce" without specifying jarred vs fresh), set
flagged: true with a brief note so the user can clarify.

User input:
${text.trim()}`
          raw = await callAnthropic([{ role: 'user', content: flexibleInstructions }])
        } else {
          // Text input on Ollama: use the flexible prompt that handles both
          // literal lists AND meal-plan / dish descriptions, then JS categorize.
          const normalizeRaw = await callOllama([
            { role: 'system', content: OLLAMA_FLEXIBLE_TEXT_PROMPT },
            userMsg,
          ])
          let normalized
          try {
            const cleaned = normalizeRaw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
            normalized = JSON.parse(cleaned)
          } catch {
            const retryRaw = await callOllama([
              { role: 'system', content: OLLAMA_FLEXIBLE_TEXT_PROMPT },
              userMsg,
              { role: 'assistant', content: normalizeRaw },
              { role: 'user', content: 'Return valid JSON only. No markdown, no explanation.' },
            ])
            const cleaned = retryRaw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
            normalized = JSON.parse(cleaned)
          }
          const items = (normalized.items || [])
            .filter(item => item && typeof item.name === 'string' && item.name.trim())
            .map(item => ({
              ...item,
              name: item.name.trim(),
              category: categorizeItem(item.name),
            }))
          raw = JSON.stringify({ items })
        }
      }

      let parsed = parseClaudeResponse(raw)

      if (!parsed.ok) {
        // Anthropic retry only (Ollama path already handles its own retry in pass 2)
        if (PROVIDER === 'anthropic') {
          setStatus('Retrying…')
          const retryMsgs = [
            { role: 'user', content: `Parse this grocery list:\n${text?.trim() || ''}` },
            { role: 'assistant', content: raw },
            { role: 'user', content: 'Return valid JSON only. No prose, no markdown.' },
          ]
          raw = await callAnthropic(retryMsgs)
          parsed = parseClaudeResponse(raw)
        }
      }

      if (!parsed.ok) throw new Error(parsed.error || 'Model did not return valid JSON.')
      if (parsed.items.length === 0) throw new Error('No grocery items found. Try a clearer photo or paste the list as text.')

      return { ...parsed, blurWarning }
    } catch (e) {
      setError(e?.message || String(e))
      throw e
    } finally {
      setLoading(false)
      setStatus('')
    }
  }, [callAnthropic, callOllama, threePassOllama])

  return {
    loading,
    status,
    error,
    parseList,
    suggestExpansions,
    pingOllama,
    ollamaUrl: OLLAMA_BASE,
    provider: PROVIDER,
    ollamaModel: OLLAMA_MODEL,
    hasApiKey: USE_WORKER || Boolean(ANTHROPIC_KEY),
    clearError: () => setError(null),
  }
}
