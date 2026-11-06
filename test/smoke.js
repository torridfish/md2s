#!/usr/bin/env node
// npm test: build examples/gallery.md as HTML and PDF and check that every component rendered, then the
// include deck, --strict and --handout. It needs what the gallery uses: a browser and TeX (md2s setup).
// Reading the pages is still worth doing after a theme change; this catches what breaks without anyone looking.
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
// Marp and pdf-lib keep their page objects in compressed object streams: inflate every stream into one text
const pdfText = (raw) => `${raw}\n${[...raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map((m) => {
  try { return zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { return ''; }
}).join('\n')}`;
const pageCount = (raw) => (pdfText(raw).match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
// What a handout sheet holds, read back with pdf-lib (a child process, as this test runs synchronously): the
// sheet's size, and how many slides it places as form XObjects — a blank A4 of the same page count has none
const handoutShape = (file) => {
  const script = `
    const fs = require('fs');
    const crypto = require('crypto');
    const { PDFDocument, PDFName } = require('pdf-lib');
    PDFDocument.load(fs.readFileSync(process.argv[1])).then((doc) => console.log(JSON.stringify({
      title: doc.getTitle() || '',
      pages: doc.getPages().map((p) => {
        const res = p.node.Resources();
        const xo = res && res.lookup(PDFName.of('XObject'));
        const keys = xo ? xo.keys() : [];
        return {
          size: [p.getWidth(), p.getHeight()].map((n) => +n.toFixed(2)),
          slides: keys.length,
          // what was drawn, not just how many: a sheet that drew the same slide twice would hash alike
          hashes: keys.map((k) => crypto.createHash('sha1').update(Buffer.from(xo.lookup(k).contents)).digest('hex').slice(0, 12)),
        };
      }),
    })));`;
  const r = spawnSync(process.execPath, ['-e', script, file], { cwd: ROOT, encoding: 'utf8' });
  try { return JSON.parse(r.stdout); } catch { return { title: '', pages: [], err: r.stderr.trim() }; }
};
// The text of the per-line spans carrying a tint class ('' for the plain ones): a tint has to sit on the lines
// it names, not merely on the same number of lines somewhere
const tintedLines = (html, cls) => [...html.matchAll(new RegExp(`<span class="line${cls}">[\\s\\S]*?(?=<span class="line|<\\/code>)`, 'g'))]
  .map((m) => m[0].replace(/<[^>]+>/g, '').trim());

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

build('pdf');
const pages = pageCount(fs.readFileSync(path.join(out, 'gallery.pdf'), 'latin1'));
check(pages === slides, `PDF has one page per slide (${pages} pages, ${slides} slides)`);

// --handout tiles that PDF onto A4 portrait, a sheet per two slides (4: four a page), the vectors kept: every
// sheet places its slides as form XObjects, and a blank A4 of the same page count would place none
const hoRun = spawnSync(process.execPath, [path.join(ROOT, 'src', 'handout.js'), path.join(out, 'gallery.pdf'), path.join(out, 'gallery-handout.pdf'), '2'], { encoding: 'utf8' });
const hoShape = handoutShape(path.join(out, 'gallery-handout.pdf'));
const hoPages = hoShape.pages || [];
const hoDrawn = hoPages.reduce((n, p) => n + p.slides, 0);
check(hoRun.status === 0 && hoPages.length === Math.ceil(slides / 2), `--handout tiles two slides on each A4 sheet (${hoPages.length} sheets, ${slides} slides)`);
check(hoPages.length && hoPages.every((p) => p.size[0] === 595.28 && p.size[1] === 841.89),
  `every handout sheet is A4 portrait (${[...new Set(hoPages.map((p) => p.size.join(' x ')))].join(', ')})`);
check(hoDrawn === slides && hoPages.every((p) => p.slides > 0 && p.slides <= 2),
  `each sheet draws its slides, each one once (${hoDrawn} slides on ${hoPages.length} sheets)`);
const hoHashes = hoPages.flatMap((p) => p.hashes);
check(hoHashes.length === slides && new Set(hoHashes).size === slides,
  `the slide drawn in each cell is its own, not one slide tiled (${new Set(hoHashes).size} distinct of ${hoHashes.length})`);
check(hoShape.title === 'A Gallery of md2s', `the handout keeps the deck's Title (${JSON.stringify(hoShape.title)})`);
// through the CLI the same: --handout builds the deck's PDF (asked for or not) and its handout after it
fs.writeFileSync(path.join(out, 'mini.md'), '---\nmarp: true\n---\n\n# Mini\n\n## A\n### One slide\n\nbody text\n');
const miniRun = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(out, 'mini.md'), '--handout', '-o', out], { encoding: 'utf8' });
check(miniRun.status === 0 && fs.existsSync(path.join(out, 'mini.pdf')) && fs.existsSync(path.join(out, 'mini-handout.pdf')),
  `--handout builds the PDF and its handout${miniRun.status ? `: ${miniRun.stderr.trim().split('\n')[0]}` : ''}`);
