# md2s

**Stop making slides, do research.** md2s turns one plain Markdown file into academic slides that read
well and all look alike: a vector PDF, a PPTX of pictures, or an HTML deck to present from, with a laser
pointer and a pen. The Markdown is the kind any LLM already writes, so an agent can draft the deck too.

It is [Marp](https://marp.app) underneath, plus what research talks need and Marp leaves out:

- one house style, set by the theme: title page, section pages, a title / subtitle / rule header, slide numbers
- per-slide footnotes, numbered equations with `\label` / `\eqref`, a contents slide (`toc: true`)
- BibTeX citations (`bibliography: refs.bib`, `[@key]`) with a References page, in APA, IEEE or any CSL style
- layouts without CSS: `<!-- _layout: img-right -->`, `::: a` areas, `middle`
- callouts (`> [!NOTE]`), tables with row tints, code with line numbers that copying leaves out
- ```` ```mermaid ````, ```` ```dot ````, ```` ```algo ```` (algorithm2e) fences, PDF pages, GIFs, videos and YouTube links
- a `###` that runs over continues after `---`, numbered (1/2), (2/2)

## Install

```bash
git clone …
npm install && npm link        # puts md2s on the PATH
md2s --check                   # Chrome is required; TeX and ffmpeg only for their features
```

## Use

```bash
md2s deck.md                   # deck.pdf
md2s deck.md --pdf --pptx --html
md2s deck.md --serve           # present at http://localhost:8080/deck.md
md2s --skill                   # every bit of syntax, written for an agent (or you)
```

`examples/gallery.md` shows every slide type and component; render it after changing the theme.
Your own defaults (any front matter setting) go in `~/.config/md2s/config.yaml`, your math macros in
`~/.config/md2s/macros.tex`. Figures are files you export yourself: SVG, PNG, PDF, GIF, video.

The cover photo in `themes/` is the author's own. `csl/ieee.csl` is from the
[CSL project](https://github.com/citation-style-language/styles), CC BY-SA 3.0.
