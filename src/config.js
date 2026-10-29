// marp-cli configuration for md2s: bin/md2s.js passes it with --config-file.
// The engine (engine.js) registers the default theme, so a deck needs no theme: line.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
// the katex that Marp itself renders with, wherever npm put it, so its fonts match
const KATEX = require.resolve('katex/package.json', { paths: [path.dirname(require.resolve('@marp-team/marp-core'))] });
module.exports = {
  engine: require('./engine.js'),
  html: true,              // <hr class="rule">, <div> wrappers for columns
  allowLocalFiles: true,   // figures and the cover photo are local files
  imageScale: 3,           // pptx / png pages at 2880 x 1620; md2s --scale N overrides it
  // KaTeX sets math as text in its own fonts, so formulas stay selectable and searchable in the PDF;
  // the fonts come from the local katex package, not a CDN
  options: { math: { lib: 'katex', katexFontPath: pathToFileURL(path.join(path.dirname(KATEX), 'dist', 'fonts')).href + '/' } },
};