// --handout 4 puts four slides on a sheet; and --handout is a flag, so it finds the deck when it comes first:
// on --html it adds the PDF the handout needs, and writes all three
const ho4 = spawnSync(process.execPath, [path.join(ROOT, 'src', 'handout.js'), path.join(out, 'gallery.pdf'), path.join(out, 'gallery-4up.pdf'), '4'], { encoding: 'utf8' });
const ho4Shape = handoutShape(path.join(out, 'gallery-4up.pdf'));
const ho4Pages = ho4Shape.pages || [];
const ho4Drawn = ho4Pages.reduce((n, p) => n + p.slides, 0);
check(ho4.status === 0 && ho4Pages.length === Math.ceil(slides / 4), `--handout 4 tiles four slides on each A4 sheet (${ho4Pages.length} sheets, ${slides} slides)`);
check(ho4Drawn === slides && ho4Pages.every((p) => p.slides > 0 && p.slides <= 4), `4-up draws the same slides, four to a sheet (${ho4Drawn} slides)`);
fs.writeFileSync(path.join(out, 'mini4.md'), '---\nmarp: true\n---\n\n# Mini\n\n## A\n### One slide\n\nbody text\n');
const mini4 = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), '--handout', '4', path.join(out, 'mini4.md'), '--html', '-o', out], { encoding: 'utf8' });
check(mini4.status === 0 && ['.html', '.pdf', '-handout.pdf'].every((ext) => fs.existsSync(path.join(out, `mini4${ext}`))),
  `--handout before the deck's name still finds it, and an --html deck still gets its PDF and handout${mini4.status ? `: ${mini4.stderr.trim().split('\n')[0]}` : ''}`);
// a count that is neither 2 nor 4, and a handout under --watch, are refused rather than tiled wrong or rebuilt forever
const badCount = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(out, 'mini.md'), '--handout', '3'], { encoding: 'utf8' });
check(badCount.status === 2 && /md2s: --handout takes 2 or 4, not 3/.test(badCount.stderr), `--handout 3 is refused (exit ${badCount.status})`);
const hoWatch = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(out, 'mini.md'), '--handout', '--watch'], { encoding: 'utf8' });
check(hoWatch.status === 2 && /md2s: --handout needs the build to finish; --watch rebuilds forever/.test(hoWatch.stderr), `--handout with --watch is refused (exit ${hoWatch.status})`);

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
// --strict turns those warnings into a failed build (a gate for CI); without it the build stands
check(r.status === 0, `without --strict the warned build still stands (exit ${r.status})`);
const strictRun = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(__dirname, 'overflow.md'), '--html', '--strict', '-o', out], { encoding: 'utf8' });
check(strictRun.status === 1, `--strict fails the build on those warnings (exit ${strictRun.status})`);
// --strict is a gate on the check itself too: with no browser to measure in the check cannot run, and a build
// that was never checked must not pass CI. A PATH holding nothing and a cache of its own, so neither the
// system's browsers nor md2s's own Chrome are found (an HTML build needs neither)
const barePath = fs.mkdtempSync(path.join(os.tmpdir(), 'md2s-nobrowser-'));
const bareEnv = { ...process.env, PATH: barePath, XDG_CACHE_HOME: path.join(barePath, 'cache'), CHROME_PATH: '' };
const unchecked = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(out, 'mini.md'), '--html', '-o', out], { encoding: 'utf8', env: bareEnv });
check(unchecked.status === 0 && /md2s: layout check skipped: it needs Chrome, Chromium or Edge/.test(unchecked.stderr),
  `with no browser the layout check says it was skipped, and the build stands (exit ${unchecked.status})`);
