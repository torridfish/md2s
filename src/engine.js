// md2s's Marp engine (loaded by src/config.js, which bin/md2s.js hands to marp-cli). On top of Marp it adds:
//   - the default theme (themes/default.css), with the cover photo resolved to the package's copy
//   - the math preamble's macros (tex/preamble-math.tex, plus ~/.config/md2s/macros.tex) expanded in $…$ / $$…$$;
//     ```math fences as display math; equation / align / gather numbered (1), (2) … across the deck
//   - footnotes numbered [1], [2] per slide and set at the foot of the slide that cites them; a citation is a
//     superscript [1] linking to its footnote
//   - a slide type as a class on every slide: title, section, divider (see the theme's header)
//   - a paragraph of images becomes one centred figure row; a picture is placed at 1:1 (px/2 CSS px: 2x
//     exports at 192 px/in) unless Marp's w:/h: keywords size it; an image title ![](f.png "4-01") is its run label
//   - tables: a `role` column (ref / a / b) tints rows and is dropped; {.settings} after a table
//   - fences: ```algo (algorithm2e) and ```latex {.render} rendered by tex2img.sh, ```dot as inline SVG,
//     ```prompt marked up,
//     every other fence monokai on a dark box with line numbers ({path="pkg/mod.py"} labels it,
//     {start=42} sets the first line number)
//   - inline marks: ==WIP==, [text]{.callout|.alert|.formula|.faint|.token}, # Name {.divider}
//   - a ### may leave out a ## that repeats the previous slide's; front matter `toc: true` adds a contents
//     slide after the first one, listing every ## with its ### (part numbers like (1/2) dropped)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEX = path.join(ROOT, 'tex');
// the user's own \newcommand / \DeclareMathOperator lines, for KaTeX and for LaTeX-rendered fences alike
const USER_MACROS = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'md2s', 'macros.tex');
const userMacros = () => (fs.existsSync(USER_MACROS) ? fs.readFileSync(USER_MACROS, 'utf8') : '');
const DPI = 800;
const CACHE = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'md2s');

// ---------- theme ----------
function theme() {
  const css = fs.readFileSync(path.join(ROOT, 'themes', 'default.css'), 'utf8');
  // embedded, so the cover and the fonts show in --serve and in an HTML deck opened elsewhere, not only from this disk
  return css.replaceAll('__COVER_URL__', dataUri(path.join(ROOT, 'themes', 'cover-temple-night.jpg'), 'image/jpeg'))
    .replace(/__FONT__([\w-]+\.woff2)/g, (_, file) => dataUri(path.join(ROOT, 'themes', 'fonts', file), 'font/woff2'));
}

// ---------- math macros from the LaTeX preamble ----------
function readMacros(src) {
  const macros = {};
  for (const m of src.matchAll(/\\newcommand\{\\(\w+)\}(?:\[(\d)\])?\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g)) macros[m[1]] = { n: Number(m[2] || 0), body: m[3] };
  for (const m of src.matchAll(/\\DeclareMathOperator(\*?)\{\\(\w+)\}\{([^}]*)\}/g)) macros[m[2]] = { n: 0, body: `\\operatorname${m[1]}{${m[3]}}` };
  return macros;
}
function expand(tex, macros, depth = 0) {
  if (depth > 8) return tex;
  let out = '', i = 0, changed = false;
  while (i < tex.length) {
    const m = tex.slice(i).match(/^\\([A-Za-z]+)/);
    if (!m || !macros[m[1]]) { out += m ? m[0] : tex[i]; i += m ? m[0].length : 1; continue; }
    i += m[0].length;
    const { n, body } = macros[m[1]];
    const args = [];
    for (let k = 0; k < n; k++) {
      while (tex[i] === ' ') i++;
      if (tex[i] === '{') { let d = 0, j = i; for (; j < tex.length; j++) { if (tex[j] === '{') d++; else if (tex[j] === '}' && --d === 0) break; } args.push(tex.slice(i + 1, j)); i = j + 1; }
      else { args.push(tex[i] || ''); i++; }
    }
    out += body.replace(/#(\d)/g, (_, d) => args[d - 1] ?? '');
    changed = true;
  }
  return changed ? expand(out, macros, depth + 1) : out;
}
/** Split a math body at its top-level \\ (not those inside a nested \begin … \end). */
function splitRows(body) {
  const rows = [];
  let depth = 0, last = 0;
  for (const m of body.matchAll(/\\begin\{|\\end\{|\\\\/g)) {
    if (m[0] === '\\begin{') depth++;
    else if (m[0] === '\\end{') depth--;
    else if (depth === 0) { rows.push(body.slice(last, m.index)); last = m.index + 2; }
  }
  rows.push(body.slice(last));
  return rows;
}
/** Number a display formula the LaTeX way, deck-wide: equation gets one number, align / gather one per
    row; the starred forms, \tag{…}, \notag and \nonumber opt out. KaTeX would restart at (1) per formula.
    A \label{x} on a numbered row (or one with \tag) records x → its number in `labels`; every \label is
    taken out, since KaTeX does not keep it. Returns the TeX and the numbers given here, for anchors. */
function numberEquations(tex, next, labels) {
  const given = [];
  const out = tex.replace(/\\begin\{(equation|align|gather)\}([\s\S]*?)\\end\{\1\}/g, (_, env, body) => {
    const tag = (row) => {
      const label = (row.match(/\\label\{([^}]*)\}/) || [])[1];
      row = row.replace(/\\label\{[^}]*\}/g, '');
      const manual = (row.match(/\\tag\*?\{([^}]*)\}/) || [])[1];
      if (/\\(notag|nonumber)\b/.test(row) || !row.trim()) return row.replace(/\\(notag|nonumber)\b/g, '');
      const n = manual ?? String(next());
      given.push(n);
      if (label) labels.set(label, n);
      return manual ? row : `${row} \\tag{${n}}`;
    };
    if (env === 'equation') return tag(body);
    return `\\begin{${env}*}${splitRows(body).map(tag).join('\\\\')}\\end{${env}*}`;
  });
  return { tex: out.replace(/\\label\{[^}]*\}/g, ''), given };
}
const eqId = (n) => `eq-${String(n).replace(/[^\w.-]/g, '_')}`;
const EQREF = /\\(eq)?ref\{([^}]*)\}/g;
function mathMacros(md) {
  const macros = readMacros(fs.readFileSync(path.join(TEX, 'preamble-math.tex'), 'utf8') + '\n' + userMacros());
  md.core.ruler.after('inline', 'rs_math_macros', (state) => {
    let n = 0;
    const next = () => ++n;
    const labels = new Map();
    for (const t of state.tokens) {
      // a ```math fence is display math, the same as $$ … $$
      if (t.type === 'fence' && t.info.trim().split(/\s+/)[0] === 'math') Object.assign(t, { type: 'marp_math_block', tag: 'math', markup: '$$', info: '' });
      if (t.type === 'marp_math_block') {
        const { tex, given } = numberEquations(expand(t.content, macros), next, labels);
        t.content = tex;
        t.meta = { ...(t.meta || {}), eqs: given };
      }
      if (t.type === 'inline') for (const c of t.children || []) if (c.type === 'marp_math_inline') c.content = expand(c.content, macros);
    }
    // \eqref{x} → (n), \ref{x} → n, once every number is known (so a reference may come first): plain
    // text and the footnotes' text get a link to the equation, math gets the number as text
    const number = (label) => {
      if (labels.has(label)) return labels.get(label);
      process.stderr.write(`md2s: unknown equation label ${label}\n`);
      return null;
    };
    const inMath = (tex) => tex.replace(EQREF, (_, eq, label) => {
      const k = number(label);
      return k == null ? `\\textcolor{#CC0000}{\\text{(?${label})}}` : `\\text{${eq ? `(${k})` : k}}`;
    });
    const link = (eq, label) => {
      const k = number(label);
      if (k == null) return Object.assign(new state.Token('html_inline', '', 0), { content: `<span class="alert">(?${md.utils.escapeHtml(label)})</span>` });
      return Object.assign(new state.Token('html_inline', '', 0), { content: `<a class="eqref" href="#${eqId(k)}">${eq ? `(${k})` : k}</a>` });
    };
    // markdown-it splits text at \ and { until text_join runs later, so join neighbouring text first
    const joined = (children) => children.reduce((out, c) => {
      const prev = out[out.length - 1];
      if (/^text/.test(c.type) && prev && prev.type === 'text') prev.content += c.content;
      else out.push(/^text/.test(c.type) ? Object.assign(new state.Token('text', '', 0), { content: c.content }) : c);
      return out;
    }, []);
    const inText = (children) => joined(children).flatMap((c) => {
      if (c.type === 'marp_math_inline') { c.content = inMath(c.content); return [c]; }
      if (c.type !== 'text' || !EQREF.test(c.content)) return [c];
      EQREF.lastIndex = 0;
      const out = [];
      let last = 0;
      for (const m of c.content.matchAll(EQREF)) {
        out.push(Object.assign(new state.Token('text', '', 0), { content: c.content.slice(last, m.index) }), link(m[1], m[2]));
        last = m.index + m[0].length;
      }
      out.push(Object.assign(new state.Token('text', '', 0), { content: c.content.slice(last) }));
      return out;
    });
    for (const t of state.tokens) {
      if (t.type === 'marp_math_block') t.content = inMath(t.content);
      if (t.type === 'inline' && t.children && /\\(eq)?ref\{/.test(t.content)) t.children = inText(t.children);
    }
  });
  // anchors for the numbers a display formula carries, so \eqref links land on it
  const block = md.renderer.rules.marp_math_block;
  md.renderer.rules.marp_math_block = (tokens, idx, ...rest) => {
    const ids = ((tokens[idx].meta && tokens[idx].meta.eqs) || []).map((k) => `<span class="eq-anchor" id="${eqId(k)}"></span>`).join('');
    return ids + block(tokens, idx, ...rest);
  };
}

// ---------- figures: image-only paragraphs, 1:1 size, run labels ----------
/** Pixel size of a local PNG or JPEG, or null. */
function imageSize(file) {
  let b;
  try { b = fs.readFileSync(file); } catch { return null; }
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.toString('ascii', 0, 4) === 'GIF8') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}
/** 1:1 width in CSS px for a local figure (exports are 2x: 192 px per inch on a 96 px/in canvas). */
/** An SVG's own size in CSS px: its width / height (px, pt, in, cm, mm or no unit), else its viewBox. */
function svgSize(file) {
  let tag;
  try { tag = (fs.readFileSync(file, 'utf8').match(/<svg\b[^>]*>/) || [])[0]; } catch { return null; }
  if (!tag) return null;
  const PX = { '': 1, px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };
  const len = (k) => { const m = tag.match(new RegExp(`\\s${k}="\\s*([\\d.]+)\\s*(px|pt|pc|in|cm|mm)?\\s*"`)); return m ? Number(m[1]) * PX[m[2] || ''] : null; };
  const vb = (tag.match(/viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/) || []).slice(1).map(Number);
  const w = len('width') || vb[0], h = len('height') || vb[1];
  if (w && h) return { w, h };
  return w && vb.length ? { w, h: (w * vb[1]) / vb[0] } : null;
}
/** The size md2s places a local picture at (1:1): a bitmap is taken as a 2x export (px / 2), an SVG at its
    own size. */
