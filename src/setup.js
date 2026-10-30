// md2s's tools beyond its node packages: finding them (md2s --check) and installing what is missing (md2s setup).
// What can live in the user's home goes there without sudo: Chrome for Testing and TinyTeX in md2s's cache,
// the CJK font in the user's font folder. What needs the system package manager (poppler, ffmpeg) is printed
// as a command to run, never run with sudo here. A tool already on the system always wins over md2s's copy.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { execFileSync, spawnSync } = require('child_process');

const HOME = os.homedir();
const CACHE = path.join(process.env.XDG_CACHE_HOME || path.join(HOME, '.cache'), 'md2s');
const BROWSERS = path.join(CACHE, 'browsers');
const TINYTEX = path.join(CACHE, 'tinytex');
const FONTS = process.platform === 'darwin' ? path.join(HOME, 'Library', 'Fonts')
  : path.join(process.env.XDG_DATA_HOME || path.join(HOME, '.local', 'share'), 'fonts');
// what tex/preamble-*.tex loads beyond TinyTeX's own set, with the packages those load in turn
const TEX_PACKAGES = ['standalone', 'varwidth', 'preview', 'xkeyval', 'mathtools', 'algorithm2e', 'ifoddpage', 'relsize'];
const CJK = 'https://github.com/notofonts/noto-cjk/raw/main/Serif/OTF/TraditionalChinese/';

