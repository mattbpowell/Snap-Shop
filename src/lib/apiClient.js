/**
 * Snap & Shop — Anthropic API client
 *
 * Routing strategy (checked in order):
 *
 *   1. VITE_API_URL set → route through the Cloudflare Workers proxy.
 *      The API key never touches the browser bundle.
 *
 *   2. VITE_ANTHROPIC_API_KEY set → call the Anthropic SDK directly from the
 *      browser (dev / local use only — key visible in browser env).
 *
 *   3. Neither set → clear configuration error thrown at call time.
 *
 * Usage:
 *   import { callClaude, ANTHROPIC_MODEL } from '../lib/apiClient.js'
 *
 *   const text = await callClaude({
 *     system: 'You are a ....',
 *     messages: [{ role: 'user', content: '...' }],
 *     maxTokens: 4096,
 *   })
 */

import Anthropic from '@anthropic-ai/sdk'

export const ANTHROPIC_MODEL = 'claude-sonnet-4-5'

// ── Env config ───────────────────────────────────────────────────────────────

const WORKER_URL    = (import.meta.env.VITE_API_URL     || '').replace(/\/$/, '')
const WORKER_SECRET =  import.meta.env.VITE_API_SECRET  || ''
const ANTHROPIC_KEY =  import.meta.env.VITE_ANTHROPIC_API_KEY || ''

export const USE_WORKER = Boolean(WORKER_URL)

// ── Dev-only Anthropic client singleton ──────────────────────────────────────

let _anthropic = null

function getAnthropicClient() {
  if (!ANTHROPIC_KEY) {
    throw new Error(
      'Snap & Shop: no API configured. ' +
      'Set VITE_API_URL (Cloudflare Worker) or VITE_ANTHROPIC_API_KEY (dev) in your .env file.'
    )
  }
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY, dangerouslyAllowBrowser: true })
  }
  return _anthropic
}

// ── Core call ─────────────────────────────────────────────────────────────────

/**
 * Call the Claude Messages API and return the assistant's text content.
 *
 * @param {object}  opts
 * @param {string}  opts.system      System prompt
 * @param {Array}   opts.messages    Anthropic-format messages array
 * @param {number}  [opts.maxTokens=4096]
 * @returns {Promise<string>}
 */
export async function callClaude({ system, messages, maxTokens = 4096 }) {
  const payload = {
    model:      ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system,
    messages,
  }

  // ── Production path: Cloudflare Worker proxy ────────────────────────────
  if (WORKER_URL) {
    const headers = { 'Content-Type': 'application/json' }
    if (WORKER_SECRET) headers['X-API-Key'] = WORKER_SECRET

    const resp = await fetch(`${WORKER_URL}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      if (resp.status === 401) {
        throw new Error('API proxy: unauthorized. Check that VITE_API_SECRET matches the worker\'s API_SECRET.')
      }
      if (resp.status === 429) {
        throw new Error('Rate limit reached. Please wait a moment and try again.')
      }
      throw new Error(`API proxy error ${resp.status}: ${body || resp.statusText}`)
    }

    const data = await resp.json()
    // Worker passes through the full Anthropic response shape unchanged
    return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
  }

  // ── Dev fallback: Anthropic SDK directly (API key in browser env) ────────
  const client = getAnthropicClient()
  const response = await client.messages.create(payload)
  return response.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
}
