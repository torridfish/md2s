#!/usr/bin/env node
// npm test: build examples/gallery.md as HTML and PDF and check that every component rendered. It needs
// what the gallery uses: a browser and TeX (md2s setup). Reading the pages is still worth doing after a
// theme change; this catches what breaks without anyone looking.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GALLERY = path.join(ROOT, 'examples', 'gallery.md');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'md2s-test-'));
const problems = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) problems.push(what); };

function build(format) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), GALLERY, `--${format}`, '-o', out], { encoding: 'utf8' });
  check(r.status === 0, `gallery builds as ${format.toUpperCase()}`);
  // md2s's own warnings (unknown citation, missing package …) start with "md2s:"
  const warnings = `${r.stdout}\n${r.stderr}`.split('\n').filter((l) => /^md2s:/.test(l));
  check(!warnings.length, `no md2s warnings building ${format.toUpperCase()}${warnings.length ? `: ${warnings.join(' | ')}` : ''}`);
  if (r.status !== 0) process.stderr.write(r.stderr);
  const file = path.join(out, `gallery.${format}`);
  return fs.existsSync(file) ? fs.readFileSync(file, format === 'pdf' ? 'latin1' : 'utf8') : '';
}

const html = build('html');
const slides = (html.match(/<section\b/g) || []).length;
check(slides > 20, `HTML has the gallery's slides (${slides})`);

// what the engine writes in place of a component it could not render
const failures = [
  [/LaTeX failed \(\w+\)[^<]*/, 'every LaTeX fence (algo / latex {.render})'],
  [/dot failed[^<]*/, 'every ```dot diagram'],
  [/<span class="alert">\(\?[^<]*<\/span>/, 'every equation reference'],
  [/<span class="alert">\?[^<]*<\/span>/, 'every citation key'],
  [/<span class="alert">[^<]*: [^<]*<\/span>/, 'every figure, PDF page and video'],
];
for (const [re, what] of failures) {
  const m = html.match(re);
  check(!m, `${what} rendered${m ? `: ${m[0].replace(/<[^>]+>/g, '').slice(0, 120)}` : ''}`);
}

// the HTML deck travels alone: every picture, font and stylesheet inside it (links and players aside)
const outside = [...html.matchAll(/<(?:img|video|source)\b[^>]*?\s(?:src|poster)="(?!data:|https?:)([^"]+)"|url\(\s*['"]?(?!data:|#)([^'")]+)/g)].map((m) => m[1] || m[2]);
check(!outside.length, `HTML embeds its pictures and fonts${outside.length ? `: ${outside.slice(0, 3).join(', ')}` : ''}`);

// fixed bugs that the gallery shows
check(/<td[^>]*>56\.9<\/td>/.test(html), 'a ^^ row under a two-row header with || keeps its last cell (56.9)');
check(/class="area area-c\b/.test(html), 'a layout area carries its area-<name> class');
check(/<li class="faint"/.test(html), '- item {.faint} puts .faint on the list item');
check(/grid-template: "eq eq" auto "p z" auto "l l" minmax\(0, 1fr\)/.test(html), 'unsized rows of a custom layout fit their content');

const pdf = build('pdf');
// Marp's PDF keeps its page objects in compressed object streams: inflate every stream, then count them
const streams = [...pdf.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map((m) => {
  try { return zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { return ''; }
});
const pages = (`${pdf}\n${streams.join('\n')}`.match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
check(pages === slides, `PDF has one page per slide (${pages} pages, ${slides} slides)`);

fs.rmSync(out, { recursive: true, force: true });
if (problems.length) {
  console.log(`\n${problems.length} check(s) failed. md2s --check shows which tools are missing; md2s setup installs them.`);
  process.exit(1);
}
console.log('\nall checks passed');
