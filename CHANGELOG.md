# Changelog

What changed in each version that a deck or an install would notice. Versions follow
[semantic versioning](https://semver.org); before 1.0 a minor version may change how a deck renders.

## 0.2.0 (2026-10-30)

### Added

- `md2s setup` installs what is missing without sudo, asking first: Chrome for Testing and TinyTeX in
  `~/.cache/md2s`, Noto Serif CJK TC in your fonts (optional); for poppler and ffmpeg it prints the
  package-manager command. `md2s --check` says whether a tool is the system's or md2s's copy.
- The theme's fonts ship with md2s (subsets of Liberation Serif and Mono, Fira Code, FreeSerif's arrows),
  so a deck sets the same on every machine. `md2s --check` lists the optional CJK font.
- `npm test` builds the gallery as HTML and PDF and checks that every component rendered.
- Each layout area carries an `area-<name>` class, so `<style scoped>.area-p { … }` styles one area.
- `- item {.faint}` greys a list item with its bullet or number and its nested items.
- README: a hero preview and a short install guide.

### Changed

- An HTML deck carries its pictures and videos up to 20 MB, so it can be sent on its own.
- Rows of a custom `_layout` grid without a size fit their content, and the last one takes the rest, instead
  of sharing the body's height evenly. Under `middle` they all fit their content.
- `dot` labels use the bundled serif instead of a system Times.
- Direct dependencies are pinned to exact versions; install with `npm ci`.

### Fixed

- A `^^` row under a header with `||` or two header rows lost its last cells.

## 0.1.0 (2026-10-30)

The first public version, under MIT: one Markdown file to a PDF, a PPTX of pictures or an HTML deck to
present from, on Marp. It has the house style, per-slide footnotes, numbered equations with `\eqref`,
BibTeX citations, a contents slide, layouts and callouts, tables with row roles, code with line numbers,
`dot` and `algo` fences, PDF pages, GIFs, videos and YouTube links. Just before it:

- ```` ```mermaid ```` fences were dropped (mermaid-cli was ~480 MB of `node_modules`); use ```` ```dot ````.
- `md2s tex2img` lost its SVG output, with the dvisvgm and Pillow dependencies; it writes a PNG.
- Without ffmpeg a video became a link in PDF / PPTX and a player without a poster in HTML, not an error.
- Messages got clearer: one line when no browser is found, and LaTeX fences name a missing tool or package.
- A missing citation package warns instead of crashing, and `csl/` ships in the package.