const uncheckedStrict = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(out, 'mini.md'), '--html', '--strict', '-o', out], { encoding: 'utf8', env: bareEnv });
check(uncheckedStrict.status === 1 && /strict: the check did not run, so the deck is unchecked: failing the build/.test(uncheckedStrict.stderr),
  `--strict fails the build when the check could not run at all (exit ${uncheckedStrict.status})`);
fs.rmSync(barePath, { recursive: true, force: true });
// nor is a check that never finished a pass: a stand-in browser that takes the check down with it leaves
// spawnSync with no status at all, which a strict build has to read as a failure
const killer = path.join(out, 'chrome-kills-its-parent');
fs.writeFileSync(killer, '#!/bin/sh\nkill -9 $PPID\nexit 1\n', { mode: 0o755 });
const killed = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(out, 'mini.md'), '--html', '--strict', '-o', out],
  { encoding: 'utf8', env: { ...process.env, CHROME_PATH: killer } });
check(killed.status === 1 && /md2s: the layout check was killed \(SIGKILL\)/.test(killed.stderr),
  `--strict fails the build when the layout check is killed (exit ${killed.status})`);

// the deck structures a converted deck runs into (test/cases.md, test/no-divider.md)
const deck = (name) => {
  const b = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(__dirname, name), '--html', '-o', out], { encoding: 'utf8' });
  return { html: fs.existsSync(path.join(out, name.replace(/\.md$/, '.html'))) ? fs.readFileSync(path.join(out, name.replace(/\.md$/, '.html')), 'utf8') : '', err: b.stderr };
};
const cases = deck('cases.md');
const sections = (cases.html.match(/<section\b/g) || []).length;
check(sections === 18, `a --- at the end, or two in a row, opens no empty slide (${sections} slides, 18 expected)`);
check(!/\(\d\/\d\)/.test(cases.html), 'a subsection with no second part is not numbered (1/2)');
const tables = (cases.html.match(/<table\b/g) || []).length;
check(tables === 16 && !/<td[^>]*>-{3,}<\/td>/.test(cases.html), `two tables a blank line apart stay two (${tables} tables, 16 expected), no --- cells`);
check(/<th[^>]*>c<\/th>/.test(cases.html) && /<td[^>]*text-align:right[^>]*>4<\/td>/.test(cases.html), "the second table keeps its header and its columns' alignment");
check(/<table[^>]*>\s*<tbody>\s*<tr>\s*<td[^>]*>first-row-stays/.test(cases.html), 'an empty header row is dropped, the first row stays a row');
check(/<th[^>]*>Role<\/th>/.test(cases.html) && /<td[^>]*>planner<\/td>/.test(cases.html), 'a Role column of data is kept');
check(cases.html.includes('hello {Task query}') && cases.html.includes('braces {Task response}'), 'braces that are not attributes stay text');
// the table holding a marker, as one line
const table = (marker) => ((cases.html.match(/<table[\s\S]*?<\/table>/g) || []).find((t) => t.includes(marker)) || '').replace(/\n\s*/g, '');
check(!/>role</.test(table('grouped-x-row')) && /<tr class="ref">/.test(table('grouped-x-row')) && /<tr><td[^>]*>8<\/td><td[^>]*>grouped-x-row/.test(table('grouped-x-row')),
  'a role column under a grouped header (x, ^^ placeholders, an x row) is not shown');
const two = table('two-roles');
check(/<th[^>]*>Role<\/th>/.test(two) && /<tr class="ref"><td[^>]*>planner-two<\/td><td[^>]*>two-roles<\/td><td[^>]*>a<\/td>/.test(two) && (two.match(/>role</g) || []).length === 1,
  `a Role column of data is passed over, the first role column is taken, a second one stays data (${two})`);
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
check(/<p class="caption"[^>]*>caption-above-the-table<\/p>\s*<table/.test(cases.html), 'a [Caption] on the line above a table is its caption, above it');
// a caption is no longer inside its table: it spans the body or the area, and stays with its table
const shown = spawnSync(process.execPath, [path.join(__dirname, 'measure.js'), path.join(out, 'cases.html'), 'caption-narrow-table', 'caption-in-area', 'grid:over-wide table in fit-left', 'grid:wide formula in fit-left'], { encoding: 'utf8' });
const box = (() => { try { return JSON.parse(shown.stdout); } catch { return {}; } })();
const narrow = box['caption-narrow-table'], inArea = box['caption-in-area'];
check(narrow && narrow.lines === 1 && narrow.caption > narrow.box - 2 && narrow.table < narrow.box / 4,
  `a long caption under a narrow table spans the body on one line (${JSON.stringify(narrow || box)})`);
