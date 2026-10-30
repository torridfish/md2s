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

// the layout check (the gallery builds above must have drawn no warning at all): test/overflow.md, one case
// per slide, gives exactly these warnings, and none for the slides that fit: a full one, a long token (it
// breaks), a too-wide table (its cells wrap) and a two-line title
const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(__dirname, 'overflow.md'), '--html', '-o', out], { encoding: 'utf8' });
const got = r.stderr.split('\n').filter((l) => /^md2s: slide/.test(l));
const expect = [
  [2, /text runs \d+px below the body, off the slide/],
  [5, /a formula runs \d+px past the right margin, the slide cuts it off/],
  [7, /the title takes 3 lines/],
];
for (const [slide, re] of expect) {
  check(got.some((l) => l.startsWith(`md2s: slide ${slide} `) && re.test(l)), `layout check warns on slide ${slide}: ${re.source.replace(/\\d\+/g, 'N').replace(/\\/g, '')}`);
}
check(got.length === expect.length, `layout check warns nowhere else (${got.length} warnings, ${expect.length} expected)`);

// the deck structures a converted deck runs into (test/cases.md, test/no-divider.md)
const deck = (name) => {
  const b = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(__dirname, name), '--html', '-o', out], { encoding: 'utf8' });
  return { html: fs.existsSync(path.join(out, name.replace(/\.md$/, '.html'))) ? fs.readFileSync(path.join(out, name.replace(/\.md$/, '.html')), 'utf8') : '', err: b.stderr };
};
const cases = deck('cases.md');
const sections = (cases.html.match(/<section\b/g) || []).length;
check(sections === 13, `a --- at the end, or two in a row, opens no empty slide (${sections} slides, 13 expected)`);
check(!/\(\d\/\d\)/.test(cases.html), 'a subsection with no second part is not numbered (1/2)');
const tables = (cases.html.match(/<table\b/g) || []).length;
check(tables === 12 && !/<td[^>]*>-{3,}<\/td>/.test(cases.html), `two tables a blank line apart stay two (${tables} tables, 12 expected), no --- cells`);
check(/<th[^>]*>c<\/th>/.test(cases.html) && /<td[^>]*text-align:right[^>]*>4<\/td>/.test(cases.html), "the second table keeps its header and its columns' alignment");
check(/<table[^>]*>\s*<tbody>\s*<tr>\s*<td[^>]*>first-row-stays/.test(cases.html), 'an empty header row is dropped, the first row stays a row');
check(/<th[^>]*>Role<\/th>/.test(cases.html) && /<td[^>]*>planner<\/td>/.test(cases.html), 'a Role column of data is kept');
check(!/>role</.test(cases.html) && /<tr class="ref">/.test(cases.html) && /<tr>\s*<td[^>]*>8<\/td>\s*<td[^>]*>grouped-x-row/.test(cases.html),
  'a role column under a grouped header (x, ^^ placeholders, an x row) is not shown');
check(cases.html.includes('hello {Task query}') && cases.html.includes('braces {Task response}'), 'braces that are not attributes stay text');
// the table holding a marker, as one line
const table = (marker) => ((cases.html.match(/<table[\s\S]*?<\/table>/g) || []).find((t) => t.includes(marker)) || '').replace(/\n\s*/g, '');
check(/<td class="best"><strong>best-on-bold<\/strong>/.test(table('best-on-bold')) && /<td class="second"><em>second-on-italic<\/em>/.test(table('best-on-bold')),
  '{.best} / {.second} on a bold or italic cell mark the cell');
const sep = table('under-the-rule');
check(/<td rowspan="2">merged-down<\/td>/.test(sep) && /<tr class="sep"><td>under-the-rule<\/td>/.test(sep) && (sep.match(/<tr\b/g) || []).length === 4,
  'a row of only {.sep} goes, and rules off the row under it; a ^^ under it joins the cell above');
check(/<table class="booktabs">/.test(table('booktabs-row')) && (table('booktabs-row').match(/<tr\b/g) || []).length === 3,
  'a | {.booktabs} | row under the table styles it and leaves no empty row');
check(/<td class="c">1<\/td>/.test(table('settings-colons')) && !/text-align/.test(table('settings-colons')),
  "settings sets its tables' alignment over the separator row's colons, and centres short columns");
check(/<td rowspan="2" class="c">A<\/td><td class="c">1<\/td><td>68\.9<\/td>/.test(table('settings-caret')) && /<tr><td class="c">2<\/td><td>61\.2<\/td>/.test(table('settings-caret')),
  'settings centres short columns by column, past a ^^');
check(/more cells than its header \(4 columns, the header 2\)[^\n]*ragged-row/.test(cases.err), 'a row wider than the header is warned about');
check(/<caption[^>]*>caption-above-the-table<\/caption>/.test(table('caption-above-the-table')), 'a [Caption] on the line above a table is its caption');

const plain = deck('no-divider.md');
check(/not front matter/.test(plain.err) && /<h3[^>]*>A deck whose first line is ---/.test(plain.html), 'a leading --- that opens no front matter keeps the first slide, and says so');
check(/a second ##/.test(plain.err), 'without headingDivider, a slide with a second ## draws a warning');
check(/<div class="body[^"]*">[\s\S]*<h2[^>]*>Second<\/h2>/.test(plain.html) && !/over the header/.test(plain.err), 'a ## further down a slide heads the body, not the title slot');

fs.rmSync(out, { recursive: true, force: true });
if (problems.length) {
  console.log(`\n${problems.length} check(s) failed. md2s --check shows which tools are missing; md2s setup installs them.`);
  process.exit(1);
}
console.log('\nall checks passed');