function naturalSize(src) {
  if (!src || /^[a-z]+:/i.test(src)) return null;
  const file = path.resolve(process.env.MD2S_DECK_DIR || process.cwd(), decodeURI(src));
  if (/\.svg$/i.test(file)) return svgSize(file);
  const size = imageSize(file);
  return size ? { w: size.w / 2, h: size.h / 2 } : null;
}

// ---------- media: PDF pages, videos ----------
// ![](fig.pdf#page=2) is that page as a vector SVG (pdftocairo); ![](clip.mp4) is a <video> in --html output and
// otherwise a poster frame (ffmpeg) with a play mark, linked to the file; without ffmpeg the player has no
// poster and a PDF / PPTX shows a link to the file. A GIF needs nothing: it moves in HTML, and a PDF / PPTX
// shows its first frame.
const VIDEO = /\.(mp4|webm|mov|m4v|ogv)$/i;
const IMAGE = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif' };
const VIDEO_TYPE = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg' };
// a local video in an HTML deck: embedded up to 20 MB (base64 makes it a third larger); a bigger one stays a
// file next to the deck, and md2s says so, since the deck no longer travels alone
const VIDEO_EMBED_MAX = 20e6;
function videoSrc(src) {
  if (/^[a-z]+:/i.test(src)) return src;
  const abs = path.resolve(process.env.MD2S_DECK_DIR || process.cwd(), decodeURI(src));
  let size;
  try { size = fs.statSync(abs).size; } catch { return src; }
  if (size > VIDEO_EMBED_MAX) {
    warn(`${src}: ${(size / 1e6).toFixed(0)} MB, kept as a file next to the HTML deck (send it along)`);
    return src;
  }
  return dataUri(abs, VIDEO_TYPE[path.extname(abs).slice(1).toLowerCase()] || 'video/mp4');
}
function cached(kind, file, extra, ext, make) {
  const abs = path.resolve(process.env.MD2S_DECK_DIR || process.cwd(), decodeURI(file));
  const stat = fs.statSync(abs);
  const h = crypto.createHash('sha1').update([kind, abs, stat.mtimeMs, extra].join('\0')).digest('hex').slice(0, 12);
  const out = path.join(CACHE, `${kind}-${h}.${ext}`);
  if (!fs.existsSync(out)) { fs.mkdirSync(CACHE, { recursive: true }); make(abs, out); }
  return out;
}
// embedded, so an HTML deck still shows them away from this machine's cache
const dataUri = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
// ![](https://youtu.be/ID): a player in --html; elsewhere its thumbnail (fetched once, cached) with a play
// mark, linked to the video, or a plain link when there is no network
const YOUTUBE = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/;
function youtubeThumb(id) {
  const out = path.join(CACHE, `youtube-${id}.jpg`);
  if (fs.existsSync(out)) return out;
  fs.mkdirSync(CACHE, { recursive: true });
  // maxresdefault is 16:9 but not always there; hqdefault always is (4:3, letterboxed)
  const get = `const [id, out] = process.argv.slice(1); (async () => { for (const n of ['maxresdefault', 'hqdefault']) {
    const r = await fetch('https://i.ytimg.com/vi/' + id + '/' + n + '.jpg').catch(() => null);
    if (r && r.ok) { require('fs').writeFileSync(out, Buffer.from(await r.arrayBuffer())); return; } } process.exit(1); })();`;
  execFileSync(process.execPath, ['-e', get, id, out], { stdio: 'pipe', timeout: 15000 });
  return out;
}
function media(t) {
  const src = t.attrGet('src') || '';
  const yt = src.match(YOUTUBE);
  if (yt) {
    t.meta = { ...(t.meta || {}), youtube: yt[1], video: src, natural: { w: 480, h: 270 } };
    try { t.attrSet('src', dataUri(youtubeThumb(yt[1]), 'image/jpeg')); } catch { t.meta.offline = true; }
    return;
  }
  if (/^[a-z]+:/i.test(src)) return;
  const [file, hash = ''] = src.split('#');
  try {
    if (/\.pdf$/i.test(file)) {
      const page = Number((hash.match(/page=(\d+)/) || [])[1] || 1);
      const svg = cached('pdf', file, page, 'svg', (abs, out) => execFileSync('pdftocairo', ['-svg', '-f', String(page), '-l', String(page), abs, out], { stdio: 'pipe' }));
      const tag = fs.readFileSync(svg, 'utf8').match(/<svg\b[^>]*>/)[0];
      const [w, h] = ['width', 'height'].map((k) => Number((tag.match(new RegExp(`\\b${k}="([\\d.]+)`)) || [])[1]));
      t.attrSet('src', dataUri(svg, 'image/svg+xml'));
      // pdftocairo writes pt: 1:1 is pt x 4/3 px
      if (w && h) t.meta = { ...(t.meta || {}), natural: { w: (w * 4) / 3, h: (h * 4) / 3 } };
    } else if (VIDEO.test(file)) {
      let poster;
      try {
        poster = cached('poster', file, '', 'png', (abs, out) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '0', '-i', abs, '-frames:v', '1', out], { stdio: 'pipe' }));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        if (process.env.MD2S_FORMAT !== 'html') warn(`${file}: no ffmpeg, so a link stands for the video (install ffmpeg for its first frame)`);
        t.meta = { ...(t.meta || {}), video: src, noPoster: true };
        return;
      }
      t.meta = { ...(t.meta || {}), video: src, poster };
      t.attrSet('src', dataUri(poster, 'image/png'));
    } else if (process.env.MD2S_FORMAT === 'html' && IMAGE[path.extname(file).slice(1).toLowerCase()]) {
      // an HTML deck carries its pictures, so it can be sent on its own; sized from the file first
      const abs = path.resolve(process.env.MD2S_DECK_DIR || process.cwd(), decodeURI(file));
      const natural = naturalSize(file);
      if (natural) t.meta = { ...(t.meta || {}), natural };
      t.attrSet('src', dataUri(abs, IMAGE[path.extname(file).slice(1).toLowerCase()]));
    }
  } catch (e) {
    t.meta = { ...(t.meta || {}), error: String(e.message).split('\n')[0] };
  }
}