// fit-left: an over-wide table stays in its column (at most 62% of the body, its font shrinks), the notes keep
// theirs; a formula, which neither wraps nor shrinks, keeps a column as wide as itself (no overlap with the notes)
const { 'grid:over-wide table in fit-left': wideTable, 'grid:wide formula in fit-left': wideMath } = box || {};
const apart = (g) => g && g.cells.length === 2 && g.cells[0].reach <= g.cells[1].left + 1 && g.cells[1].reach <= g.body.right + 1 && g.cells[1].right - g.cells[1].left > 100;
check(apart(wideTable) && wideTable.cells[0].right - wideTable.body.left <= (wideTable.body.right - wideTable.body.left) * 0.62 + 1,
  `an over-wide table in fit-left stays within 62% of the body, beside its notes (${JSON.stringify(wideTable)})`);
check(apart(wideMath), `a wide formula in fit-left keeps its column; the notes start after it (${JSON.stringify(wideMath)})`);
check(inArea && /area-b/.test(inArea.captionArea) && inArea.captionArea === inArea.tableArea && inArea.caption > inArea.box * 0.9,
  `a caption stays with its table in its area, as wide as the area (${JSON.stringify(inArea || box)})`);

const plain = deck('no-divider.md');
check(/not front matter/.test(plain.err) && /<h3[^>]*>A deck whose first line is ---/.test(plain.html), 'a leading --- that opens no front matter keeps the first slide, and says so');
check(/a second ##/.test(plain.err), 'without headingDivider, a slide with a second ## draws a warning');
check(/<div class="body[^"]*">[\s\S]*<h2[^>]*>Second<\/h2>/.test(plain.html) && !/over the header/.test(plain.err), 'a ## further down a slide heads the body, not the title slot');

// a deck written in several files (test/include.md → test/include-part.md → test/nested/): ```include pulls
// each file in in place, its front matter stripped, its own includes followed relative to it; {hl=…} tints
// code lines, a ```diff fence its + and -; a missing file is a red marker and a warning, and an ```include
// inside another fence stays text
const inc = deck('include.md');
const incSlides = (inc.html.match(/<section\b/g) || []).length;
check(incSlides === 8, `an included file's ### are the deck's slides (${incSlides} slides, 8 expected)`);
check(inc.html.includes('included-from-the-part') && inc.html.includes('included-from-the-nested'), '```include pulls in its files, their own includes included');
check(!inc.html.includes('paginate'), "an included file's front matter is stripped, not merged in");
const hlLines = tintedLines(inc.html, ' hl');
check(JSON.stringify(hlLines) === '["a = 1","c = 3","d = 4"]', `{hl=2,4-5} tints lines 2, 4 and 5, and those are the lines (${JSON.stringify(hlLines)})`);
check(JSON.stringify(tintedLines(inc.html, ' diff-del')) === '["- removed line"]' && JSON.stringify(tintedLines(inc.html, ' diff-add')) === '["+ added line"]'
  && tintedLines(inc.html, '').includes('kept line'),
  'a ```diff fence tints its - and + lines, the markers kept, an unchanged line left plain');
check(/include: no such file — include-absent\.md/.test(inc.html) && /md2s: include: no such file — include-absent\.md/.test(inc.err), 'a missing include leaves a red marker and a warning');
check(inc.html.includes('never-expanded.md') && !inc.err.includes('never-expanded'), 'an ```include inside another fence stays text');
// the contents slide: two columns while they hold the list, three when they do not, and as many contents
// slides as three columns need after that, every entry still listed once and the entries after the last one
const tocDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2s-toc-'));
const tocDeck = (name, sections, subs) => {
  const body = Array.from({ length: sections }, (_, a) => `# Section ${a + 1}\n\n${
    Array.from({ length: subs }, (_, b) => `## Category\n### Slide ${a + 1}.${b + 1}\n\n- body\n`).join('\n')}`).join('\n');
  fs.writeFileSync(path.join(tocDir, `${name}.md`), `---\nmarp: true\nheadingDivider: 2\ntoc: true\n---\n\n# Deck\n\nsubtitle\n\n${body}`);
  const b = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(tocDir, `${name}.md`), '--html', '-o', out], { encoding: 'utf8' });
  const f = path.join(out, `${name}.html`);
  return { html: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '', err: b.stderr };
};
// one-line entries, so the columns' width does not matter: five lines a section, four sections to a column
const tocShort = tocDeck('toc-short', 6, 4), tocMid = tocDeck('toc-mid', 10, 4), tocLong = tocDeck('toc-long', 20, 4);
check(/<div class="toc"><ul>/.test(tocShort.html) && !/class="toc toc-3"/.test(tocShort.html), 'a short contents list stays in two columns');
check(/<div class="toc toc-3"><ul>/.test(tocMid.html) && !/Outline \(1\/2\)/.test(tocMid.html), 'a list too long for two columns is set in three, on one slide');
const tocParts = (tocLong.html.match(/Outline \(\d+\/(\d+)\)/g) || []);
const listed = (tocLong.html.match(/<div class="toc[^"]*"><ul>[\s\S]*?<\/ul><\/div>/g) || []).join('');
check(tocParts.length === 2 && (listed.match(/>Section \d+</g) || []).length === 20 && (listed.match(/>Slide \d+\.\d+</g) || []).length === 80,
  `a list too long for three columns goes on over ${tocParts.length} contents slides, each entry listed once`);
check(!/Outline/.test(listed), 'the contents slides do not list themselves');
fs.rmSync(tocDir, { recursive: true, force: true });

// the include guard rails: a circle of two files and a chain deeper than 8 are a red marker and a warning,
// the build going on; an ```include inside an HTML comment stays text, as one inside another fence does
const guards = fs.mkdtempSync(path.join(os.tmpdir(), 'md2s-guard-'));
const lay = (name, text) => fs.writeFileSync(path.join(guards, name), text);
lay('a.md', '### included-a\n\n```include\nb.md\n```\n');
lay('b.md', '### included-b\n\n```include\na.md\n```\n');
for (let k = 1; k <= 10; k += 1) lay(`f${k}.md`, `### chain-${k}\n${k < 10 ? `\n\`\`\`include\nf${k + 1}.md\n\`\`\`\n` : ''}`);
lay('guards.md', '---\nmarp: true\n---\n\n# Guards\n\n## Inc\n\n```include\na.md\n```\n\n```include\nf1.md\n```\n\n<!--\n```include\ncomment-only.md\n```\n-->\n');
const guardRun = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(guards, 'guards.md'), '--html', '-o', out], { encoding: 'utf8' });
const guardHtml = fs.existsSync(path.join(out, 'guards.html')) ? fs.readFileSync(path.join(out, 'guards.html'), 'utf8') : '';
check(guardRun.status === 0, `a deck with a circular or a too-deep include still builds (exit ${guardRun.status})`);
check(/<span class="alert">include: cycle — a\.md<\/span>/.test(guardHtml) && /md2s: include: cycle — a\.md is already being included/.test(guardRun.stderr)
  && guardHtml.includes('included-a') && guardHtml.includes('included-b'),
  'a file including one of its including files is a red marker and a warning, not a loop (the file it named is back)');
check(/<span class="alert">include: too deep — f9\.md<\/span>/.test(guardHtml) && /md2s: include: more than 8 levels deep — f9\.md/.test(guardRun.stderr)
  && guardHtml.includes('chain-8') && !guardHtml.includes('chain-10'),
  'an ```include chain stops at 8 levels, the files up to there pulled in, the next one a marker and a warning');
check(guardHtml.includes('comment-only.md') && !guardRun.stderr.includes('comment-only'), 'an ```include inside an HTML comment stays text, not a missing file');

// the same guards, in the Markdown around them: a CRLF deck reads as an LF one, with the fence, the front
// matter and the comment read the same way; a deck that includes itself is a cycle where it is named, not a
// second copy of itself first; a leading --- that opens slides is not front matter, and its includes still
// expand, while four-space indented code and a comment opened mid-line keep their ```include as text
lay('crlf-part.md', '---\r\n# only a comment\r\n---\r\n### from-crlf-part\r\n');
lay('crlf.md', '# CRLF\r\n\r\n```include\r\ncrlf-part.md\r\n```\r\n');
lay('self.md', '# Self\r\n\r\nself-body\r\n\r\n```include\r\nself.md\r\n```\r\n');
// a ring that comes back to the deck by way of a part: the deck's own text is what names it (there is no
// deck path to go by once a server renders other files of the folder)
lay('ring.md', '# Ring\n\nring-body\n\n```include\nring-part.md\n```\n');
lay('ring-part.md', '### from-ring-part\n\n```include\nring.md\n```\n');
lay('part-of-misc.md', '### from-part-of-misc\n');
lay('part-of-misc-2.md', '### from-part-of-misc-2\n');
lay('misc.md', '---\n\n### leading rule\n\n'
  + 'The token is ``a`<!--b``.\n\n```include\npart-of-misc.md\n```\n\n'   // an inline code span, at two backticks
  + '    ```include\n    indented-absent.md\n    ```\n\n'                  // indented code
  + '\t<!--\n\n'                                                             // a tab-indented code line
  + '<!--\n    -->\n\n```include\npart-of-misc-2.md\n```\n\n'               // a comment closed four spaces in
  + '<div><!--\n\n```include\ncommented-absent.md\n```\n\n-->\n');           // a comment opened mid-line
// a ---…--- block of plain prose in an included file is slides, not settings: it stays (and an inline code
// span or an indented line holding `<!--` is code, not a comment that hides the includes after it)
lay('prose.md', '---\nMUST-SURVIVE-SENTINEL\n---\n\n### after-prose\n');
lay('scalar.md', '### before\n\n```include\nprose.md\n```\n');
const inGuards = (name) => {
  const b = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(guards, `${name}.md`), '--html', '-o', out], { encoding: 'utf8' });
  return { html: fs.existsSync(path.join(out, `${name}.html`)) ? fs.readFileSync(path.join(out, `${name}.html`), 'utf8') : '', err: b.stderr, status: b.status };
};
const crlfDeck = inGuards('crlf');
check(crlfDeck.status === 0 && crlfDeck.html.includes('from-crlf-part') && !/only a comment/.test(crlfDeck.html),
  `a CRLF deck's own and included files are read like LF ones, and a comments-only front matter is stripped (exit ${crlfDeck.status})`);
