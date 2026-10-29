# md2s

**Stop making slides, do research.** md2s turns one plain Markdown file into academic slides that read
well and all look alike: a vector PDF, a PPTX of pictures, or an HTML deck to present from, with a laser
pointer and a pen. The Markdown is the kind any LLM already writes, so an agent can draft the deck too.

It is [Marp](https://marp.app) underneath, plus what research talks need and Marp leaves out:

- one house style, set by the theme: title page, section pages, a title / subtitle / rule header, slide numbers
- per-slide footnotes, numbered equations (`\begin{equation}`), a contents slide (`toc: true`)
- layouts without CSS: `<!-- _layout: img-right -->`, `::: a` areas, `middle`
- callouts (`> [!NOTE]`), tables with row tints, code with line numbers that copying leaves out
- ```` ```mermaid ````, ```` ```dot ````, ```` ```algo ```` (algorithm2e) fences, PDF pages, GIFs and videos as pictures
- a `###` that runs over continues after `---`, numbered (1/2), (2/2)

## Install

```bash
git clone … ~/Code/md2s && cd ~/Code/md2s
npm install && npm link        # puts md2s on the PATH
md2s --check                   # Chrome is required; TeX, ffmpeg, draw.io only for their features
```

## Use

```bash
md2s deck.md                   # deck.pdf
md2s deck.md --pdf --pptx --html
md2s deck.md --serve           # present at http://localhost:8080/deck.md
md2s --skill                   # every bit of syntax, written for an agent (or you)
```

`examples/gallery.md` shows every slide type and component; render it after changing the theme.
Your own math macros go in `~/.config/md2s/macros.tex`.

The cover photo in `themes/` is the author's own.