function figures(md) {
  md.core.ruler.after('inline', 'rs_figures', (state) => {
    const toks = state.tokens;
    for (let i = 0; i < toks.length - 1; i++) {
      if (toks[i].type !== 'paragraph_open' || toks[i + 1].type !== 'inline') continue;
      const kids = toks[i + 1].children || [];
      const imgs = kids.filter((c) => c.type === 'image');
      if (imgs.length && kids.every((c) => c.type === 'image' || c.type === 'softbreak' || (c.type === 'text' && !c.content.trim()))) {
        if (imgs.some((c) => /^bg\b/.test(c.content))) continue; // Marp backgrounds
        toks[i].attrJoin('class', 'figures');
      }
    }
  });
  const image = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const t = tokens[idx];
    media(t);
    if (t.meta && t.meta.error) return `<span class="alert">${md.utils.escapeHtml(t.attrGet('src'))}: ${md.utils.escapeHtml(t.meta.error)}</span>`;
    if (!/\b(w|h|width|height):/.test(t.content || '')) {      // Marp size keywords win
      // --fig-w / --fig-r let a layout size the picture from the body's height (the theme's layout rules)
      const n = (t.meta && t.meta.natural) || naturalSize(t.meta && t.meta.poster ? t.meta.poster : t.attrGet('src'));
      if (n) t.attrJoin('style', `width:${n.w.toFixed(0)}px;--fig-w:${n.w.toFixed(0)}px;--fig-r:${(n.w / n.h).toFixed(4)}`);
    }
    const label = t.attrGet('title');
    if (label) t.attrs = t.attrs.filter(([k]) => k !== 'title');
    let html = image(tokens, idx, options, env, self);
    const esc = md.utils.escapeHtml;
    if (t.meta && t.meta.youtube) {
      const w = esc(t.attrGet('style') || `width:${t.meta.natural.w}px`);
      if (process.env.MD2S_FORMAT === 'html') html = `<iframe class="youtube" src="https://www.youtube-nocookie.com/embed/${t.meta.youtube}?enablejsapi=1&rel=0&playsinline=1" style="${w}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
      else if (t.meta.offline) html = `<a class="youtube-link" href="${esc(t.meta.video)}">▶ ${esc(t.meta.video)}</a>`;
      else html = `<a class="video youtube" href="${esc(t.meta.video)}"><img src="${esc(t.attrGet('src'))}" style="${w}" alt="YouTube"></a>`;
    } else if (t.meta && t.meta.noPoster) {
      html = process.env.MD2S_FORMAT === 'html'
        ? `<video src="${esc(videoSrc(t.meta.video))}" style="${esc(t.attrGet('style') || '')}" controls preload="metadata"></video>`
        : `<a class="youtube-link" href="${esc(t.meta.video)}">▶ ${esc(t.meta.video)}</a>`;
    } else if (t.meta && t.meta.video) {
      html = process.env.MD2S_FORMAT === 'html'
        ? `<video src="${esc(videoSrc(t.meta.video))}" poster="${esc(t.attrGet('src'))}" style="${esc(t.attrGet('style') || '')}" controls preload="metadata"></video>`
        : `<a class="video" href="${esc(t.meta.video)}">${html}</a>`;
    }
    return label ? `<span class="figure"><span class="run-label">${md.utils.escapeHtml(label)}</span>${html}</span>` : html;
  };
}

// ---------- tables: spans, role column, settings variant ----------
// multimd-table already sets every || colspan and ^^ rowspan, but markdown-it-attrs reads them as its own
// {rowspan=} / {colspan=} and, counting columns from the last header row only, hides cells it thinks the span
// pushed out (a ^^ row under a header with || or two rows lost its last cells). The spans are moved out of its
// sight while it runs; md2s does not let attrs set them anyway.
function spansPastAttrs(md) {
  const hide = { rowspan: 'md2s-rowspan', colspan: 'md2s-colspan' };
  const show = { 'md2s-rowspan': 'rowspan', 'md2s-colspan': 'colspan' };
  const rename = (names) => (state) => {
    for (const t of state.tokens) {
      if ((t.type === 'th_open' || t.type === 'td_open') && t.attrs) for (const a of t.attrs) a[0] = names[a[0]] || a[0];
    }
  };
  md.core.ruler.before('curly_attributes', 'rs_spans_hide', rename(hide));
  md.core.ruler.after('curly_attributes', 'rs_spans_show', rename(show));
}

// Two tables one blank line apart: multimd-table's multibody (kept for the {.settings} line under a table)
// reads the second as a row group of the first, its header as a row and its --- row as cells. A row group
// whose rows lead to a row of --- cells is a table of its own: it is closed off there, the rows above the
// --- row become its header, and the colons in that row give its columns' alignment. The rows right under
// the header are never a new table: a row of - there is a row of the table (a converter's empty cells).
const DELIMITER_CELL = /^:?-+:?$/;
function splitTables(md) {
  md.core.ruler.push('rs_split_tables', (state) => {
    const toks = state.tokens;
    const out = [];
    const make = (type, tag, nesting, level) => Object.assign(new state.Token(type, tag, nesting), { level, block: true });
    let table = null;   // the table being read; a class from a {.x} line under it belongs to the last table split off
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.type === 'table_open') table = t;
      if (t.type !== 'tbody_open' || toks[i - 1].type === 'thead_close') { out.push(t); continue; }
      let end = i;
      while (toks[end].type !== 'tbody_close') end++;
      const rows = [];   // { open, close, cells: [text] }
      for (let j = i; j < end; j++) {
        if (toks[j].type === 'tr_open') rows.push({ open: j, cells: [] });
        else if (toks[j].type === 'tr_close') rows[rows.length - 1].close = j;
        else if (toks[j].type === 'td_open') rows[rows.length - 1].cells.push(toks[j + 1].content.trim());
      }
      const d = rows.findIndex((r) => r.cells.length && r.cells.every((c) => DELIMITER_CELL.test(c)));
      if (d < 1) { out.push(t); continue; }
      const align = rows[d].cells.map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : ''));
      // a cell's column skips the columns a ^^ cell above still covers
      let covered = [];
      const aligned = (from, to, head) => {
        for (let r = from; r < to; r++) {
          const next = covered.map((n) => Math.max(0, n - 1));
          let col = 0;
          for (let j = rows[r].open; j <= rows[r].close; j++) {
            const c = toks[j];
            if (head && /^td_(open|close)$/.test(c.type)) { c.type = c.type.replace('td', 'th'); c.tag = 'th'; }
            if (c.type === 'td_open' || c.type === 'th_open') {
              while (covered[col] > 0) col++;
              if (align[col] && !c.attrGet('style')) c.attrSet('style', `text-align:${align[col]}`);
              const span = Number(c.attrGet('colspan')) || 1;
              for (let k = 0; k < span; k++) next[col + k] = (Number(c.attrGet('rowspan')) || 1) - 1;
              col += span;
            }
            out.push(c);
          }
          covered = next;
        }
      };
      // the previous row group (if any) already closed: end the table, open the next with a header
      const lv = t.level - 1;
      const open = make('table_open', 'table', 1, lv);
      if (table && table.attrs) { open.attrs = table.attrs; table.attrs = null; }
      table = open;
      out.push(make('table_close', 'table', -1, lv), open, make('thead_open', 'thead', 1, t.level));
      aligned(0, d, true);
      out.push(make('thead_close', 'thead', -1, t.level), t);
      aligned(d + 1, rows.length, false);
      i = end - 1;   // the group's tbody_close comes next, as it was
    }
    state.tokens = out;
  });
}

// markdown-it-attrs reads any {…} at the end of a line as attributes, so `User: hello {Task query}` lost its
// braces and their words. A brace group is left to it only when it is attribute syntax (.class, #id,
// key=value); any other one is masked while it runs, and stays text.
const ATTRS = /^\s*(?:(?:[.#][\w-]+|[\w-]+=(?:"[^"]*"|'[^']*'|[^\s"'}]+))\s*)+$/;
function bracesPastAttrs(md) {
  const [OPEN, CLOSE] = ['', ''];   // private-use characters, never in a deck
  const each = (state, fn) => {
    for (const t of state.tokens) if (t.type === 'inline' && t.children) for (const c of t.children) if (c.type === 'text') fn(c);
  };
  md.core.ruler.before('curly_attributes', 'rs_braces_hide', (state) => each(state, (c) => {
    if (c.content.includes('{')) c.content = c.content.replace(/\{([^{}]*)\}/g, (m, inner) => (ATTRS.test(inner) ? m : `${OPEN}${inner}${CLOSE}`));
  }));
  md.core.ruler.after('curly_attributes', 'rs_braces_show', (state) => each(state, (c) => {
    if (c.content.includes(OPEN)) c.content = c.content.replaceAll(OPEN, '{').replaceAll(CLOSE, '}');
  }));
}

// A `role` column gives each row its class (ref / a / b tint it, hl highlights, mute greys out, sep rules it
// off) and is not shown; a column headed Role with any other value in it is data, and stays.
const ROLES = ['ref', 'a', 'b', 'hl', 'mute', 'sep'];
function tables(md) {
  md.core.ruler.push('rs_tables', (state) => {
    const toks = state.tokens;
    const drop = new Set();
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].type !== 'table_open') continue;
      let end = i; while (toks[end].type !== 'table_close') end++;
      const rows = []; // [{ open, close, cells: [{ open, inline, close }] }]
      for (let j = i; j < end; j++) {
        if (toks[j].type === 'tr_open') rows.push({ open: j, cells: [] });
        if (toks[j].type === 'tr_close') rows[rows.length - 1].close = j;
        if (toks[j].type === 'th_open' || toks[j].type === 'td_open') rows[rows.length - 1].cells.push({ open: j, inline: j + 1, close: j + 2 });
      }
      // a cell's text without its {.x} (markdown-it-attrs takes the class off the tokens, not off the source)
      const text = (c) => toks[c.inline].content.replace(/\{([^{}]*)\}/g, (m, inner) => (ATTRS.test(inner) ? '' : m)).trim();
      const classOnly = (r) => r.cells.every((c) => !text(c)) && r.cells.some((c) => toks[c.open].attrGet('class'));
      // {.best} / {.second} written on a cell's bold or italic (**91.2**{.best}) belong to the cell
      for (const r of rows) for (const c of r.cells) {
        let depth = 0;
        for (const t of toks[c.inline].children || []) {
          if (depth === 0 && t.nesting === 1) {
            const cls = (t.attrGet('class') || '').split(/\s+/).filter(Boolean);
            const own = cls.filter((x) => x === 'best' || x === 'second');
            if (own.length) {
              for (const x of own) toks[c.open].attrJoin('class', x);
              const rest = cls.filter((x) => !own.includes(x));
              if (rest.length) t.attrSet('class', rest.join(' ')); else t.attrs = t.attrs.filter((a) => a[0] !== 'class');
            }
          }
          depth += t.nesting;
        }
      }
      // `{.settings}` right under the table: GFM made it a last row whose cell took the class
      const last = rows[rows.length - 1];
      if (rows.length > 2 && classOnly(last)) {
        for (const c of last.cells) { const cls = toks[c.open].attrGet('class'); if (cls) toks[i].attrJoin('class', cls); }
        for (let k = last.open; k <= last.close; k++) drop.add(k);
        // the row alone in its row group (a blank line above it): the group goes too
        if (toks[last.open - 1].type === 'tbody_open' && toks[last.close + 1].type === 'tbody_close') { drop.add(last.open - 1); drop.add(last.close + 1); }
        rows.pop();
      }
      // a header of empty cells (GFM wants a header row; a converter writes | | |) is no header: the table
      // goes without one rather than show an empty band, and its rows stay rows
      if (toks[i + 1].type === 'thead_open') {
        let hc = i + 1;
        while (toks[hc].type !== 'thead_close') hc++;
        const head = rows.filter((r) => r.open < hc);
        if (rows.length > head.length && head.every((r) => r.cells.every((c) => !text(c)))) {
          for (let k = i + 1; k <= hc; k++) drop.add(k);
          rows.splice(0, head.length);
        }
      }
      // each cell's column, counting the columns a ^^ cell above still covers and the || spans before it
      const columns = () => {
        let covered = [];
        for (const r of rows) {
          const next = covered.map((n) => Math.max(0, n - 1));
          let col = 0;
          for (const c of r.cells) {
            while (covered[col] > 0) col++;
            c.col = col;
            c.span = Number(toks[c.open].attrGet('colspan')) || 1;
            c.rows = Number(toks[c.open].attrGet('rowspan')) || 1;
            for (let k = 0; k < c.span; k++) next[col + k] = c.rows - 1;
            col += c.span;
          }
          covered = next;
        }
      };
      columns();
      const at = (r, col) => r.cells.find((c) => c.col <= col && col < c.col + c.span);
      const isBody = (r) => r.cells.length && toks[r.cells[0].open].type === 'td_open';
      const setRows = (c, n) => { c.rows = n; if (n > 1) toks[c.open].attrSet('rowspan', String(n)); else toks[c.open].attrs = (toks[c.open].attrs || []).filter((a) => a[0] !== 'rowspan'); };
      // a row of nothing but a class inside the table (| {.sep} |) is no row: the class goes to the row under
      // it (sep: a rule above that row). A cell above that spans through it loses that row; a ^^ under it, which
      // multimd joined to its empty cell, joins the cell above it instead.
      for (let d = rows.length - 2; d >= 1; d--) {
        const r = rows[d];
        if (!isBody(r) || !isBody(rows[d - 1]) || !classOnly(r)) continue;
        for (let k = 0; k < d; k++) for (const c of rows[k].cells) if (k + c.rows - 1 >= d) setRows(c, c.rows - 1);
        for (const c of r.cells) {
          if (c.rows < 2) continue;
          for (let k = d - 1; k >= 0; k--) {
            const up = rows[k].cells.find((u) => u.col === c.col && k + u.rows - 1 >= d - 1);
            if (up) { setRows(up, up.rows + c.rows - 1); break; }
          }
        }
        for (const c of r.cells) { const cls = toks[c.open].attrGet('class'); if (cls) toks[rows[d + 1].open].attrJoin('class', cls); }
        for (let k = r.open; k <= r.close; k++) drop.add(k);
        rows.splice(d, 1);
      }
      columns();
      // a row wider than the header extends the table by columns without a header cell
      const width = (rs) => Math.max(0, ...rs.flatMap((r) => r.cells.map((c) => c.col + c.span)));
      const headRows = rows.filter((r) => !isBody(r));
      if (headRows.length) {
        const wide = rows.filter((r) => isBody(r) && width([r]) > width(headRows));
        if (wide.length) warn(`a table row has more cells than its header (${width(wide)} columns, the header ${width(headRows)}): the extra cells have no header above them (row "${wide[0].cells.map(text).join(' | ')}")`);
      }
      // a `role` column (headed role in any header row) only when every value in the body rows is a role word,
      // x, - or empty (an untinted row): a table whose Role column holds data keeps it. A header row's cell in
      // it is the grouped header's placeholder (x, -, ^^) and goes with the column.
      const UNTINTED = ['', 'x', '-'];
      const roleWords = (s) => UNTINTED.includes(s) || s.split(/\s+/).every((w) => ROLES.includes(w));
      const head = rows.some((r) => !isBody(r)) ? rows.filter((r) => !isBody(r)) : rows.slice(0, 1);
      const roleHead = head.flatMap((r) => r.cells).find((c) => text(c).toLowerCase() === 'role');
      let rc = roleHead ? roleHead.col : -1;
      if (rc >= 0 && !rows.filter((r) => isBody(r) && r !== rows[0]).every((r) => { const c = at(r, rc); return !c || c.col !== rc || roleWords(text(c)); })) rc = -1;
      if (rc >= 0) for (const r of rows) {
        const c = at(r, rc);
        if (!c) continue;   // a ^^ above covers it
        if (c.span > 1) { toks[c.open].attrSet('colspan', String(c.span - 1)); continue; }   // a || across it: one column less
        if (c !== roleHead && !UNTINTED.includes(text(c)) && isBody(r)) toks[r.open].attrJoin('class', text(c));
        for (const x of [c.open, c.inline, c.close]) drop.add(x);
      }
      if ((toks[i].attrGet('class') || '').includes('settings')) {
        // settings sets its own alignment (left, short columns centred): the separator row's colons give way
        for (const r of rows) for (const c of r.cells) {
          const st = (toks[c.open].attrGet('style') || '').replace(/text-align:\s*\w+;?/, '').trim();
          if (st) toks[c.open].attrSet('style', st); else toks[c.open].attrs = (toks[c.open].attrs || []).filter((a) => a[0] !== 'style');
        }
        // a column is short when each body cell that starts in it (one column wide) holds 3 characters or fewer;
        // a cell a ^^ above covers, or a || spans, does not count
        const body = rows.filter(isBody);
        for (let col = 0; col < width(rows); col++) {
          if (col === rc || !body.length) continue;
          const cells = body.map((r) => r.cells.find((c) => c.col === col && c.span === 1)).filter(Boolean);
          if (cells.length && cells.every((c) => text(c).length <= 3)) for (const c of cells) toks[c.open].attrJoin('class', 'c');
        }
      }
      i = end;
    }
    if (drop.size) state.tokens = toks.filter((_, k) => !drop.has(k));
  });
  // A [Caption] inside the <table> is as wide as the table: under a narrow table it folds into many lines, and
  // made wider it widens the table. So the caption leaves the table for a p.caption beside it, above or below
  // as written, and the two go in one div.captioned: one block for a layout's cells, the caption as wide as
  // the body or the area. A table without a caption is left as it is.
  md.core.ruler.push('rs_captions', (state) => {
    const toks = state.tokens;
    if (!toks.some((t) => t.type === 'caption_open')) return;
    const out = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.type !== 'table_open' || !toks[i + 1] || toks[i + 1].type !== 'caption_open') { out.push(t); continue; }
      let end = i; while (toks[end].type !== 'table_close') end++;
      const [cap, inline] = [toks[i + 1], toks[i + 2]];
      const below = /caption-side:\s*bottom/.test(cap.attrGet('style') || '');
      const block = (type, tag, nesting) => Object.assign(new state.Token(type, tag, nesting), { level: t.level, block: true });
      const p = [block('paragraph_open', 'p', 1), Object.assign(inline, { level: t.level + 1 }), block('paragraph_close', 'p', -1)];
      p[0].attrSet('class', 'caption');
      if (cap.attrGet('id')) p[0].attrSet('id', cap.attrGet('id'));
      const div = block('rs_captioned_open', 'div', 1);
      div.attrSet('class', 'captioned');
      const table = [t, ...toks.slice(i + 4, end + 1)];   // past caption_open, inline, caption_close
      out.push(div, ...(below ? [...table, ...p] : [...p, ...table]), block('rs_captioned_close', 'div', -1));
      i = end;
    }
    state.tokens = out;
  });
}

// ---------- fences ----------
function texImage(kind, body, scale) {
  const pre = fs.readFileSync(path.join(TEX, kind === 'algo' ? 'preamble-algo.tex' : 'preamble-math.tex'), 'utf8') + userMacros();
  const h = crypto.createHash('sha1').update([kind, body, pre, DPI].join('\0')).digest('hex').slice(0, 12);
  const base = path.join(CACHE, `${kind}-${h}`);
  if (!fs.existsSync(base + '.png')) {
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(base + '.body.tex', body + '\n');
    try {
      execFileSync(path.join(ROOT, 'scripts', 'tex2img.sh'), [kind === 'algo' ? '--algo' : '--body', base + '.body.tex', '-o', base, '--dpi', String(DPI)], { stdio: 'pipe' });
    } catch (e) {
      // tex2img.sh names a missing tool or package on stderr, else the log holds the LaTeX error
      const said = String(e.stderr || '').trim();
      const log = /not found|missing/.test(said) ? said.split('\n')[0]
        : fs.existsSync(base + '.log') ? fs.readFileSync(base + '.log', 'utf8').split('\n').filter((l) => /^!|^l\.\d+/.test(l)).slice(0, 4).join(' ') : said || String(e.message);
      return `<pre class="prompt" style="color:#CC0000">LaTeX failed (${kind}): ${log.replace(/</g, '&lt;')}</pre>`;
    }
  }
  const png = fs.readFileSync(base + '.png');
  const w = png.readUInt32BE(16); // PNG IHDR width
  return `<img class="${kind}" src="data:image/png;base64,${png.toString('base64')}" style="width:${((w / DPI) * 96 * scale).toFixed(1)}px">`;
}

function promptHtml(text, esc) {
  return text.split('\n').map((line) => {
    let out = '';
    const m = line.match(/^(System|User|Assistant|Human|AI):/);
    if (m) { out += `<span class="role">${m[0]}</span>`; line = line.slice(m[0].length); }
    for (const part of line.split(/(\{[^{}]+\}|<\|[^|]+\|>)/)) {
      if (!part) continue;
      if (/^\{.*\}$/.test(part)) out += `<span class="placeholder">${esc(part)}</span>`;
      else if (/^<\|.*\|>$/.test(part)) out += `<span class="token">${esc(part)}</span>`;
      else out += esc(part);
    }
    return out;
  }).join('\n');
}

/** Wrap highlighted code in per-line spans, closing and reopening spans that cross a newline. */
function numberLines(html) {
  const lines = [];
  let cur = '', open = [];
  for (const piece of html.split(/(<[^>]+>|\n)/)) {
    if (piece === '\n') { lines.push(cur + '</span>'.repeat(open.length)); cur = open.join(''); continue; }
    if (/^<span\b/.test(piece)) open.push(piece);
    else if (piece === '</span>') open.pop();
    cur += piece;
  }
  if (cur.replace(/<[^>]+>/g, '').length || !lines.length) lines.push(cur + '</span>'.repeat(open.length));
  return lines.map((l) => `<span class="line">${l || ' '}</span>`).join('');
}

// ---------- diagrams: ```dot as inline SVG ----------
// Rendered at build time (Graphviz as WASM) and cached; inline SVG keeps the labels vector and selectable in the
// PDF. A diagram is placed at 1:1, scaled by {scale=…}.
function diagram(kind, body, scale) {
  const h = crypto.createHash('sha1').update([kind, body].join('\0')).digest('hex').slice(0, 12);
  const base = path.join(CACHE, `${kind}-${h}`);
  try {
    if (!fs.existsSync(base + '.svg')) {
      fs.mkdirSync(CACHE, { recursive: true });
      fs.writeFileSync(base + '.svg', execFileSync(process.execPath, [path.join(__dirname, 'dot2svg.mjs')], { input: body, stdio: 'pipe' }));
    }
  } catch (e) {
    const msg = String(e.stderr || e.message).split('\n').filter((l) => l.trim()).slice(0, 3).join(' ');
    return `<pre class="prompt" style="color:#CC0000">${kind} failed: ${msg.replace(/</g, '&lt;')}</pre>`;
  }
  // Graphviz lays text out with Times metrics and names Times; the bundled serif has them, so it sets the
  // labels the same on a machine without Times
  let svg = fs.readFileSync(base + '.svg', 'utf8').replace(/^[\s\S]*?(?=<svg\b)/, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/font-family="Times,serif"/g, `font-family="'md2s Serif',Times,serif"`);
  // the natural width: Graphviz gives pt
  const pt = svg.match(/<svg\b[^>]*\bwidth="([\d.]+)pt"/);
  const w = (pt ? (Number(pt[1]) * 4) / 3 : 0) * scale;
  svg = svg.replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(width|height|style)="[^"]*"/g, '')
    .replace(/<svg\b/, `<svg${w ? ` style="width:${w.toFixed(1)}px"` : ''}`));
  return `<div class="diagram">${svg}</div>\n`;
}