const selfDeck = inGuards('self');
const selfCopies = (selfDeck.html.match(/self-body/g) || []).length;
const selfTitles = (selfDeck.html.match(/<h1\b/g) || []).length;
check(selfDeck.status === 0 && selfCopies === 1 && selfTitles === 1 && /md2s: include: cycle — self\.md/.test(selfDeck.err),
  `a deck that includes itself is a cycle where it is named, not one copy of itself first (${selfTitles} title, ${selfCopies} body)`);
const miscDeck = inGuards('misc');
check(miscDeck.status === 0 && miscDeck.html.includes('from-part-of-misc') && miscDeck.html.includes('from-part-of-misc-2')
  && !/md2s: include:/.test(miscDeck.err) && miscDeck.html.includes('indented-absent.md') && miscDeck.html.includes('commented-absent.md'),
  'a leading --- that opens slides still gets its includes across an inline code span, indented code and a mid-line comment');
// two files with the same text are still two files: a part that reads like the deck it sits under is no cycle
fs.mkdirSync(path.join(guards, 'sub', 'sub'), { recursive: true });
lay('twin.md', '### twin\n\ntwin-body\n\n```include\nsub/twin.md\n```\n');
lay('sub/twin.md', '### twin\n\ntwin-body\n\n```include\nsub/twin.md\n```\n');
lay('sub/sub/twin.md', '### twin-leaf\n\nleaf-body\n');
const twinDeck = inGuards('twin');
check(twinDeck.status === 0 && twinDeck.html.includes('leaf-body') && twinDeck.html.includes('twin-body') && !/include: cycle/.test(twinDeck.err),
  `a part byte-identical to the deck is still a part, expanded by its own path (${twinDeck.err.trim().split('\n')[0] || 'no warnings'})`);
