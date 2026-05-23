/**
 * Snap & Shop — Cloudflare Workers Proxy
 *
 * All calls to the Anthropic API are routed through this worker.
 * The API key never touches the browser.
 *
 * Routes:
 *   POST /messages  — General Claude Messages API proxy
 *   POST /ocr       — Alias for /messages (named for clarity in logs)
 *   OPTIONS *       — CORS preflight
 *
 * Environment secrets (set via `wrangler secret put`, never in wrangler.toml):
 *   ANTHROPIC_KEY   — Your Anthropic API key
 *   API_SECRET      — Shared secret; clients must send as X-API-Key header
 *   CF_ACCOUNT      — Cloudflare account ID (optional; enables AI Gateway routing)
 *
 * Deploy:
 *   cd workers && npm install && wrangler deploy
 */

interface Env {
  ANTHROPIC_KEY: string
  API_SECRET: string
  CF_ACCOUNT: string
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Access-Control-Max-Age': '86400',
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // ── CORS preflight ──────────────────────────────────────────────────────
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    // Skip auth check if no secret is configured (useful for first-run testing).
    const incomingKey = req.headers.get('X-API-Key')
    if (env.API_SECRET && incomingKey !== env.API_SECRET) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const url = new URL(req.url)

    // ── Health check ────────────────────────────────────────────────────────
    if (req.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true })
    }

    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    // ── Anthropic proxy ─────────────────────────────────────────────────────
    // Both /ocr and /messages proxy to the Anthropic Messages API.
    // /ocr is a semantic alias — identical behaviour, used for named routing in logs.
    if (url.pathname === '/ocr' || url.pathname === '/messages') {
      let body: unknown
      try {
        body = await req.json()
      } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400)
      }

      if (!env.ANTHROPIC_KEY) {
        return jsonResponse({ error: 'Worker is not configured: missing ANTHROPIC_KEY secret.' }, 500)
      }

      // Route through Cloudflare AI Gateway when CF_ACCOUNT is set.
      // Benefits: usage analytics, prompt caching, rate limiting, spend caps.
      // Without CF_ACCOUNT, calls go directly to api.anthropic.com.
      const anthropicEndpoint = env.CF_ACCOUNT
        ? `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT}/snap-shop/anthropic/v1/messages`
        : 'https://api.anthropic.com/v1/messages'

      let upstream: Response
      try {
        upstream = await fetch(anthropicEndpoint, {
          method: 'POST',
          headers: {
            'x-api-key': env.ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        })
      } catch (e) {
        return jsonResponse({ error: `Upstream fetch failed: ${String(e)}` }, 502)
      }

      // Pass the upstream response through, preserving status and body.
      // The Anthropic response shape is forwarded unchanged so the frontend
      // apiClient can parse it with the same logic as direct SDK calls.
      const responseText = await upstream.text()
      return new Response(responseText, {
        status: upstream.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
        },
      })
    }

    return jsonResponse({ error: 'Not found' }, 404)
  },
}
