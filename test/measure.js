#!/usr/bin/env node
// npm test's browser half: open an HTML deck md2s built, show each slide holding a p.caption whose text starts
// with one of the given markers, and print (JSON) the caption's and its table's boxes and areas
//
//   node test/measure.js deck.html marker…
'use strict';
const path = require('path');

const ROOT = path.join(__dirname, '..');
const cli = path.dirname(require.resolve('@marp-team/marp-cli/package.json', { paths: [ROOT] }));
const puppeteer = require(require.resolve('puppeteer-core', { paths: [cli] }));

(async () => {
  const [file, ...markers] = process.argv.slice(2);
  const browser = await puppeteer.launch({ executablePath: require('../src/setup.js').chromium(), args: process.env.CHROME_NO_SANDBOX ? ['--no-sandbox'] : [] });
  const out = {};
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 540 });
    await page.goto(`file://${path.resolve(file)}`, { waitUntil: 'load' });
    for (const marker of markers) {
      const k = await page.evaluate((m) => [...document.querySelectorAll('section')].findIndex((s) => [...s.querySelectorAll('p.caption')].some((c) => c.textContent.startsWith(m))), marker);
      if (k < 0) { out[marker] = null; continue; }
      await page.evaluate((k) => { location.hash = `#${k + 1}`; }, k);
      await new Promise((r) => setTimeout(r, 300));
      out[marker] = await page.evaluate((m, k) => {
        const s = document.querySelectorAll('section')[k];
        const c = [...s.querySelectorAll('p.caption')].find((e) => e.textContent.startsWith(m));
        const t = c.closest('.captioned').querySelector('table');
        const box = c.closest('.area') || s.querySelector('.body');
        const w = (e) => e.getBoundingClientRect().width;
        return {
          caption: w(c), lines: Math.round((c.getBoundingClientRect().height - 8) / parseFloat(getComputedStyle(c).lineHeight)),
          table: w(t), box: w(box) - parseFloat(getComputedStyle(box).paddingLeft) - parseFloat(getComputedStyle(box).paddingRight),
          captionArea: c.closest('.area') ? c.closest('.area').className : 'body', tableArea: t.closest('.area') ? t.closest('.area').className : 'body',
        };
      }, marker, k);
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(out));
})().catch((e) => { console.log(JSON.stringify({ error: String(e.message).split('\n')[0] })); });