const ringDeck = inGuards('ring');
const ringBodies = (ringDeck.html.match(/ring-body/g) || []).length;
check(ringDeck.status === 0 && ringDeck.html.includes('from-ring-part') && ringBodies === 1
  && /md2s: include: cycle — ring\.md/.test(ringDeck.err),
  `a part that includes the deck is a cycle at the deck, not a second copy of it (${ringBodies} body, one deck)`);
// a backtick run closes only a run of the same length: ``a```b`` is one code span, so the comment after it is
// still a comment and the include inside it stays text (four-space code and mid-line comments are covered above)
lay('ticks.md', '### backticks\n\n``a```b``\n\n<!--\n\n```include\npart-of-misc.md\n```\n\n-->\n');
const ticksDeck = inGuards('ticks');
check(ticksDeck.status === 0 && !ticksDeck.html.includes('from-part-of-misc') && !/md2s: include:/.test(ticksDeck.err),
  'a ```include inside a comment stays text after a code span whose run is longer than its opener');
lay('escaped.md', '### escaped\n\nA \\`x\n\n<!--\n\n```include\npart-of-misc.md\n```\n\n-->\n');
const escapedDeck = inGuards('escaped');
check(escapedDeck.status === 0 && !escapedDeck.html.includes('from-part-of-misc'),
  'an escaped backtick opens no code span, so the comment after it still hides its ```include');
