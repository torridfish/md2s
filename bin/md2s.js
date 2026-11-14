#!/usr/bin/env node
// md2s: plain Markdown to academic slides, on Marp. See `md2s --help`, and `md2s --skill` for the syntax.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// Marp's CLI wherever npm put it: under md2s in a clone or a global install, hoisted in a project's install
const MARP = (() => {
  try { return path.join(path.dirname(require.resolve('@marp-team/marp-cli/package.json')), 'marp-cli.js'); } catch { return null; }
})();
const CONFIG = path.join(ROOT, 'src', 'config.js');

const HELP = `md2s: plain Markdown to consistent, readable academic slides (PDF, PPTX, HTML), on Marp.

  md2s deck.md                       deck.pdf next to deck.md (vector)
  md2s deck.md --pdf --pptx          + deck.pptx, one picture per slide (2880x1620)
  md2s deck.md --html                one HTML file to present from: arrows / click to turn, l laser,
                                     d pen, u undo, e erase, ? keys (Marp's f, o, p as usual)
  md2s deck.md --serve [--port N]    present at http://localhost:8080/deck.md; saving the deck reloads the page,
                                     which stays on the slide you were on (Marp's URL hash)
  md2s deck.md --pdf --watch         rebuild on every save
  md2s deck.md --png                 one PNG per slide
  md2s deck.md --pptx --scale 4      PPTX / PNG pictures at 4x the 960x540 canvas (default 3)
  md2s deck.md --thanks              close with a "Thanks for listening." page (--thanks-text T)
  md2s deck.md --pdf --handout [4]   + deck-handout.pdf: the slides 2- or 4-up on A4 portrait, to print
  md2s deck.md --pdf -o out/         write into another folder
  md2s deck.md --no-check            skip the layout check (after every build but --watch, md2s warns
                                     about content cut off or over the margins, and titles over two lines)
  md2s deck.md --strict              the layout check's warnings fail the build (exit 1), and so does a
                                     check that cannot run at all: a gate for CI; --no-check skips it

  md2s --skill                       the Markdown syntax, written for an agent (or you)
  md2s --check                       which tools (Chrome, TeX, ffmpeg …) are present
  md2s setup [--yes]                 install what is missing, asking first: a browser and TinyTeX in
                                     ~/.cache/md2s, the CJK font in your fonts (no sudo); prints the
                                     package-manager command for poppler and ffmpeg
  md2s tex2img …                     LaTeX snippet → transparent PNG (md2s tex2img --help)
  md2s --version

Settings live in the deck's front matter (toc, bibliography …): see md2s --skill. Your own defaults for
them go in ~/.config/md2s/config.yaml, your math macros in ~/.config/md2s/macros.tex. Figures are files
you export yourself (SVG, PNG, PDF …). CHROME_PATH picks the browser Marp renders through.`;

function fail(msg) { process.stderr.write(`md2s: ${msg}\n`); process.exit(2); }

// the browser and TinyTeX that md2s setup installed, for this process and everything it starts
const tools = require(path.join(ROOT, 'src', 'setup.js'));
tools.useLocalTools();

const args = process.argv.slice(2);
if (args[0] === 'tex2img') process.exit(spawnSync(path.join(ROOT, 'scripts', 'tex2img.sh'), args.slice(1), { stdio: 'inherit' }).status ?? 1);
if (args[0] === 'setup') { tools.setup(ROOT, args.slice(1)); return; }