function fences(md) {
  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const t = tokens[idx];
    const lang = (t.info || '').trim().split(/\s+/)[0].toLowerCase();
    const cls = t.attrGet('class') || '';
    const scale = Number(t.attrGet('scale')) || 1;
    if (lang === 'algo' || lang === 'algorithm') return texImage('algo', t.content.replace(/\n$/, ''), scale) + '\n';
    if ((lang === 'latex' || lang === 'tex') && /\brender\b/.test(cls)) return texImage('tex', t.content.replace(/\n$/, ''), scale) + '\n';
    if (lang === 'dot' || lang === 'graphviz') return diagram('dot', t.content, scale);
    if (lang === 'prompt') return `<pre class="prompt">${promptHtml(t.content.replace(/\n$/, ''), md.utils.escapeHtml)}</pre>\n`;
    const label = t.attrGet('path');
    const start = Math.max(1, parseInt(t.attrGet('start'), 10) || 1);
    t.attrs = (t.attrs || []).filter(([k]) => !['path', 'start', 'scale'].includes(k));
    const src = t.content.replace(/\n$/, '').split('\n');
    const digits = String(start + src.length - 1).length;
    const longest = Math.max(...src.map((l) => l.replace(/\t/g, '    ').length));
    // line numbers are a gutter column before the code, not part of each line: selecting or copying code
    // (in the PDF too, where text follows the drawing order) does not pick them up
    // front matter line-numbers: false turns them off for the deck; {.no-lines} / {.lines} decide one block
    const deck = !(env && env.md2s && env.md2s['line-numbers'] === false);
    const numbered = /\bno-lines\b/.test(cls) ? false : /(^|\s)lines\b/.test(cls) ? true : deck;
    const gutter = numbered ? `<span class="ln" aria-hidden="true">${src.map((_, k) => start + k).join('\n')}</span>` : '';
    const html = fence(tokens, idx, options, env, self)
      .replace(/<pre\b/, `<pre style="--code-cols: ${(longest + (numbered ? digits + 1.6 : 0)).toFixed(1)}"`)
      .replace(/(<code[^>]*)>([\s\S]*?)(<\/code>)/, (_, a, body, c) => `${gutter}${a}>${numberLines(body.replace(/\n$/, ''))}${c}`);
    return '<div class="code"><div class="code-box">' + (label ? `<div class="code-path">${md.utils.escapeHtml(label)}</div>` : '') + html + '</div></div>\n';
  };
}