const scalarDeck = inGuards('scalar');
check(scalarDeck.status === 0 && scalarDeck.html.includes('MUST-SURVIVE-SENTINEL') && scalarDeck.html.includes('after-prose'),
  `an included file's ---…--- block of plain prose is kept: only YAML settings (or an empty block) is front matter (${scalarDeck.status})`);
fs.rmSync(guards, { recursive: true, force: true });

// a served deck that sits in a sub folder includes beside itself, not beside the folder the server started
// in: the deck folder holds a part.md of its own, and the sub deck's own part.md is the one that must load
// (the engine is driven directly here, as a server does, with no MD2S_DECK_FILE to name the file)
const srv = fs.mkdtempSync(path.join(os.tmpdir(), 'md2s-serve-'));
fs.mkdirSync(path.join(srv, 'sub'), { recursive: true });
fs.writeFileSync(path.join(srv, 'main.md'), '# Main\n');
fs.writeFileSync(path.join(srv, 'part.md'), '### WRONG-root-part\n');
fs.writeFileSync(path.join(srv, 'sub', 'part.md'), '### RIGHT-sub-part\n');
fs.writeFileSync(path.join(srv, 'sub', 'other.md'), '### Sub deck\n\n```include\npart.md\n```\n');
const savedDir = process.env.MD2S_DECK_DIR, savedFile = process.env.MD2S_DECK_FILE;
let served = '';
try {
  process.env.MD2S_DECK_DIR = srv;
  delete process.env.MD2S_DECK_FILE;
  const cliDir = path.dirname(require.resolve('@marp-team/marp-cli/package.json'));
  const { Marp } = require(require.resolve('@marp-team/marp-core', { paths: [cliDir] }));
  const config = require(path.join(ROOT, 'src', 'config.js'));
  const marp = config.engine({ marp: new Marp({ html: config.html, ...config.options }) });
  served = marp.render(fs.readFileSync(path.join(srv, 'sub', 'other.md'), 'utf8')).html;
} finally {
  if (savedDir === undefined) delete process.env.MD2S_DECK_DIR; else process.env.MD2S_DECK_DIR = savedDir;
  if (savedFile === undefined) delete process.env.MD2S_DECK_FILE; else process.env.MD2S_DECK_FILE = savedFile;
  fs.rmSync(srv, { recursive: true, force: true });
}
check(served.includes('RIGHT-sub-part') && !served.includes('WRONG-root-part'),
  `a served deck in a sub folder includes its own file beside it (${served.includes('RIGHT-sub-part') ? 'its part' : 'no part'})`);

