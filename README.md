# Snap & Shop

Turn any photo, screenshot, or typed list into a categorized, tappable grocery checklist. Powered by the Claude API.

## Setup

```bash
npm install
cp .env.example .env     # then edit .env and paste your Claude API key
npm run dev
```

The key goes in `.env` as `VITE_ANTHROPIC_API_KEY=sk-ant-...`. Calls go directly from the browser (MVP) — for production, proxy through your own server so the key isn't shipped to clients.

## Build

```bash
npm run build
npm run preview
```

The PWA service worker only registers in production (`npm run build` / `npm run preview`), not in `npm run dev`.

## Install as PWA

After `npm run build && npm run preview`, open the URL on mobile Safari/Chrome and use "Add to Home Screen".

## Structure

- `src/components/` — UploadScreen, ReviewScreen, StoreMode, CategorySection, ItemRow
- `src/hooks/` — `useClaude` (vision + parse), `useList` (localStorage-backed state)
- `src/utils/` — category config, JSON parsing with retry-friendly validation
- `public/` — PWA manifest, service worker, SVG icons

## Model

Uses `claude-sonnet-4-5`. Change in `src/hooks/useClaude.js` if needed.
