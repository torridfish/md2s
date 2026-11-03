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

// --handout tiles that PDF onto A4 portrait, a sheet per two slides (4: four a page), the vectors kept
const hoRun = spawnSync(process.execPath, [path.join(ROOT, 'src', 'handout.js'), path.join(out, 'gallery.pdf'), path.join(out, 'gallery-handout.pdf'), '2'], { encoding: 'utf8' });
const hoPdf = fs.existsSync(path.join(out, 'gallery-handout.pdf')) ? fs.readFileSync(path.join(out, 'gallery-handout.pdf'), 'latin1') : '';
const hoPages = pageCount(hoPdf);
const hoBox = pdfText(hoPdf).match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
check(hoRun.status === 0 && hoPages === Math.ceil(slides / 2), `--handout tiles two slides on each A4 sheet (${hoPages} sheets, ${slides} slides)`);
check(hoBox && Math.abs(+hoBox[3] - 595.28) < 0.1 && Math.abs(+hoBox[4] - 841.89) < 0.1, `handout sheets are A4 portrait (${hoBox ? `${hoBox[3]} x ${hoBox[4]} pt` : 'no MediaBox found'})`);
// through the CLI the same: --handout builds the deck's PDF (asked for or not) and its handout after it
fs.writeFileSync(path.join(out, 'mini.md'), '---\nmarp: true\n---\n\n# Mini\n\n## A\n### One slide\n\nbody text\n');
const miniRun = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(out, 'mini.md'), '--handout', '-o', out], { encoding: 'utf8' });
check(miniRun.status === 0 && fs.existsSync(path.join(out, 'mini.pdf')) && fs.existsSync(path.join(out, 'mini-handout.pdf')),
  `--handout builds the PDF and its handout${miniRun.status ? `: ${miniRun.stderr.trim().split('\n')[0]}` : ''}`);
// --handout 4 puts four slides on a sheet; and --handout is a flag, so it finds the deck when it comes first:
// on --html it adds the PDF the handout needs, and writes all three
const ho4 = spawnSync(process.execPath, [path.join(ROOT, 'src', 'handout.js'), path.join(out, 'gallery.pdf'), path.join(out, 'gallery-4up.pdf'), '4'], { encoding: 'utf8' });
const ho4Pages = fs.existsSync(path.join(out, 'gallery-4up.pdf')) ? pageCount(fs.readFileSync(path.join(out, 'gallery-4up.pdf'), 'latin1')) : 0;
check(ho4.status === 0 && ho4Pages === Math.ceil(slides / 4), `--handout 4 tiles four slides on each A4 sheet (${ho4Pages} sheets, ${slides} slides)`);
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
check((inc.html.match(/class="line hl"/g) || []).length === 3, '{hl=2,4-5} tints lines 2, 4 and 5 of a code block');
check((inc.html.match(/class="line diff-(add|del)"/g) || []).length === 2, 'a ```diff fence tints its + and - lines');
check(/include: no such file — include-absent\.md/.test(inc.html) && /md2s: include: no such file — include-absent\.md/.test(inc.err), 'a missing include leaves a red marker and a warning');
check(inc.html.includes('never-expanded.md') && !inc.err.includes('never-expanded'), 'an ```include inside another fence stays text');
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
fs.rmSync(guards, { recursive: true, force: true });

// {hl=…} ignores what it cannot read — a number past the end, 0, a word — and never reaches the slide as an
// attribute; test/include.md covers the lines it does tint
fs.writeFileSync(path.join(out, 'tint.md'), '---\nmarp: true\n---\n\n# Tint\n\n## Code\n### Careful\n\n```js {hl=2,99,three,0}\nlet a = 1;\nlet b = 2;\nlet c = 3;\n```\n');
const tintRun = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'md2s.js'), path.join(out, 'tint.md'), '--html', '-o', out], { encoding: 'utf8' });
const tintHtml = fs.existsSync(path.join(out, 'tint.html')) ? fs.readFileSync(path.join(out, 'tint.html'), 'utf8') : '';
const tinted = (tintHtml.match(/<span class="line hl">[\s\S]*?(?=<span class="line|<\/code>)/) || [''])[0].replace(/<[^>]+>/g, '');
check(tintRun.status === 0 && (tintHtml.match(/class="line hl"/g) || []).length === 1 && /b = 2/.test(tinted),
  `{hl=2,99,three,0} tints line 2 only (${JSON.stringify(tinted.trim() || tintRun.stderr.trim().split('\n')[0] || 'no tinted line')})`);
check(!/hl=/.test(tintHtml), "a fence's {hl=…} does not reach the slide as an attribute");

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