// {hl=…} ignores what it cannot read — a number past the end, 0, a word — and never reaches the slide as an
// attribute; test/include.md covers the lines it does tint
fs.writeFileSync(path.join(out, 'tint.md'), '---\nmarp: true\n---\n\n# Tint\n\n## Code\n### Careful\n\n```js {hl=2,99,three,0}\nlet a = 1;\nlet b = 2;\nlet c = 3;\n```\n');
const tintRun = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(out, 'tint.md'), '--html', '-o', out], { encoding: 'utf8' });
const tintHtml = fs.existsSync(path.join(out, 'tint.html')) ? fs.readFileSync(path.join(out, 'tint.html'), 'utf8') : '';
const tinted = (tintHtml.match(/<span class="line hl">[\s\S]*?(?=<span class="line|<\/code>)/) || [''])[0].replace(/<[^>]+>/g, '');
check(tintRun.status === 0 && (tintHtml.match(/class="line hl"/g) || []).length === 1 && /b = 2/.test(tinted),
  `{hl=2,99,three,0} tints line 2 only (${JSON.stringify(tinted.trim() || tintRun.stderr.trim().split('\n')[0] || 'no tinted line')})`);
check(!/hl=/.test(tintHtml), "a fence's {hl=…} does not reach the slide as an attribute");
// {hl=…} holds both ends to the block: a value too long for a safe integer is dropped, where k++ stops moving
// and the build would hang on the slide that names it
fs.writeFileSync(path.join(out, 'huge.md'), '# Huge\n\n### hl\n\n```js {hl=9007199254740992}\nlet a = 1;\n```\n\n```js {hl=1-99}\nlet b = 1;\n```\n');
const huge = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(out, 'huge.md'), '--html', '-o', out], { encoding: 'utf8', timeout: 120000 });
const hugeHtml = fs.existsSync(path.join(out, 'huge.html')) ? fs.readFileSync(path.join(out, 'huge.html'), 'utf8') : '';
check(huge.status === 0 && (hugeHtml.match(/class="line hl"/g) || []).length === 1,
  `{hl=9007199254740992} is ignored and {hl=1-99} tints the one line there is, without hanging (exit ${huge.status}${huge.signal ? `, ${huge.signal}` : ''})`);

// md2s setup on a machine without tar / xz: TinyTeX is not downloaded, the message says why, nothing is left
// (a PATH holding only sh, and a cache of its own, so nothing real is touched)
const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'md2s-path-'));
fs.symlinkSync('/bin/sh', path.join(bare, 'sh'));
const tex = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(ROOT, 'src', 'setup.js'))}).installTinyTeX().then(() => console.log('installed'), (e) => console.log(e.message))`],
  { encoding: 'utf8', env: { ...process.env, PATH: bare, XDG_CACHE_HOME: path.join(bare, 'cache') } });
check(/TinyTeX needs `tar` and `xz`.*Install them with your package manager/.test(tex.stdout) && !fs.existsSync(path.join(bare, 'cache', 'md2s', 'tinytex')),
  `without tar and xz, md2s setup says so before downloading TinyTeX and leaves nothing (${tex.stdout.trim() || tex.stderr.trim()})`);
fs.rmSync(bare, { recursive: true, force: true });

// a TinyTeX whose tlmgr fails (a stub tree: pdflatex is there, kpsewhich finds nothing, tlmgr exits 1) is not
// put on the PATH, and installing its packages removes it and says what to do next
const stub = fs.mkdtempSync(path.join(os.tmpdir(), 'md2s-tinytex-'));
const stubBin = path.join(stub, 'md2s', 'tinytex', '.TinyTeX', 'bin', 'x86_64-linux');
fs.mkdirSync(stubBin, { recursive: true });
for (const cmd of ['pdflatex', 'kpsewhich', 'tlmgr']) fs.writeFileSync(path.join(stubBin, cmd), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
const half = spawnSync(process.execPath, ['-e', `const s = require(${JSON.stringify(path.join(ROOT, 'src', 'setup.js'))});
s.useLocalTools(); console.log(process.env.PATH.includes(${JSON.stringify(stubBin)}) ? 'on PATH' : 'not on PATH');
try { s.installTeXPackages(); console.log('installed'); } catch (e) { console.log(e.message); }`],
{ encoding: 'utf8', env: { ...process.env, XDG_CACHE_HOME: stub } });
check(/^not on PATH/.test(half.stdout) && /tlmgr install .* failed \(exit 1\)|tlmgr update --self failed \(exit 1\)/.test(half.stdout)
  && /removed .*tinytex\. Check your network/.test(half.stdout) && !fs.existsSync(path.join(stub, 'md2s', 'tinytex')),
`a TinyTeX without its packages is not used, and a failed tlmgr removes it and says what to do (${half.stdout.trim() || half.stderr.trim()})`);
fs.rmSync(stub, { recursive: true, force: true });

fs.rmSync(out, { recursive: true, force: true });
if (problems.length) {
  console.log(`\n${problems.length} check(s) failed. md2s --check shows which tools are missing; md2s setup installs them.`);
  process.exit(1);
}
console.log('\nall checks passed');