const which = (cmd) => { try { return execFileSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8', stdio: 'pipe' }).trim(); } catch { return ''; } };
const has = (cmd) => !!which(cmd);
const ours = (p) => !!p && p.startsWith(CACHE);
const tex = (file) => { try { return !!execFileSync('kpsewhich', [file], { encoding: 'utf8', stdio: 'pipe' }).trim(); } catch { return false; } };

// a browser Marp can print through: Chrome, Chromium, Edge or Firefox on the system
const systemBrowser = () => ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable', 'firefox'].some(has)
  || ['Google Chrome', 'Chromium', 'Microsoft Edge', 'Firefox'].some((app) => fs.existsSync(`/Applications/${app}.app`));
// md2s setup's Chrome for Testing (the full browser, unpacked; chrome-headless-shell sets text a little wider
// than Chrome, so lines could wrap elsewhere): browsers/chrome/<platform>-<build>/…
function localBrowser() {
  const dir = path.join(BROWSERS, 'chrome');
  const builds = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  if (!builds.length) return null;
  const last = builds[builds.length - 1], at = last.indexOf('-');
  const { computeExecutablePath, Browser } = require('@puppeteer/browsers');
  const exe = computeExecutablePath({ browser: Browser.CHROME, cacheDir: BROWSERS, platform: last.slice(0, at), buildId: last.slice(at + 1) });
  return fs.existsSync(exe) ? exe : null;
}
// md2s setup's TinyTeX: tinytex/.TinyTeX/bin/<arch>
function tinytexBin() {
  const bin = path.join(TINYTEX, '.TinyTeX', 'bin');
  const arch = fs.existsSync(bin) ? fs.readdirSync(bin)[0] : null;
  return arch ? path.join(bin, arch) : null;
}
// it counts once its own kpsewhich finds what ```algo fences load: a tree that a failed or interrupted setup
// left behind would otherwise pass for an installed TeX (pdflatex ok, algorithm2e missing)
function tinytexReady() {
  const bin = tinytexBin();
  if (!bin) return null;
  try {
    const found = execFileSync(path.join(bin, 'kpsewhich'), ['algorithm2e.sty', 'standalone.cls'], { encoding: 'utf8', stdio: 'pipe' });
    return found.trim().split('\n').length === 2 ? bin : null;
  } catch { return null; }
}
const onPath = (bin) => { if (!process.env.PATH.split(path.delimiter).includes(bin)) process.env.PATH += path.delimiter + bin; };

// Ubuntu 23.10+ lets only programs with an AppArmor profile (a packaged Chrome has one) open the user
// namespaces Chrome's sandbox is built on, so a browser unpacked in the home folder dies at launch
const userNamespacesRestricted = () => {
  try { return fs.readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1'; } catch { return false; }
};

// md2s's copies, for this process and what it starts (Marp, tex2img.sh): TinyTeX after the system's TeX on the
// PATH, Chrome for Testing as CHROME_PATH when no browser is set or installed. Where the sandbox cannot
// start (above), md2s's Chrome runs without it (Marp's CHROME_NO_SANDBOX); it only renders your decks.
function useLocalTools() {
  const bin = tinytexReady();
  if (bin) onPath(bin);
  if (!process.env.CHROME_PATH && !systemBrowser()) {
    const exe = localBrowser();
    if (exe) {
      process.env.CHROME_PATH = exe;
      if (userNamespacesRestricted()) process.env.CHROME_NO_SANDBOX = '1';
    }
  }
}
const browser = () => !!process.env.CHROME_PATH || systemBrowser();
// the Chrome, Chromium or Edge that md2s's layout check drives (it needs one of these, not Firefox)
function chromium() {
  if (process.env.CHROME_PATH && !/firefox/i.test(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const cmd of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable']) {
    const p = which(cmd);
    if (p) return p;
  }
  return ['Google Chrome', 'Chromium', 'Microsoft Edge'].map((app) => `/Applications/${app}.app/Contents/MacOS/${app}`).find((p) => fs.existsSync(p)) || null;
}
const cjk = () => {
  try { return /Noto Serif CJK/.test(execFileSync('fc-list', [':family=Noto Serif CJK TC'], { encoding: 'utf8', stdio: 'pipe' })); }
  catch { return ['/Library/Fonts', FONTS].some((d) => fs.existsSync(d) && fs.readdirSync(d).some((f) => /^NotoSerifCJK/i.test(f))); }
};

function status() {
  const where = (p) => (ours(p) ? ` (md2s's copy in ${CACHE})` : '');
  return [
    { name: 'Chrome / Chromium', ok: browser(), why: `PDF, PPTX, PNG; --html needs none${where(process.env.CHROME_PATH)}` },
    { name: 'pdflatex', ok: has('pdflatex'), why: `\`\`\`algo and \`\`\`latex {.render} fences, md2s tex2img${where(which('pdflatex'))}` },
    { name: 'algorithm2e, standalone', ok: tex('algorithm2e.sty') && tex('standalone.cls'), why: '```algo fences' },
    { name: 'pdftocairo (poppler)', ok: has('pdftocairo'), why: 'LaTeX fences, PDF pages as pictures' },
    { name: 'ffmpeg', ok: has('ffmpeg'), why: "optional: a video's first frame in PDF / PPTX (without it: a link to the file)" },
    { name: 'Noto Serif CJK TC', ok: cjk(), why: 'optional: only for Chinese on slides' },
  ];
}

function check(root) {
  const rows = status();
  for (const r of rows) console.log(`${r.ok ? 'ok     ' : 'missing'}  ${r.name.padEnd(24)} ${r.why}`);
  try { require.resolve('@marp-team/marp-cli/package.json'); } catch { console.log(`missing  node packages            run npm ci in ${root}`); }
  if (rows.some((r) => !r.ok)) console.log('\nmd2s setup installs what is missing (asking first).');
}

// ---------- installing ----------
function ask(question, yes, dflt) {
  if (yes) { console.log(`${question} yes`); return Promise.resolve(true); }
  if (!process.stdin.isTTY) { console.log(`${question} skipped (not a terminal: md2s setup --yes)`); return Promise.resolve(false); }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(`${question} [${dflt ? 'Y/n' : 'y/N'}] `, (a) => {
    rl.close();
    resolve(a.trim() ? /^y/i.test(a.trim()) : dflt);
  }));
}
async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
// a command that could not start (not on the PATH) or did not end well says which command, and why
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  const what = `${path.basename(cmd)} ${args.join(' ')}`;
  if (r.error) throw new Error(`${what} could not run: ${r.error.code === 'ENOENT' ? `${cmd} is not installed` : r.error.message}`);
  if (r.status !== 0) throw new Error(`${what} failed (${r.signal ? `killed by ${r.signal}` : `exit ${r.status}`})`);
};
// TinyTeX comes as .tar.xz: tar unpacks it, and on Linux GNU tar runs xz for it (macOS's tar has xz built in)
const unpackers = () => ['tar', ...(process.platform === 'darwin' ? [] : ['xz'])].filter((cmd) => !has(cmd));
const RETRY = 'check your network and run md2s setup again, or install TeX Live with your package manager (md2s uses it when pdflatex is on the PATH)';
const mb = (file) => `${(fs.statSync(file).size / 1e6).toFixed(0)} MB`;

async function installBrowser() {
  const { install, resolveBuildId, detectBrowserPlatform, Browser } = require('@puppeteer/browsers');
  const platform = detectBrowserPlatform();
  if (!platform) throw new Error(`no Chrome for Testing build for ${process.platform} ${process.arch}`);
  const buildId = await resolveBuildId(Browser.CHROME, platform, 'stable');
  console.log(`downloading Chrome for Testing ${buildId} into ${BROWSERS} …`);
  await install({ browser: Browser.CHROME, buildId, platform, cacheDir: BROWSERS });
}

async function installTinyTeX() {
  const arch = { 'linux x64': 'linux-x86_64', 'linux arm64': 'linux-arm64', 'darwin x64': 'darwin', 'darwin arm64': 'darwin' }[`${process.platform} ${process.arch}`];
  if (!arch) throw new Error(`no TinyTeX build for ${process.platform} ${process.arch}: install TeX Live (https://tug.org/texlive/)`);
  const missing = unpackers();
  if (missing.length) {
    const needs = process.platform === 'darwin' ? '`tar`' : '`tar` and `xz`';
    const lack = missing.length > 1 || process.platform === 'darwin' ? `${needs}, which ${missing.length > 1 ? 'are' : 'is'} not installed` : `${needs}, and \`${missing[0]}\` is not installed`;
    throw new Error(`TinyTeX needs ${lack}. Install ${missing.length > 1 ? 'them' : 'it'} with your package manager, or install TeX Live and let md2s use that.`);
  }
  // the latest release's tag, from where github.com/…/releases/latest redirects
  const latest = await fetch('https://github.com/rstudio/tinytex-releases/releases/latest', { method: 'HEAD', redirect: 'follow' })
    .catch((e) => { throw new Error(`could not reach github.com for TinyTeX (${e.message}): ${RETRY}`); });
  const tag = (latest.url.match(/\/tag\/(v[\w.]+)$/) || [])[1];
  if (!tag) throw new Error(`could not find the latest TinyTeX release: ${RETRY}`);
  const name = `TinyTeX-1-${arch}-${tag}.tar.xz`;
  const archive = path.join(CACHE, name);
  console.log(`downloading ${name} …`);
  try { await download(`https://github.com/rstudio/tinytex-releases/releases/download/${tag}/${name}`, archive); } catch (e) {
    fs.rmSync(archive, { force: true });
    throw new Error(`could not download ${name} (${e.message}): ${RETRY}`);
  }
  console.log(`unpacking ${mb(archive)} into ${TINYTEX} …`);
  fs.rmSync(TINYTEX, { recursive: true, force: true });   // what an earlier setup left
  fs.mkdirSync(TINYTEX, { recursive: true });
  try {
    run('tar', ['-xJf', archive, '-C', TINYTEX]);
    if (!tinytexBin() || !fs.existsSync(path.join(tinytexBin(), 'pdflatex'))) throw new Error(`unpacked, but ${TINYTEX} holds no .TinyTeX/bin/<arch>/pdflatex`);
  } catch (e) {
    // a half-unpacked TinyTeX would pass for an installed one
    fs.rmSync(TINYTEX, { recursive: true, force: true });
    throw e;
  } finally {
    fs.rmSync(archive, { force: true });
  }
}

// the packages ```algo fences need, with tlmgr (which fetches them from CTAN). Whatever fails here removes the
// whole tree, so md2s --check never reports a TinyTeX that cannot build a fence
function installTeXPackages() {
  try {
    const bin = tinytexBin();
    if (!bin) throw new Error(`no TinyTeX in ${TINYTEX}`);
    onPath(bin);
    const tlmgr = path.join(bin, 'tlmgr');
    console.log(`installing ${TEX_PACKAGES.join(' ')} into TinyTeX …`);
    try { run(tlmgr, ['install', ...TEX_PACKAGES]); } catch {
      // a TinyTeX older than TeX Live's repository has to update tlmgr itself first
      run(tlmgr, ['update', '--self']);
      run(tlmgr, ['install', ...TEX_PACKAGES]);
    }
    if (!tinytexReady()) throw new Error('tlmgr ended, but kpsewhich finds no algorithm2e.sty or standalone.cls');
  } catch (e) {
    fs.rmSync(TINYTEX, { recursive: true, force: true });
    throw new Error(`${e.message}; removed ${TINYTEX}. ${RETRY[0].toUpperCase()}${RETRY.slice(1)}.`);
  }
}

async function installCJK() {
  for (const face of ['Regular', 'Bold']) {
    const file = path.join(FONTS, `NotoSerifCJKtc-${face}.otf`);
    console.log(`downloading Noto Serif CJK TC ${face} into ${FONTS} …`);
    await download(`${CJK}NotoSerifCJKtc-${face}.otf`, file);
  }
  if (has('fc-cache')) execFileSync('fc-cache', ['-f', FONTS], { stdio: 'pipe' });
}

// a command for the system package manager, printed for the user to run
function systemCommand(pkg) {
  if (process.platform === 'darwin') return has('brew') ? `brew install ${pkg.brew}` : `install Homebrew (https://brew.sh), then brew install ${pkg.brew}`;
  if (has('apt-get')) return `sudo apt-get install ${pkg.apt}`;
  if (has('dnf')) return `sudo dnf install ${pkg.dnf}`;
  if (has('pacman')) return `sudo pacman -S ${pkg.pacman}`;
  return `install ${pkg.apt} with the system's package manager`;
}

async function setup(root, args) {
  const yes = args.includes('--yes') || args.includes('-y');
  const rows = Object.fromEntries(status().map((r) => [r.name, r]));
  const failed = [], printed = [];
  const step = async (what, fn) => { try { await fn(); } catch (e) { failed.push(`${what}: ${e.message}`); } };

  if (!rows['Chrome / Chromium'].ok && await ask(`No browser for PDF / PPTX / PNG. Download Chrome for Testing (~170 MB, ~400 MB unpacked) into ${BROWSERS}?`, yes, true)) {
    await step('Chrome for Testing', installBrowser);
  }
  if (!rows.pdflatex.ok) {
    if (await ask(`No pdflatex for \`\`\`algo fences. Download TinyTeX (~60 MB, ~250 MB unpacked) into ${TINYTEX}?`, yes, true)) {
      await step('TinyTeX', async () => { await installTinyTeX(); installTeXPackages(); });
    }
  } else if (!rows['algorithm2e, standalone'].ok) {
    // a system TeX Live needs its owner's tlmgr (md2s's own TinyTeX is on the PATH only once it has these)
    printed.push(`tlmgr install ${TEX_PACKAGES.join(' ')}    (TeX Live's tlmgr; with sudo if TeX Live is the system's)`);
  }
  if (!rows['pdftocairo (poppler)'].ok) printed.push(systemCommand({ apt: 'poppler-utils', brew: 'poppler', dnf: 'poppler-utils', pacman: 'poppler' }));
  if (!rows.ffmpeg.ok) printed.push(`${systemCommand({ apt: 'ffmpeg', brew: 'ffmpeg', dnf: 'ffmpeg', pacman: 'ffmpeg' })}    (optional: video first frames)`);
  if (!rows['Noto Serif CJK TC'].ok && await ask(`Optional: Chinese on slides needs Noto Serif CJK TC. Download it (~50 MB) into ${FONTS}?`, yes, false)) {
    await step('Noto Serif CJK TC', installCJK);
  }

  useLocalTools();
  console.log('');
  check(root);
  if (printed.length) console.log(`\nThese need the system's package manager; run them yourself:\n${printed.map((c) => `  ${c}`).join('\n')}`);
  if (failed.length) { console.log(`\nFailed:\n${failed.map((f) => `  ${f}`).join('\n')}`); process.exitCode = 1; }
}

module.exports = { useLocalTools, browser, chromium, check, setup, installTinyTeX, installTeXPackages };   // install*: for npm test