let src = '', outdir = '', watch = false, serve = false, port = '8080', scale = null, thanks = '', layoutCheck = true, strict = false, handout = 0;
const formats = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const value = () => { if (i + 1 >= args.length) fail(`${a} needs a value`); return args[++i]; };
  if (['--pdf', '--pptx', '--html', '--png'].includes(a)) formats.push(a.slice(2));
  else if (a === '--watch' || a === '-w') watch = true;
  else if (a === '--no-check') layoutCheck = false;
  else if (a === '--serve') serve = true;
  else if (a === '--port') port = value();
  else if (a === '--scale') scale = value();
  else if (a === '-o') outdir = value();
  else if (a === '--thanks') thanks = thanks || 'Thanks for listening.';
  else if (a === '--thanks-text') thanks = value();
  else if (a === '--strict') strict = true;
  else if (a === '--handout') {
    // the slides per page is optional, taken only when the next argument is a number, so
    // `md2s --handout deck.md` still names the deck
    const next = args[i + 1];
    if (next !== undefined && /^\d+$/.test(next)) {
      if (next === '2' || next === '4') { i += 1; handout = +next; }
      else fail(`--handout takes 2 or 4, not ${next}`);
    } else handout = handout || 2;
  }
  else if (a === '--skill') { process.stdout.write(fs.readFileSync(path.join(ROOT, 'docs', 'agent.md'), 'utf8')); process.exit(0); }
  else if (a === '--check') { tools.check(ROOT); process.exit(0); }
  else if (a === '--version' || a === '-v') { console.log(require(path.join(ROOT, 'package.json')).version); process.exit(0); }
  else if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
  else if (a.startsWith('-')) fail(`unknown option ${a} (md2s --help)`);
  else src = a;
}
if (!src) { console.log(HELP); process.exit(2); }
if (!fs.existsSync(src)) fail(`no such file: ${src}`);
if (!MARP) fail(`node packages missing: run npm ci in ${ROOT}`);
if (!formats.length) formats.push('pdf');
// the handout tiles the vector PDF, so build one even when the deck was asked for as --html
if (handout && !formats.includes('pdf')) formats.push('pdf');
if (handout && watch) fail('--handout needs the build to finish; --watch rebuilds forever');
if (watch && formats.length > 1) fail('--watch takes one format');
if (formats.some((f) => f !== 'html') && !tools.browser()) {
  fail('no browser found for PDF / PPTX / PNG: run md2s setup, set CHROME_PATH, or build --html');
}

const deckDir = path.dirname(path.resolve(src));
// the engine sizes figures at 1:1 and resolves their paths against the deck; it appends the thanks page
const env = { ...process.env, MD2S_DECK_DIR: deckDir, MD2S_DECK_FILE: path.resolve(src), MD2S_THANKS: thanks };
// a run that failed, never started or was killed: spawnSync reports the last two as no status, and a stale
// output file from an earlier build must not pass for a fresh one (a handout tiled from an older PDF)
const failed = (r) => !!r.error || !!r.signal || r.status !== 0;
const stop = (r, what) => {
  if (r.error) process.stderr.write(`md2s: ${what} did not start: ${r.error.message}\n`);
  if (r.signal) process.stderr.write(`md2s: ${what} was killed (${r.signal})\n`);
  process.exit(r.status || 1);
};
const marp = (extra, format) => {
  const r = spawnSync(process.execPath, [MARP, '--no-stdin', '--config-file', CONFIG, ...extra], { stdio: 'inherit', env: { ...env, MD2S_FORMAT: format } });
  if (failed(r)) stop(r, 'the build');
};

if (serve) {
  // Marp's server renders the deck's folder on request, as HTML with the presenting tools; --watch reloads the
  // open page when a file is saved, and the slide stays (Marp keeps it in the URL hash)
  console.log(`presenting at http://localhost:${port}/${path.basename(src)} (Ctrl-C to stop; saving the deck reloads it)`);
  env.PORT = port;
  marp(['--server', '--watch', '--input-dir', deckDir], 'html');
  process.exit(0);
}
const out = outdir || path.dirname(src);
fs.mkdirSync(out, { recursive: true });
const stem = path.basename(src).replace(/\.[^.]+$/, '');
(async () => {
  for (const f of formats) {
    const flag = f === 'png' ? ['--images', 'png'] : [`--${f}`];
    marp([...flag, ...(scale ? ['--image-scale', scale] : []), ...(watch ? ['--watch'] : []), '-o', path.join(out, `${stem}.${f}`), '--', src], f);
  }
  // the handout, tiled from the vector PDF the build just wrote (src/handout.js)
  if (handout) {
    const { handout: tile } = require(path.join(ROOT, 'src', 'handout.js'));
    try { await tile(path.join(out, `${stem}.pdf`), path.join(out, `${stem}-handout.pdf`), handout); }
    catch (e) { fail(`handout: ${String(e.message).split('\n')[0]}`); }
  }
  // what Chrome cut off or drew over the margins, slide by slide (src/layout.js); --watch rebuilds without it
  if (layoutCheck && !watch) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'src', 'layout.js'), src, ...(strict ? ['--strict'] : [])], { stdio: 'inherit', env: { ...env, MD2S_FORMAT: formats[0] } });
    // CI gate: warnings, a check that never ran, a check that was killed, all fail the build
    if (strict && failed(r)) stop(r, 'the layout check');
  }
})();