// ---------- lists and consequence arrows ----------
// List markers are drawn by the theme from a counter, so an ordered list that resumes (3. after a paragraph)
// starts its counter here. ➔ is drawn as a plain →; a paragraph opening with it hangs its wrapped lines
// after the arrow, and right after a list it lines up with the list's text.
function marks(md) {
  md.core.ruler.after('inline', 'rs_marks', (state) => {
    const toks = state.tokens;
    toks.forEach((t, i) => {
      if (t.type === 'ordered_list_open') {
        const start = parseInt(t.attrGet('start'), 10);
        if (start > 1) t.attrJoin('style', `counter-reset: item ${start - 1}`);
      }
      if (t.type !== 'inline') return;
      const kids = t.children || [];
      const open = toks[i - 1];
      if (open && open.type === 'paragraph_open' && !open.hidden && kids[0] && kids[0].type === 'text' && /^➔\s*/.test(kids[0].content)) {
        kids[0].content = kids[0].content.replace(/^➔\s*/, '');
        const mark = new state.Token('html_inline', '', 0);
        mark.content = '<span class="then-mark">→</span>';
        kids.unshift(mark);
        open.attrJoin('class', 'then');
      }
      for (const c of kids) if (c.type === 'text') c.content = c.content.replaceAll('➔', '→');
    });
  });
}

// ---------- source rewrites: repeated titles, table of contents, thanks page ----------
const DIVIDED = /^\s*headingDivider:\s*[1-6]|<!--\s*headingDivider:\s*[1-6]/m;

/** Walk the Markdown lines outside the front matter, fences and HTML comments, calling fn(line, i). */
function eachLine(lines, fn) {
  let i = 0, fence = null, comment = false;
  if (lines[0] === '---') { i = lines.indexOf('---', 1) + 1; if (i === 0) i = lines.length; }
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (fence) { if (l.trim().startsWith(fence)) fence = null; continue; }
    if (comment) { if (l.includes('-->')) comment = false; continue; }
    const f = l.match(/^\s*(```+|~~~+)/);
    if (f) { fence = f[1]; continue; }
    if (/^\s*<!--/.test(l) && !l.includes('-->')) { comment = true; continue; }
    fn(l, i);
  }
}

/** Titles carry over so a deck writes each one once:
    - a ### that opens a new slide may leave out its ## when the ## stays the same: the previous ## is
      repeated before it (with headingDivider, a ### after another ### under one ##; without it, a ###
      on a slide that has no ## of its own);
    - a --- not followed by a heading continues the subsection on a new slide with the same ## and ###,
      and every part's ### gets (1/N), (2/N) …;
      with headingDivider a --- right before a # or ## is dropped (the heading breaks the slide). */
function repeatTitles(src) {
  const lines = src.split('\n');
  const divided = DIVIDED.test(src);
  const edits = []; // [line, lines to delete, lines to insert]
  let h2 = null, h3 = null, hasH2 = false, seenH3 = false;
  const parts = []; // subsections continued after a ---: { line, text, n }
  let part = null;
  const nextLine = (i) => { let j = i + 1; while (j < lines.length && !lines[j].trim()) j++; return lines[j] || ''; };
  // without headingDivider a ## does not start a slide: slides that get a second ## (a deck with no --- is
  // one slide) are counted for a warning
  let slideH2s = 0;
  const crowded = [];
  eachLine(lines, (l, i) => {
    if (/^\s*(---|\*\*\*|___)\s*$/.test(l)) {
      const next = nextLine(i);
      // a --- at the end of the deck, or right before another, would open a slide with nothing on it
      // (and, after a subsection, an empty continuation numbered as a part): it is dropped
      if (!next.trim() || /^\s*(---|\*\*\*|___)\s*$/.test(next)) { edits.push([i, 1, []]); return; }
      hasH2 = false; seenH3 = false; slideH2s = 0;
      // with headingDivider a # or ## breaks the slide itself: the --- in front would leave an empty slide
      if (divided && /^#{1,2}\s/.test(next)) { edits.push([i, 1, []]); return; }
      if (divided && h2 && /^###\s/.test(next)) { edits.push([i, 1, [`## ${h2}`]]); hasH2 = true; return; }
      if (h2 && h3 && !/^#/.test(next)) {
        // with headingDivider the ## breaks the slide itself; a --- as well would leave an empty slide
        if (part.n === 1) parts.push(part);
        const sub = { part, k: ++part.n };   // written out once the number of parts is known
        if (divided) edits.push([i, 1, [`## ${h2}`, '', sub, '']]);
        else edits.push([i + 1, 0, ['', `## ${h2}`, '', sub, '']]);
        hasH2 = true; seenH3 = true;
      }
      return;
    }
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (!h) return;
    if (h[1] === '#') { h2 = null; h3 = null; hasH2 = false; seenH3 = false; }
    else if (h[1] === '##') {
      h2 = h[2]; h3 = null; hasH2 = true; seenH3 = false;
      if (!divided && ++slideH2s === 2) crowded.push(h[2]);
    }
    else {
      if (h2 && (divided ? seenH3 : !hasH2)) { edits.push([i, 0, [`## ${h2}`, '']]); hasH2 = true; }
      h3 = h[2]; seenH3 = true;
      part = { line: i, text: h3, n: 1 };
    }
  });
  if (crowded.length) {
    warn(`${crowded.length} slide${crowded.length > 1 ? 's have' : ' has'} a second ## (first: "## ${crowded[0]}"), and without `
      + 'headingDivider a ## does not start a slide: add headingDivider: 2 to the front matter, or --- between slides');
  }
  for (const pt of parts) lines[pt.line] = `### ${pt.text} (1/${pt.n})`;
  const line = (x) => (typeof x === 'string' ? x : `### ${x.part.text} (${x.k}/${x.part.n})`);
  for (const [i, del, add] of edits.reverse()) lines.splice(i, del, ...add.map(line));
  return lines.join('\n');
}

