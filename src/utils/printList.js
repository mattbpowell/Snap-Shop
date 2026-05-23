import { CATEGORIES, groupByCategory } from './categories.js'

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]))
}

/**
 * Open a clean, printable view of the list in a new window and trigger
 * the browser print dialog. The print document is fully self-contained —
 * no app CSS, no app JS, so it works regardless of where in the app the
 * user invokes it.
 *
 * @param {{ items: Array<{name, quantity, note, category, checked, flagged}> }} list
 * @param {{ includeChecked?: boolean, title?: string }} [opts]
 */
export function printList(list, opts = {}) {
  if (!list?.items?.length) return false

  const includeChecked = opts.includeChecked !== false
  const title = opts.title || 'Snap & Shop'

  const present = new Set(list.items.map(i => i.category))
  const order = [
    ...CATEGORIES.filter(c => present.has(c)),
    ...Array.from(present).filter(c => !CATEGORIES.includes(c))
  ]
  const groups = groupByCategory(list.items, order)
    .map(g => ({
      ...g,
      items: includeChecked ? g.items : g.items.filter(i => !i.checked)
    }))
    .filter(g => g.items.length > 0)

  if (groups.length === 0) return false

  const date = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })

  const visibleItemCount = groups.reduce((n, g) => n + g.items.length, 0)

  const sectionsHtml = groups.map(g => `
    <section>
      <h2>
        <span>${escapeHtml(g.name)}</span>
        <span class="count">${g.items.length}</span>
      </h2>
      <ul>
        ${g.items.map(item => `
          <li class="${item.checked ? 'done' : ''}">
            <span class="box" aria-hidden="true"></span>
            <span class="text">
              <span class="name">${escapeHtml(item.name)}</span>
              ${item.quantity ? `<span class="qty">${escapeHtml(item.quantity)}</span>` : ''}
              ${item.note ? `<span class="note">${escapeHtml(item.note)}</span>` : ''}
            </span>
          </li>
        `).join('')}
      </ul>
    </section>
  `).join('')

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} · ${escapeHtml(date)}</title>
<style>
  @page { margin: 0.5in; }
  * { box-sizing: border-box; }
  html, body { background: #fff; color: #111; }
  body {
    margin: 0;
    padding: 24px;
    font: 11pt/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  header.doc-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16pt;
    padding-bottom: 8pt;
    margin-bottom: 14pt;
    border-bottom: 1.25pt solid #111;
  }
  header.doc-head h1 {
    margin: 0;
    font-size: 18pt;
    letter-spacing: -0.01em;
    font-weight: 700;
  }
  header.doc-head .meta {
    font-size: 9pt;
    color: #555;
    text-align: right;
  }
  header.doc-head .meta .total {
    display: block;
    font-weight: 600;
    color: #111;
    font-size: 10pt;
  }
  main {
    column-count: 2;
    column-gap: 24pt;
    column-rule: 0.5pt dotted #ccc;
  }
  section {
    break-inside: avoid;
    page-break-inside: avoid;
    margin: 0 0 14pt 0;
  }
  section h2 {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 0 0 5pt 0;
    padding-bottom: 3pt;
    border-bottom: 0.5pt solid #999;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #222;
  }
  section h2 .count {
    font-weight: 500;
    color: #888;
    font-size: 8.5pt;
  }
  ul { list-style: none; margin: 0; padding: 0; }
  li {
    display: flex;
    align-items: flex-start;
    gap: 6pt;
    padding: 2.5pt 0;
    font-size: 11pt;
    line-height: 1.3;
  }
  .box {
    flex: none;
    width: 11pt;
    height: 11pt;
    border: 1pt solid #111;
    border-radius: 1.5pt;
    margin-top: 1.5pt;
  }
  li.done .box { background: #111; }
  li.done .name, li.done .qty { text-decoration: line-through; color: #888; }
  .text { flex: 1; min-width: 0; }
  .name { color: #111; }
  .qty {
    margin-left: 4pt;
    color: #555;
    font-size: 9.5pt;
    font-variant-numeric: tabular-nums;
  }
  .note {
    display: block;
    color: #666;
    font-size: 9pt;
    font-style: italic;
    margin-top: 1pt;
  }
  footer.doc-foot {
    margin-top: 20pt;
    padding-top: 8pt;
    border-top: 0.5pt solid #ccc;
    text-align: center;
    font-size: 8pt;
    color: #999;
    letter-spacing: 0.04em;
  }
  /* Single column on narrow paper / receipt-style */
  @media (max-width: 4.25in) {
    main { column-count: 1; }
  }
</style>
</head>
<body>
  <header class="doc-head">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      <span class="total">${visibleItemCount} item${visibleItemCount === 1 ? '' : 's'}</span>
      ${escapeHtml(date)}
    </div>
  </header>
  <main>${sectionsHtml}</main>
  <footer class="doc-foot">snap & shop</footer>
  <script>
    window.addEventListener('load', () => {
      // Small delay so layout settles before the print dialog snapshot.
      setTimeout(() => { window.focus(); window.print(); }, 120);
    });
    window.addEventListener('afterprint', () => { setTimeout(() => window.close(), 300); });
  </script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=720,height=900,noopener')
  if (!win) {
    // Popup blocked — fall back to data URL in a new tab.
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return true
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  return true
}
