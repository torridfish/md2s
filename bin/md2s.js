#!/usr/bin/env node
// md2s: plain Markdown to academic slides, on Marp. See `md2s --help`, and `md2s --skill` for the syntax.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MARP = path.join(ROOT, 'node_modules', '.bin', 'marp');
const CONFIG = path.join(ROOT, 'src', 'config.js');

const HELP = `md2s: plain Markdown to consistent, readable academic slides (PDF, PPTX, HTML), on Marp.

  md2s deck.md                       deck.pdf next to deck.md (vector)
  md2s deck.md --pdf --pptx          + deck.pptx, one picture per slide (2880x1620)
  md2s deck.md --html                one HTML file to present from: arrows / click to turn, l laser,
                                     d pen, u undo, e erase, ? keys (Marp's f, o, p as usual)
  md2s deck.md --serve [--port N]    present at http://localhost:8080/deck.md, rendered again on reload
  md2s deck.md --pdf --watch         rebuild on every save
  md2s deck.md --png                 one PNG per slide
  md2s deck.md --pptx --scale 4      PPTX / PNG pictures at 4x the 960x540 canvas (default 3)
  md2s deck.md --thanks              close with a "Thanks for listening." page (--thanks-text T)
  md2s deck.md --pdf -o out/         write into another folder

  md2s --skill                       the Markdown syntax, written for an agent (or you)
  md2s --check                       which optional tools (Chrome, TeX, ffmpeg …) are present
  md2s tex2img …                     LaTeX snippet → transparent PNG (md2s tex2img --help)
  md2s --version

Settings live in the deck's front matter (toc, bibliography …): see md2s --skill. Your own defaults for
them go in ~/.config/md2s/config.yaml, your math macros in ~/.config/md2s/macros.tex. Figures are files
you export yourself (SVG, PNG, PDF …). CHROME_PATH picks the browser Marp renders through.`;

function fail(msg) { process.stderr.write(`md2s: ${msg}\n`); process.exit(2); }

const has = (cmd) => { try { execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'pipe' }); return true; } catch { return false; } };
// a browser Marp can print through: Chrome, Chromium, Edge or Firefox
const browser = () => !!process.env.CHROME_PATH
  || ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable', 'firefox'].some(has)
  || ['Google Chrome', 'Chromium', 'Microsoft Edge', 'Firefox'].some((app) => fs.existsSync(`/Applications/${app}.app`));

function check() {
  const tex = (file) => { try { return !!execFileSync('kpsewhich', [file], { encoding: 'utf8' }).trim(); } catch { return false; } };
  const rows = [
    ['Chrome / Chromium', browser(), 'PDF, PPTX, PNG; --html needs none (set CHROME_PATH to pick one)'],
    ['pdflatex', has('pdflatex'), '```algo and ```latex {.render} fences, md2s tex2img'],
    ['algorithm2e, standalone', tex('algorithm2e.sty') && tex('standalone.cls'), '```algo fences (tlmgr install algorithm2e standalone)'],
    ['pdftocairo (poppler)', has('pdftocairo'), 'LaTeX fences, PDF pages as pictures'],
    ['ffmpeg', has('ffmpeg'), "a video's first frame in PDF / PPTX (without it: a link to the file)"],
    ['Noto Serif CJK TC', (() => { try { return /Noto Serif CJK/.test(execFileSync('fc-list', [':family=Noto Serif CJK TC'], { encoding: 'utf8' })); } catch { return fs.existsSync('/Library/Fonts/NotoSerifCJK.ttc'); } })(), 'only for Chinese on slides (fonts-noto-cjk)'],
  ];
  for (const [name, ok, why] of rows) console.log(`${ok ? 'ok     ' : 'missing'}  ${name.padEnd(24)} ${why}`);
  if (!fs.existsSync(MARP)) console.log(`missing  node packages            run npm install in ${ROOT}`);
}

const args = process.argv.slice(2);
if (args[0] === 'tex2img') process.exit(spawnSync(path.join(ROOT, 'scripts', 'tex2img.sh'), args.slice(1), { stdio: 'inherit' }).status ?? 1);

let src = '', outdir = '', watch = false, serve = false, port = '8080', scale = null, thanks = '';
const formats = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const value = () => { if (i + 1 >= args.length) fail(`${a} needs a value`); return args[++i]; };
  if (['--pdf', '--pptx', '--html', '--png'].includes(a)) formats.push(a.slice(2));
  else if (a === '--watch' || a === '-w') watch = true;
  else if (a === '--serve') serve = true;
  else if (a === '--port') port = value();
  else if (a === '--scale') scale = value();
  else if (a === '-o') outdir = value();
  else if (a === '--thanks') thanks = thanks || 'Thanks for listening.';
  else if (a === '--thanks-text') thanks = value();
  else if (a === '--skill') { process.stdout.write(fs.readFileSync(path.join(ROOT, 'docs', 'agent.md'), 'utf8')); process.exit(0); }
  else if (a === '--check') { check(); process.exit(0); }
  else if (a === '--version' || a === '-v') { console.log(require(path.join(ROOT, 'package.json')).version); process.exit(0); }
  else if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
  else if (a.startsWith('-')) fail(`unknown option ${a} (md2s --help)`);
  else src = a;
}
if (!src) { console.log(HELP); process.exit(2); }
if (!fs.existsSync(src)) fail(`no such file: ${src}`);
if (!fs.existsSync(MARP)) fail(`node packages missing: run npm install in ${ROOT}`);
if (!formats.length) formats.push('pdf');
if (watch && formats.length > 1) fail('--watch takes one format');
if (formats.some((f) => f !== 'html') && !browser()) {
  fail('no browser found for PDF / PPTX / PNG: install Chrome or Chromium, set CHROME_PATH, or build --html');
}

const deckDir = path.dirname(path.resolve(src));
// the engine sizes figures at 1:1 and resolves their paths against the deck; it appends the thanks page
const env = { ...process.env, MD2S_DECK_DIR: deckDir, MD2S_THANKS: thanks };
const marp = (extra, format) => {
  const r = spawnSync(MARP, ['--no-stdin', '--config-file', CONFIG, ...extra], { stdio: 'inherit', env: { ...env, MD2S_FORMAT: format } });
  if (r.status) process.exit(r.status);
};

if (serve) {
  // Marp's server renders the deck's folder on request, as HTML with the presenting tools
  console.log(`presenting at http://localhost:${port}/${path.basename(src)} (Ctrl-C to stop)`);
  env.PORT = port;
  marp(['--server', '--input-dir', deckDir], 'html');
  process.exit(0);
}
const out = outdir || path.dirname(src);
fs.mkdirSync(out, { recursive: true });
const stem = path.basename(src).replace(/\.[^.]+$/, '');
for (const f of formats) {
  const flag = f === 'png' ? ['--images', 'png'] : [`--${f}`];
  marp([...flag, ...(scale ? ['--image-scale', scale] : []), ...(watch ? ['--watch'] : []), '-o', path.join(out, `${stem}.${f}`), '--', src], f);
}