// ---------- citations: [@key] against a BibTeX bibliography, and a References page ----------
// Front matter `bibliography:` is a .bib path (relative to the deck), a list of them, or BibTeX written in
// place; `citation-style:` is apa (the default), ieee, vancouver, harvard1 or a .csl file. Every [@a] or
// [@a; @b] becomes a marker linking to its entry: (Author et al., 2017) in an author-date style, [1] in a
// numeric one, numbered in citing order. The cited works are listed on References slides at the end
// (before a --thanks page), six to a slide. Footnotes know nothing of this. An unknown key shows as
// [?key] and is reported on stderr; the build goes on.
const CITE = /\[(@[^\s;\]]+(?:\s*;\s*@[^\s;\]]+)*)\]/g;
const REFS_PER_SLIDE = 6;
function frontMatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  try { const v = require('yaml').parse(m[1]); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
// A deck whose first line is --- opens with front matter, as in every Markdown tool. But when what follows
// (up to the next ---, or to the end) is not settings, the --- was meant as a slide break, and Marp would
// swallow the slides as YAML (## is a YAML comment): the --- is dropped, so they stay slides.
function leadingRule(src) {
  const m = src.match(/^---[ \t]*\r?\n([\s\S]*?)(?:\r?\n---[ \t]*(?:\r?\n|$)|$)/);
  if (!m || !m[1].trim()) return src;
  let v;
  try { v = require('yaml').parse(m[1]); } catch { v = null; }
  const settingsLike = v && typeof v === 'object' && !Array.isArray(v) && !/^#{2,6}\s/m.test(m[1]);
  if (settingsLike) return src;
  warn('the deck starts with --- but what follows is not front matter (key: value lines); md2s reads it as slides');
  return src.replace(/^---[ \t]*\r?\n/, '');
}
// A deck's settings: md2s's defaults, then the user's ~/.config/md2s/config.yaml, then the front matter.
const DEFAULTS = { 'toc-standalone': ['TODO', 'Appendix', 'References'] };
const USER_CONFIG = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'md2s', 'config.yaml');
function settings(src) {
  let user = {};
  try { user = require('yaml').parse(fs.readFileSync(USER_CONFIG, 'utf8')) || {}; } catch (e) {
    if (e.code !== 'ENOENT') warn(`${USER_CONFIG}: ${e.message}`);
  }
  return { ...DEFAULTS, ...user, ...frontMatter(src) };
}
function cslStyle(name) {
  const cfg = require('@citation-js/core').plugins.config.get('@csl');
  const file = name === 'ieee' ? path.join(ROOT, 'csl', 'ieee.csl')
    : /\.csl$/.test(name) ? path.resolve(process.env.MD2S_DECK_DIR || process.cwd(), name) : null;
  if (file) {
    const id = `md2s-${crypto.createHash('sha1').update(file).digest('hex').slice(0, 8)}`;
    if (!cfg.styles.has(id)) cfg.styles.add(id, fs.readFileSync(file, 'utf8'));
    return id;
  }
  if (!cfg.styles.has(name)) throw new Error(`unknown citation-style ${name}: use apa, ieee, vancouver, harvard1 or a .csl file`);
  return name;
}
// MD2S_QUIET: the layout check renders the deck a second time, and the build has said all this already
const warn = (msg) => { if (!process.env.MD2S_QUIET) process.stderr.write(`md2s: ${msg}\n`); };
function citations(src) {
  const meta = settings(src);
  if (!meta.bibliography) return src;
  let Cite, plugins, cite, style;
  try {
    ({ Cite, plugins } = require('@citation-js/core'));
    require('@citation-js/plugin-bibtex');
    require('@citation-js/plugin-csl');
  } catch (e) {
    warn(`bibliography: the citation packages are missing (run npm install in ${ROOT}): ${String(e.message).split('\n')[0]}`);
    return src;
  }
  try {
    const deck = process.env.MD2S_DECK_DIR || process.cwd();
    const bib = (Array.isArray(meta.bibliography) ? meta.bibliography : [meta.bibliography]).map(String)
      .map((b) => (/@\w+\s*\{/.test(b) ? b : fs.readFileSync(path.resolve(deck, b), 'utf8')));
    cite = new Cite(bib.join('\n'));
    style = cslStyle(String(meta['citation-style'] || 'apa'));
  } catch (e) {
    warn(`bibliography: ${e.message}`);
    return src;
  }
  const known = new Set(cite.data.map((e) => e.id));
  // first pass: the cited keys, in citing order (a numeric style numbers them so)
  const lines = src.split('\n');
  const cited = [];
  const outsideCode = (l, fn) => l.split(/(`+[^`]*`+)/).map((part, k) => (k % 2 ? part : fn(part))).join('');
  eachLine(lines, (l) => outsideCode(l, (t) => t.replace(CITE, (_, keys) => {
    for (const k of keys.split(';').map((x) => x.trim().slice(1))) if (known.has(k) && !cited.includes(k)) cited.push(k);
    return '';
  })));
  const engine = plugins.config.get('@csl').engine(cite.data, style, 'en-US', 'html');
  engine.updateItems(cited);
  const numeric = /citation-format="numeric"/.test(plugins.config.get('@csl').styles.get(style));
  const marker = (k) => {
    const text = engine.makeCitationCluster([{ id: k }]);
    return `<a href="#ref-${k}">${numeric ? text.replace(/^\[|\]$/g, '') : text.replace(/^\(|\)$/g, '')}</a>`;
  };
  eachLine(lines, (l, i) => {
    lines[i] = outsideCode(l, (t) => t.replace(CITE, (_, keys) => {
      const parts = keys.split(';').map((x) => x.trim().slice(1)).map((k) => {
        if (known.has(k)) return marker(k);
        warn(`unknown citation key ${k}`);
        return `<span class="alert">?${k}</span>`;
      });
      return `<span class="cite">${numeric ? `[${parts.join(', ')}]` : `(${parts.join('; ')})`}</span>`;
    }));
  });
  if (!cited.length) return lines.join('\n');
  // the References slides: links made clickable, each entry an anchor for its markers
  const [params, entries] = engine.makeBibliography();
  const html = entries.map((e, n) => e.trim()
    .replace(/(^|[\s>(])(https?:\/\/[^\s<]+?)([.,;]?)(?=[\s<]|$)/g, '$1<a href="$2">$2</a>$3')
    .replace(/^<div class="csl-entry">/, `<div class="csl-entry" id="ref-${params.entry_ids[n][0]}">`));
  const pages = [];
  for (let k = 0; k < html.length; k += REFS_PER_SLIDE) pages.push(html.slice(k, k + REFS_PER_SLIDE));
  const divided = DIVIDED.test(src);
  const slides = pages.map((page, k) => `${k === 0 && divided ? '' : '---\n\n'}## References\n${pages.length > 1 ? `### Works cited (${k + 1}/${pages.length})\n` : ''}\n<div class="references${numeric ? ' numeric' : ''}">\n${page.join('\n')}\n</div>\n`);
  return `${lines.join('\n').replace(/\s*$/, '')}\n\n${slides.join('\n')}`;
}

/** front matter `toc: true` (or `toc: Title`): a contents slide after the first slide, filled in by tocs() */
function insertToc(src) {
  const toc = settings(src).toc;
  if (!toc || /^(false|no|off)$/i.test(String(toc))) return src;
  const title = toc === true || /^(true|yes|on)$/i.test(String(toc)) ? 'Outline' : String(toc);
  const lines = src.split('\n');
  const divided = DIVIDED.test(src);
  let started = false, at = -1;
  eachLine(lines, (l, i) => {
    if (at >= 0) return;
    const brk = /^\s*(---|\*\*\*|___)\s*$/.test(l) || (divided && /^#{1,2}\s/.test(l));
    if (started && brk) at = i;
    else if (/^#{1,6}\s/.test(l) || (l.trim() && !/^\s*<!--.*-->\s*$/.test(l))) started = true;
  });
  const slide = `## ${title}\n\n<div class="toc"></div>\n`;
  if (at < 0) return `${src.replace(/\s*$/, '')}\n\n${divided ? '' : '---\n\n'}${slide}`;
  lines.splice(at, 0, ...(divided ? [slide] : ['---', '', slide]));
  return lines.join('\n');
}

/** Fill the contents slide. Without section pages: every later slide's ## with its ### under it, a run of
    slides with the same ## as one entry. With section pages (# alone): each section is an entry with the
    ### of its slides under it (## is a slide category, which would only repeat); slides before the first
    section keep the ## form, and the References slides are an entry of their own. A section with no
    slides after it (the thanks page) and {.divider} pages are left out. Part numbers like (1/2) are
    dropped, and each line links to its first slide. */
function tocs(md) {
  md.core.ruler.after('marpit_slide', 'rs_toc', (state) => {
    const toks = state.tokens;
    const at = toks.findIndex((t) => t.type === 'html_block' && /<div class="toc"><\/div>/.test(t.content));
    if (at < 0) return;
    // one record per slide after the contents slide: its first #, ## and ###, and whether it is References
    const slides = [];
    let slide = 0, tocSlide = 0;
    toks.forEach((t, i) => {
      if (t.type === 'marpit_slide_open') { slide++; if (tocSlide) slides.push({ slide }); }
      if (i === at) tocSlide = slide;
      const cur = slides[slides.length - 1];
      if (!tocSlide || slide <= tocSlide || !cur) return;
      if (t.type === 'html_block' && /class="references/.test(t.content)) cur.refs = true;
      if (t.type !== 'heading_open' || cur[t.tag] || !['h1', 'h2', 'h3'].includes(t.tag)) return;
      // render the heading's own parsed tokens: md.renderInline would parse again and reset Marp's directives
      const part = /\s*\(\d+\s*\/\s*\d+\)\s*$/;
      cur[t.tag] = {
        text: toks[i + 1].content.replace(/\s*\{[^}]*\}\s*$/, '').replace(part, ''),
        html: state.md.renderer.renderInline(toks[i + 1].children || [], state.md.options, state.env).trim().replace(part, ''),
        divider: /\bdivider\b/.test(t.attrGet('class') || '') || /\{[^}]*\.divider[^}]*\}\s*$/.test(toks[i + 1].content),
      };
    });
    const sectioned = slides.some((sl, k) => sl.h1 && !sl.h1.divider && slides.slice(k + 1).some((x) => !x.h1 && (x.h2 || x.h3)));
    const groups = [];
    let section = null, last = null;
    const sub = (g, h, sl) => { if (h && !g.subs.some((x) => x.text === h.text)) g.subs.push({ ...h, slide: sl.slide }); };
    // ## categories that belong to the whole deck (toc-standalone: TODO, Appendix, References by default)
    // are entries of their own after everything else, wherever their slides are
    const standalone = new Set([].concat((state.env.md2s || {})['toc-standalone'] || []).map((x) => String(x).toLowerCase()));
    const tail = [];
    for (const sl of slides) {
      if (!sl.h1 && (sl.refs || (sl.h2 && standalone.has(sl.h2.text.toLowerCase())))) {
        const key = sl.h2 ? sl.h2.text.toLowerCase() : 'references';
        let g = tail.find((x) => x.key === key);
        if (!g) tail.push((g = { ...(sl.h2 || { text: 'References', html: 'References' }), slide: sl.slide, subs: [], key }));
        if (!sl.refs) sub(g, sl.h3, sl);
        last = null;
        continue;
      }
      if (sl.h1) {
        last = null;
        if (sl.h1.divider) continue;
        section = sectioned ? { ...sl.h1, slide: sl.slide, subs: [], section: true } : null;
        if (section) groups.push(section);
        continue;
      }
      if (section) { sub(section, sl.h3 || sl.h2, sl); continue; }
      if (sl.h2 && !(last && last.text === sl.h2.text && last.end === sl.slide - 1)) groups.push((last = { ...sl.h2, slide: sl.slide, subs: [] }));
      if (last) { last.end = sl.slide; sub(last, sl.h3, sl); }
    }
    const li = (g) => `<li><a href="#${g.slide}">${g.html}</a>` +
      (g.subs.length ? `<ul>${g.subs.map((x) => `<li><a href="#${x.slide}">${x.html}</a></li>`).join('')}</ul>` : '') + '</li>';
    // a section with nothing after it (the thanks page) is not an entry
    toks[at].content = `<div class="toc"><ul>${[...groups.filter((g) => !g.section || g.subs.length), ...tail].map(li).join('')}</ul></div>\n`;
  });
}

// ---------- callouts: > [!NOTE] … (GitHub / Obsidian) ----------
// A blockquote whose first line is [!type] Title becomes a coloured box; any other blockquote stays the lead.
// The Obsidian types fold into GitHub's five colours.
const CALLOUTS = {
  note: 'note', info: 'note', example: 'note', quote: 'note', cite: 'note',
  tip: 'tip', hint: 'tip', success: 'tip', check: 'tip', done: 'tip',
  important: 'important', abstract: 'important', summary: 'important', tldr: 'important', question: 'important', help: 'important', faq: 'important',
  warning: 'warning', attention: 'warning', todo: 'warning',
  caution: 'caution', danger: 'caution', error: 'caution', failure: 'caution', fail: 'caution', missing: 'caution', bug: 'caution',
};
function callouts(md) {
  md.core.ruler.after('inline', 'rs_callouts', (state) => {
    const toks = state.tokens;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.type !== 'blockquote_open' || toks[i + 1]?.type !== 'paragraph_open' || toks[i + 2]?.type !== 'inline') continue;
      const inl = toks[i + 2], kids = inl.children || [];
      // the marker may be split over several text tokens ([, !note, ]) before text_join runs
      let head = '', k = 0, m = null;
      for (; k < kids.length && /^text/.test(kids[k].type); k++) {
        head += kids[k].content;
        if ((m = head.match(/^\[!(\w+)\][+-]?[ \t]*/))) break;
        if (!/^\[!?\w*\]?$/.test(head)) break;
      }
      if (!m) continue;
      const type = m[1].toLowerCase();
      let depth = 0, j = i;
      for (; j < toks.length; j++) {
        if (toks[j].type === 'blockquote_open') depth++;
        else if (toks[j].type === 'blockquote_close' && --depth === 0) break;
      }
      t.tag = toks[j].tag = 'div';
      t.meta = { ...(t.meta || {}), callout: true };
      t.attrJoin('class', `admonition admonition-${CALLOUTS[type] || 'note'}`);
      // the title is the rest of the marker's line; the body starts after the first line break
      const text = (c) => Object.assign(new state.Token('text', '', 0), { content: c });
      const brk = kids.findIndex((c, x) => x > k && (c.type === 'softbreak' || c.type === 'hardbreak'));
      const titleKids = [text(head.slice(m[0].length)), ...kids.slice(k + 1, brk < 0 ? kids.length : brk)];
      const rest = brk < 0 ? [] : kids.slice(brk + 1);
      const title = new state.Token('inline', '', 0);
      title.children = titleKids.some((c) => c.type !== 'text' || c.content.trim()) ? titleKids : [text(type[0].toUpperCase() + type.slice(1))];
      const open = new state.Token('paragraph_open', 'p', 1);
      open.block = true;
      open.attrJoin('class', 'admonition-title');
      const close = new state.Token('paragraph_close', 'p', -1);
      close.block = true;
      if (rest.length) { inl.children = rest; toks.splice(i + 1, 0, open, title, close); }
      else toks.splice(i + 1, 3, open, title, close);
    }
  });
}

