# Changelog

What changed in each version that a deck or an install would notice. Versions follow
[semantic versioning](https://semver.org); before 1.0 a minor version may change how a deck renders.

## Unreleased

From a stress test that converted 18 real PowerPoint decks and compared every page (F1–F13 in its report).

### Added

- A layout check after every build (not `--watch`; `--no-check` skips it): md2s lays the deck out again in
  the browser and warns, by slide, about a body taller than its box, anything past the margins or the
  slide's edge, a heading over the header, and a title or subtitle on a third line. Chrome cuts all of
  these without a word. (F1) It is a warning, not a fix: the content is still cut off in the PDF, it is
  just no longer silent. Fix each warned slide in the Markdown (split it with `---`, shorten it).
  It measures only what is painted: KaTeX's hidden MathML copy of a formula (and its TeX) is skipped, so
  math in a `###` no longer counts as extra lines, and a formula that fits is not reported as running off.
  A formula that does run off is reported by its visible width (`test/overflow.md` slide 5: 38px, where
  the hidden copy had made it 445px).
  Known, not fixed: on one deck (2026-10-31, slide 31, `img-left`) the check's own page sized the image
  column at the PNG's natural width and squeezed the text column to nothing, so it warned about a slide
  that renders fine. It happened on every run of one copy of the deck and on no run of the deck in place.
  If it comes back, first make the check wait until every `document.images` is decoded and the fonts are
  loaded before measuring, before touching the grid styles.
- A warning when slides get a second `##` without `headingDivider`, which leaves a deck as one slide. (F12)

### Changed

- A `##` or `###` too long for one line wraps to a second, and the line under the header and the body move
  down; it used to be cut mid-word. One-line headers sit exactly where they did. (F8)
- A token longer than the line breaks instead of running off the slide. (F7) A table wider than its box
  wraps its cells at spaces and hyphens, and if its words still do not fit, its font gets smaller, down to
  6px, until it does; a number or a word is never split across lines. (F3) A wrapped table is taller, so
  on a full slide what follows it (a paragraph of notes) can now run off the bottom instead: the loss
  moves rather than goes away, but it is warned about.
- A column headed `Role` is md2s's row-role column only when every value in the body rows is a role word,
  `x`, `-` or empty; otherwise it is data and stays. `role` may head any header row, and a grouped
  header's placeholders (`x`, `-`, `^^`) and `^^` cells before the column no longer shift it. (F11)
- A row of `-` cells right under a table's header stays a row; only a row group after a blank line can
  start a new table. (F2)
- Braces at the end of a line are attributes only when they hold attribute syntax (`{.class}`, `{#id}`,
  `{key=value}`); `{Task query}` prints as written. (F6)

### Fixed

- Two tables one blank line apart were read as one, the second's header as a row and its `---` row as
  cells. (F2)
- A `---` at the end of the deck, or two in a row, made an empty slide and a bogus `(2/2)`. (F4)
- A deck whose first line is `---` with no front matter after it lost its first slide, or every slide. (F5)
- A heading further down a slide was painted over the slide's title. (F9)
- An empty table header row showed as a grey band. (F10)
- A `>` further down a slide had no gap from a table above it. (F13)

## 0.2.1 (2026-10-30)

### Fixed

- Installed into a project with `npm install` (dependencies hoisted), md2s could not find Marp and stopped
  with "node packages missing". It now finds Marp through Node's module resolution, as a clone and a
  global install already did.

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
