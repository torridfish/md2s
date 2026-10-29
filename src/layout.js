// md2s's layout check (run by bin/md2s.js after a build): Chrome cuts whatever a slide paints past its edges,
// silently, and draws whatever runs past the body box over the footnotes. So the deck is laid out once more
// in the same browser and every slide is measured: what its body paints (each line of text, each picture,
// table, code box and diagram) against the body box and the slide, and how many lines its title and subtitle
// take (two fit; a third pushes the body down). Each problem is a warning naming the slide; the build stands.
//
//   node src/layout.js deck.md      (MD2S_DECK_DIR, MD2S_FORMAT and MD2S_THANKS as for Marp)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const warn = (msg) => process.stderr.write(`md2s: ${msg}\n`);
const SLACK = 2;   // px on the 960 x 540 canvas: rounding and glyph overhang (an italic, an equation number), not overflow

// everything below runs in the page: one entry per problem, { slide, label, what }
function measure(slack) {
  const issues = [];
  // what reached farthest, for the message (inside the body: Marp wraps the whole slide in an <svg> too)
  const name = (el) => (el.closest('h1, h2, h3') ? 'a heading' : el.closest('.katex') ? 'a formula' : el.closest('table') ? 'a table' : el.closest('.code, pre') ? 'a code block'
    : el.closest('.diagram') ? 'a diagram' : el.closest('img, video, iframe, .figures') ? 'a picture' : 'text');
  document.querySelectorAll('section').forEach((s, k) => {
    const S = s.getBoundingClientRect();
    const scale = S.width / 960;   // Marp scales the slide to the page; measure on its own 960 x 540 canvas
    const box = (r) => ({ top: (r.top - S.top) / scale, bottom: (r.bottom - S.top) / scale, left: (r.left - S.left) / scale, right: (r.right - S.left) / scale });
    // named by its ### (its own message); a ## is a category many slides share
    const heading = s.querySelector(':scope > h3') || s.querySelector(':scope > h2') || s.querySelector(':scope > h1');
    const full = heading ? heading.textContent.trim().replace(/\s+/g, ' ') : '';
    const label = full.length > 50 ? `${full.slice(0, 48)}…` : full;
    const add = (what) => issues.push({ slide: k + 1, label, what });

    for (const h of s.querySelectorAll(':scope > h2, :scope > h3')) {
      const r = document.createRange();
      r.selectNodeContents(h);
      const tops = new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(box(q).top)));
      if (tops.size > 2) add(`the ${h.tagName === 'H2' ? 'title' : 'subtitle'} takes ${tops.size} lines (two fit)`);
    }

    const body = s.querySelector(':scope > .body');
    if (!body) return;
    const B = box(body.getBoundingClientRect());
    // the farthest each side reaches, and what reached it
    const far = { bottom: [B.bottom, null], right: [B.right, null], left: [B.left, null], top: [B.top, null] };
    const reach = (r, el) => {
      if (r.right - r.left < 0.5 && r.bottom - r.top < 0.5) return;
      if (r.bottom > far.bottom[0]) far.bottom = [r.bottom, el];
      if (r.right > far.right[0]) far.right = [r.right, el];
      if (r.left < far.left[0]) far.left = [r.left, el];
      if (r.top < far.top[0]) far.top = [r.top, el];
    };
    const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) {
        if (!n.textContent.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const q of r.getClientRects()) reach(box(q), n.parentElement);
      } else if (n.matches('img, svg, video, iframe, canvas, table, .code-box, hr')) {
        if (getComputedStyle(n).visibility !== 'hidden') reach(box(n.getBoundingClientRect()), n);
      }
    }
    const px = (v) => `${Math.round(v)}px`;
    if (far.bottom[0] > B.bottom + slack) {
      const lost = far.bottom[0] > 540 + slack;
      add(`${name(far.bottom[1])} runs ${px(far.bottom[0] - B.bottom)} below the body, ${lost ? 'off the slide: the end is cut off' : 'into the footnote band'}`);
    }
    if (far.top[0] < B.top - slack) add(`${name(far.top[1])} rises ${px(B.top - far.top[0])} above the body, over the header`);
    if (far.right[0] > B.right + slack) add(`${name(far.right[1])} runs ${px(far.right[0] - B.right)} past the right margin, ${far.right[0] > 960 + slack ? 'the slide cuts it off' : 'over the margin'}`);
    if (far.left[0] < B.left - slack) add(`${name(far.left[1])} runs ${px(B.left - far.left[0])} past the left margin, ${far.left[0] < -slack ? 'the slide cuts it off' : 'over the margin'}`);
  });
  return issues;
}

(async () => {
  const deck = path.resolve(process.argv[2]);
  const exe = require('./setup.js').chromium();
  if (!exe) { warn('layout check skipped: it needs Chrome, Chromium or Edge (md2s setup)'); return; }
  process.env.MD2S_QUIET = '1';   // the engine's own warnings came with the build
  const config = require('./config.js');
  // Marp's own marp-core and puppeteer-core, found from marp-cli wherever npm put them
  const cli = path.dirname(require.resolve('@marp-team/marp-cli/package.json'));
  const { Marp } = require(require.resolve('@marp-team/marp-core', { paths: [cli] }));
  const puppeteer = require(require.resolve('puppeteer-core', { paths: [cli] }));

  // the deck as Marp's PDF sees it: md2s's engine, its theme and its options, figures resolved from the deck
  const marp = config.engine({ marp: new Marp({ html: config.html, ...config.options }) });
  const { html, css } = marp.render(fs.readFileSync(deck, 'utf8'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2s-layout-'));
  const file = path.join(dir, 'deck.html');
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><base href="${pathToFileURL(path.dirname(deck))}/"><style>${css}</style></head><body>${html}</body></html>`);

  const args = process.env.CHROME_NO_SANDBOX ? ['--no-sandbox'] : [];
  const browser = await puppeteer.launch({ executablePath: exe, args: [...args, '--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 540 });
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    for (const i of await page.evaluate(measure, SLACK)) warn(`slide ${i.slide}${i.label ? ` (${i.label})` : ''}: ${i.what}`);
  } finally {
    await browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { warn(`layout check failed: ${String(e.message).split('\n')[0]}`); });