// ---------- the body box and its layout ----------
// Every content slide's body (after the title, subtitle and lead, before the footnotes) is wrapped in
// <div class="body">, the box from the lead (or the line) down to the footnotes. <!-- _layout: … --> makes
// it a grid: a preset (two, fit-left, fit-right, img-left, img-right, rows) or a CSS grid-template of named
// areas ("a b" "a c" / auto 1fr); `middle` centres it vertically. ::: name … ::: puts blocks in an area;
// blocks outside any area fill the cells in order. The old _class: columns picks a preset from its first block.
const LAYOUTS = ['two', 'fit-left', 'fit-right', 'img-left', 'img-right', 'rows'];
// A row of a custom template with no size after its quotes would be `auto`, and auto rows share out the
// body's spare height, leaving gaps under short rows. So an unsized row is as tall as its content and an
// unsized last row takes the rest (minmax(0, 1fr)); under `middle` it stays auto, so the rows can centre.
function sizeRows(template, middle) {
  const at = template.search(/\/(?=[^"]*(?:"[^"]*"[^"]*)*$)/);   // the / outside quotes, before the columns
  const rows = (at < 0 ? template : template.slice(0, at)).match(/"[^"]*"|[^\s"(]+\([^)]*\)|[^\s"]+/g) || [];
  const out = [];
  rows.forEach((t, k) => {
    out.push(t);
    if (t.startsWith('"') && !(rows[k + 1] && !rows[k + 1].startsWith('"'))) {
      const last = !rows.slice(k + 1).some((r) => r.startsWith('"'));
      out.push(last && !middle ? 'minmax(0, 1fr)' : 'auto');
    }
  });
  return out.join(' ') + (at < 0 ? '' : ' ' + template.slice(at));
}
function layoutOf(value) {
  const words = value.replace(/"[^"]*"/g, ' ').split(/[\s/]+/);
  const custom = sizeRows((value.match(/"[^"]*"[^"]*/g) || []).join('').replace(/\bmiddle\b/g, '').trim(), words.includes('middle'));
  const preset = LAYOUTS.find((n) => words.includes(n));
  const cls = ['body'];
  if (custom || preset) cls.push('layout');
  if (preset && !custom) cls.push(`layout-${preset}`);
  if (words.includes('middle')) cls.push('middle');
  const style = custom ? ` style='grid-template: ${custom.replace(/[<>']/g, '')}'` : '';
  return `<div class="${cls.join(' ')}"${style}>\n`;
}
function bodies(md) {
  const Token = md.core.State.prototype.Token;
  const html = (content) => Object.assign(new Token('html_block', '', 0), { content, block: true });
  md.core.ruler.after('rs_slide_types', 'rs_bodies', (state) => {
    const toks = state.tokens;
    const out = [];
    let slide = null;
    const wrap = (sl) => {
      if (/\b(title|section|divider)\b/.test(sl.open.attrGet('class') || '')) return sl.toks;
      const ts = sl.toks;
      let depth = 0, start = -1, end = ts.length, lead = false, layout = null;
      for (let i = 0; i < ts.length; i++) {
        const t = ts[i];
        if (t.type === 'marpit_comment') {
          const m = t.content.match(/(?:^|\n)\s*_?layout\s*:\s*(.+)/);
          if (m) layout = m[1].trim();
        }
        if (t.type === 'rs_footnotes' && depth === 0) { end = i; break; }
        if (depth === 0 && start < 0) {
          const skip = t.type === 'front_matter' || /^marpit_/.test(t.type) || (t.type === 'html_block' && /^\s*<(style|!--)/i.test(t.content));
          const header = t.type === 'heading_open' && (t.tag === 'h2' || t.tag === 'h3');
          const isLead = t.type === 'blockquote_open' && !(t.meta && t.meta.callout) && !lead;
          if (isLead) lead = true;
          if (!skip && !header && !isLead && t.nesting >= 0 && t.type !== 'inline') start = i;
        }
        depth += t.nesting;
      }
      if (start < 0) start = end;
      if (!layout && /\bcolumns\b/.test(sl.open.attrGet('class') || '')) {
        const f = ts[start];
        if (f && f.type === 'table_open') layout = 'fit-left';
        else if (f && f.type === 'paragraph_open' && /\bfigures\b/.test(f.attrGet('class') || '')) layout = 'img-left';
        else layout = 'two';
      }
      return [...ts.slice(0, start), html(layoutOf(layout || '')), ...ts.slice(start, end), html('</div>\n'), ...ts.slice(end)];
    };
    for (const t of toks) {
      if (t.type === 'marpit_slide_open') { slide = { open: t, toks: [] }; out.push(t); continue; }
      if (t.type === 'marpit_slide_close' && slide) { out.push(...wrap(slide), t); slide = null; continue; }
      (slide ? slide.toks : out).push(t);
    }
    toks.splice(0, toks.length, ...out);
  });
}

// ---------- footnotes: per slide ----------
// Cited definitions go to the slides that cite them, numbered in citing order. A definition nobody cites
// (a caveat or a link for the whole slide) goes to the slide its source line sits in.
function footnotes(md) {
  // markdown-it-footnote drops uncited definitions in footnote_tail, so record every one before that
  md.core.ruler.before('footnote_tail', 'rs_footnote_defs', (state) => {
    const all = (state.env.rsFootnoteDefs = []);
    let cur = null;
    for (const t of state.tokens) {
      if (t.type === 'footnote_reference_open') cur = { label: t.meta.label, line: null, children: [] };
      else if (t.type === 'footnote_reference_close') { all.push(cur); cur = null; }
      else if (cur) {
        if (cur.line == null && t.map) cur.line = t.map[0];
        if (t.type === 'inline') cur.children.push(...t.children);
      }
    }
  });
  md.core.ruler.after('marpit_slide', 'rs_footnotes', (state) => {
    const toks = state.tokens;
    const defs = {}; // footnote id -> inline children
    let id = null;
    const keep = [];
    let inBlock = false;
    for (const t of toks) {
      if (t.type === 'footnote_block_open') { inBlock = true; continue; }
      if (t.type === 'footnote_block_close') { inBlock = false; continue; }
      if (!inBlock) { keep.push(t); continue; }
      if (t.type === 'footnote_open') id = t.meta.id;
      else if (t.type === 'inline' && id != null) (defs[id] = defs[id] || []).push(...t.children.filter((c) => c.type !== 'footnote_anchor'));
    }
    const cited = new Set(((state.env.footnotes && state.env.footnotes.list) || []).map((f) => f.label));
    const uncited = (state.env.rsFootnoteDefs || []).filter((d) => !cited.has(d.label));
    const starts = keep.filter((t) => t.type === 'marpit_slide_open').map((t) => (t.map ? t.map[0] : 0));
    const slideOf = (line) => { let k = 0; starts.forEach((st, i) => { if (st <= line) k = i; }); return k; };
    const out = [];
    let slide = null; // { ids: [], n }
    let n = -1;
    for (const t of keep) {
      if (t.type === 'marpit_slide_open') { n++; slide = { ids: [] }; }
      if (t.type === 'inline' && slide) for (const c of t.children || []) {
        if (c.type !== 'footnote_ref') continue;
        if (!slide.ids.includes(c.meta.id)) slide.ids.push(c.meta.id);
        c.meta.rsSlide = n;
        c.meta.rsNumber = slide.ids.indexOf(c.meta.id) + 1;
      }
      if (t.type === 'marpit_slide_close' && slide) {
        const items = slide.ids.map((fid, k) => ({ number: k + 1, children: defs[fid] || [] }));
        for (const d of uncited.filter((d) => slideOf(d.line ?? 0) === n)) items.push({ number: items.length + 1, children: d.children });
        if (items.length) {
          const ft = new state.Token('rs_footnotes', 'div', 0);
          ft.block = true;
          ft.meta = { items, slide: n };
          out.push(ft);
        }
      }
      out.push(t);
    }
    state.tokens = out;
  });
  md.renderer.rules.footnote_ref = (tokens, idx) => {
    const { rsSlide, rsNumber, id } = tokens[idx].meta;
    const k = rsNumber || id + 1;
    return `<sup class="fn-ref"><a href="#fn-${rsSlide ?? 0}-${k}">${k}</a></sup>`;
  };
  // uncited definitions were taken before text_join, so escapes (\*) are still text_special tokens
  const joinText = (children) => children.map((c) => (c.type === 'text_special' ? Object.assign(Object.create(Object.getPrototypeOf(c)), c, { type: 'text' }) : c));
  md.renderer.rules.rs_footnotes = (tokens, idx, options, env, self) =>
    '<div class="footnotes">' + tokens[idx].meta.items.map((it) => `<div id="fn-${tokens[idx].meta.slide}-${it.number}"><sup class="fn-ref">${it.number}</sup> ${self.renderInline(joinText(it.children), options, env)}</div>`).join('') + '</div>\n';
}

// ---------- slide types: title, section, divider as a class on the slide ----------
// # + a subtitle paragraph is the title page; a last slide holding only a # line is the thanks page (same
// layout); # alone elsewhere is a section page; # Name {.divider} is a plain divider.
function slideTypes(md) {
  md.core.ruler.after('marpit_directives_apply', 'rs_slide_types', (state) => {
    const slides = [];
    let cur = null, depth = 0;
    for (const t of state.tokens) {
      if (t.type === 'marpit_slide_open') { cur = { open: t, h1: null, para: false, other: false }; slides.push(cur); depth = 0; continue; }
      if (t.type === 'marpit_slide_close') { cur = null; continue; }
      if (!cur || /^marpit_/.test(t.type)) continue;
      if (depth === 0 && !['html_block', 'front_matter', 'rs_footnotes', 'heading_close', 'paragraph_close', 'inline'].includes(t.type)) {
        if (t.type === 'heading_open' && t.tag === 'h1' && !cur.h1) cur.h1 = t;
        else if (t.type === 'paragraph_open') cur.para = true;
        else cur.other = true;
      }
      depth += t.nesting;
    }
    slides.forEach((sl, i) => {
      if (!sl.h1) return;
      let type = 'section';
      if (/\bdivider\b/.test(sl.h1.attrGet('class') || '')) type = 'divider';
      else if (!sl.other && (sl.para || i === slides.length - 1)) type = 'title';
      sl.open.attrJoin('class', type);
    });
  });
}

module.exports = ({ marp }) => {
  // replaces Marp's own default theme, both by name (theme: default) and for a deck with no theme line
  marp.themeSet.default = marp.themeSet.add(theme());
  // md2s --thanks: close the deck with a thanks page (the title-page layout); off by default
  // with headingDivider the # line starts its own slide; a --- as well would leave an empty slide between
  const thanks = (src) => (process.env.MD2S_THANKS ? `${src.replace(/\s*$/, '')}\n\n${DIVIDED.test(src) ? '' : '---\n\n'}# ${process.env.MD2S_THANKS}\n` : src);
  const parse = marp.markdown.parse.bind(marp.markdown);
  // the deck's front matter reaches the renderers through env.md2s (line-numbers …)
  marp.markdown.parse = (src, env = {}) => {
    src = leadingRule(src);
    env.md2s = settings(src);
    return parse(thanks(insertToc(repeatTitles(citations(src)))), env);
  };
  const script = (name) => `<script>${fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`;
  // every format: a table wider than its box gets a smaller font until it fits (src/fit.js)
  const fitTables = script('fit.js');
  const renderAll = marp.render.bind(marp);
  marp.render = (...args) => {
    const out = renderAll(...args);
    out.html += fitTables;
    return out;
  };
  // md2s --html / --serve: the presenting tools (laser, pen, click to turn) go in after the slides
  if (process.env.MD2S_FORMAT === 'html') {
    const render = marp.render.bind(marp);
    const present = script('present.js');
    // KaTeX's fonts are local file:// URLs, which a page served over http (or opened elsewhere) may not
    // load: keep the woff2 of each, embedded, and drop the woff / ttf fallbacks
    const fonts = (css) => css
      .replace(/,\s*url\((['"]?)file:[^)'"]*\.(woff|ttf)\1\)\s*format\("(woff|truetype)"\)/g, '')
      .replace(/url\((['"]?)(file:[^)'"]*\.woff2)\1\)/g, (m, q, url) => {
        try { return `url(${dataUri(require('url').fileURLToPath(url), 'font/woff2')})`; } catch { return m; }
      });
    marp.render = (...args) => {
      const out = render(...args);
      out.css = fonts(out.css);
      out.html += present;
      return out;
    };
  }
  return marp
    .use(require('markdown-it-footnote'))
    .use(require('markdown-it-mark'))
    .use(require('markdown-it-bracketed-spans'))
    // MultiMarkdown tables: || spans the next column, ^^ the row above, two header rows, [Caption]
    .use(require('markdown-it-multimd-table'), { multiline: false, rowspan: true, headerless: false, multibody: true })
    .use(require('markdown-it-attrs'), { allowedAttributes: ['class', 'style', 'scale', 'path', 'start'] })
    .use(spansPastAttrs)
    .use(bracesPastAttrs)
    .use(require('markdown-it-container'), 'area', {
      validate: (params) => /^[A-Za-z][\w-]*(\s+[\w-]+)*$/.test(params.trim()),
      render: (tokens, idx) => {
        if (tokens[idx].nesting !== 1) return '</div>\n';
        const [name, ...cls] = tokens[idx].info.trim().split(/\s+/);
        // area-<name> lets a <style scoped> pick out one area
        return `<div class="${['area', `area-${name}`, ...cls].join(' ')}" style="grid-area: ${name}">\n`;
      },
    })
    .use(callouts)
    .use(mathMacros)
    .use(figures)
    .use(splitTables)
    .use(tables)
    .use(fences)
    .use(marks)
    .use(tocs)
    .use(footnotes)
    .use(slideTypes)
    .use(bodies);
};
module.exports.expand = expand;
module.exports.readMacros = readMacros;
