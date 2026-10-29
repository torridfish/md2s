# md2s

Stop making slides, do research. md2s turns one plain Markdown file into academic slides that read well
and all look alike: a vector PDF, a PPTX of pictures, or an HTML deck to present from. It is Marp
underneath, plus what research talks need: per-slide footnotes, numbered equations, a contents slide,
layouts without CSS, callouts, diagrams, code, and media. You write the content; the theme decides the look.

```bash
md2s deck.md                       # deck.pdf next to deck.md (vector)
md2s deck.md --pdf --pptx          # + deck.pptx, one 2880x1620 picture per slide
md2s deck.md --pptx --scale 4      # pictures at 4x the canvas (3840x2160); default 3, PDF is vector
md2s deck.md --html                # one HTML file to present from (keys below)
md2s deck.md --serve               # present at http://localhost:8080/deck.md (--port N), re-rendered on reload
md2s deck.md --pdf --watch         # rebuild on every save
md2s deck.md --pptx -o out/        # another output folder
md2s deck.md --thanks              # append a "Thanks for listening." page (off by default)
md2s deck.md --thanks-text "Questions?"   # the same page with other words
md2s --check                       # which optional tools (TeX, ffmpeg …) are installed
md2s tex2img --display 'E = mc^2' -o eq    # a standalone formula picture
```

## Front matter

```yaml
---
marp: true
theme: default        # md2s's theme (also used when the line is left out)
paginate: true        # slide number at the bottom right of every slide
headingDivider: 2     # every # and ## starts a slide, so no --- is needed
toc: true             # a contents slide after the first one ("Outline"; `toc: Contents` names it)
bibliography: refs.bib        # BibTeX: a path (relative to the deck), a list of paths, or entries written in place
citation-style: apa           # the default; ieee, vancouver, harvard1, or a .csl file
line-numbers: true            # the default; false drops line numbers from every code block
toc-standalone: [TODO, Appendix, References]   # the default; ## categories the contents slide lists apart
---
```

Every setting lives here, in the deck; the command line only chooses outputs. Defaults you want in every
deck go in `~/.config/md2s/config.yaml` with the same keys; a deck's front matter overrides them.

Headings have three jobs: `#` alone is a **section page**, a chapter of the talk (usually the question its
slides answer); `##` is the slide's **category** (Setup, Experiment, Analysis, TODO …), a label that repeats
rather than a level; `###` is the slide's **title**, its one message. The contents slide is built on that.

## Citations

With a `bibliography:`, `[@key]` cites one work and `[@a; @b]` several. A marker reads `(Vaswani et al.,
2017)` in an author-date style (apa, harvard1) and `[1]` in a numeric one (ieee, vancouver, numbered in
citing order); it links to the work's entry on the **References** slides, which md2s adds at the end
(before a `--thanks` page, six entries a slide, `(1/2)` when there are more) and lists on the contents
slide. Only cited works are listed. One style decides both the markers and the entries. Citations may sit
in text, tables and footnotes; footnotes themselves are a separate thing. An unknown key shows as a red
`?key` and is reported, and the build goes on.

```yaml
bibliography: |              # a few entries need no .bib file
  @article{lecun2015deep, title={Deep learning}, author={LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey},
    journal={Nature}, volume={521}, pages={436--444}, year={2015}}
```

The contents slide lists the deck in two columns, each line linking to its slide. With section pages
(`# Title` alone), each section is an entry with the `###` of its slides under it (the `##` categories would
only repeat); without them, each `##` is an entry with its `###` under it, a run of slides under the same
`##` being one entry. The `##` categories in `toc-standalone` (TODO, Appendix and References unless set
otherwise) belong to the whole deck: they are entries of their own after everything else, wherever their
slides are. Part numbers like `(1/2)` are dropped, so the parts are one line; the thanks page and
`{.divider}` pages are left out.

A run of slides under the same title writes the `##` once: a `###` after another `###` starts the next
slide with the same `##`.

```markdown
## Experiment
### M3 runs minus same-K no-CoT          <- slide 1: Experiment / M3 runs …

| … |

### Exploratory: M3 final vs no-CoT       <- slide 2: Experiment / Exploratory …

- …

---                                       <- slide 3: Experiment / Exploratory … (2/2)

- the rest of that subsection
```

A `---` that is not followed by a heading continues the subsection on a new slide with the same `##` and
`###`, numbered (1/2), (2/2) … on every part (slide 2 above becomes Exploratory … (1/2)); the contents
slide lists the subsection once. Do not write the part numbers by hand. With `headingDivider`, a `---` right before a `#` or
`##` is dropped, since the heading starts the slide anyway.

With `headingDivider: 2` a `---` still forces a break; any Markdown rule (`---`, `***`) is a slide break
in Marp, so a body rule inside a slide is `<hr class="rule">`.

## Slide types

All text is Times New Roman: 24pt titles (30pt on the title page), 14pt subtitles, 11pt leads and body,
9pt tables, 7pt footnotes, a 9pt slide number (none on the title page), line spacing 1.3 (code stays monospace, math is KaTeX). The engine reads each slide's type from the
Markdown:

```markdown
# Progress Report            <- title page: # title + a subtitle paragraph, centred on the photo

LRM Baseline on Math
Oct. 31, 2026

# Does KV cache help?        <- section page: # title alone, on the photo

# 冠霆 {.divider}             <- plain divider: one centred line on white

## Experiment                <- content slide: title (24pt)
### Category C: KV cache     <- subtitle (14pt, amber), with the line under it

> Will KV cache benefit **downstream** tasks?[^kv]    <- lead (11pt); [^kv] becomes an italic superscript 1

![](figures/kv.png "4-01")   <- figure; the title is its run label

[^kv]: Proposal should be scene-shared.               <- ¹ Proposal … at the foot of this slide

```

A thanks page is a build option, not part of the Markdown: `md2s --thanks` appends
`# Thanks for listening.`, and a last slide holding only a `#` line takes the title-page layout.
(Writing that line by hand works the same way.)

Whole-slide classes go in a comment on a content slide: `<!-- _class: prose -->` (body text at 14pt for a
discussion page), `<!-- _class: equation -->` (display math at 1.5x on a slide that is only the equation).
`<!-- _class: columns -->` still works: it picks a layout from the first block (a table: `fit-left`, a
figure: `img-left`, otherwise `two`).

## Layout

The body of a content slide is one box: from the lead (or the line, without a lead) down to the top of the
footnotes, so more footnote lines make it shorter. Without a layout it stacks its blocks top to bottom:
text after text with no gap, a table, figure, formula or code block 14px from its neighbours.

`<!-- _layout: … -->` makes the box a grid. A preset, or a CSS `grid-template` of named areas:

| Layout | Areas |
| --- | --- |
| `two` | `a` and `b`, halves side by side |
| `fit-left` / `fit-right` | `a b`; the left (right) one only as wide as its table or formula, the other takes the rest |
| `img-left` / `img-right` | the same for a picture: as tall as the body allows (at most 1:1, at most 62% of the width) |
| `rows` | `a` above `b`, halves |
| `"a b" "a c" / auto 1fr` | anything `grid-template` takes: rows of area names in quotes, then `/` and the column sizes (`auto`, `max-content`, `1fr`, `300px`, `40%`); a row size goes after its quotes (`"a b" 1fr`); a row without one is as tall as its content, and the last such row takes the rest of the height (all stay content-high with `middle`) |
| add `middle` | the content centred vertically (`<!-- _layout: middle -->` on a plain stack, `two middle` on a grid) |

```markdown
<!-- _layout: img-right -->

::: a
- The text column takes the rest of the width
:::

::: b
![](figures/kv.png "4-01")
:::
```

`::: name` … `:::` puts its blocks in that area, stacked like the plain body; `::: b middle`,
`::: b bottom` and `::: b center` place them inside the area. Each area is a `<div class="area area-b">`,
so one slide can style one area: `<style scoped>.area-b { font-size: 0.9em; }</style>`. Blocks outside any `:::` fill the cells in
order, one block per cell — and two lists in a row are one list in Markdown, so give each column its own
`:::` (or a `<div>`). Between areas the only space is the grid gap (14px down, 22px across, 12px beside
a fit or picture column); a table, figure or formula in a layout sits at the body's left edge.

## Callouts

GitHub / Obsidian callouts are coloured boxes; any other `>` stays the lead.

```markdown
> [!NOTE]                    <- blue, titled "Note"
> Body text, lists, math.

> [!WARNING] Disk is full    <- amber, with its own title
> [!TIP] Only a title        <- a one-line box
```

Colours: `NOTE` (also info, example, quote) blue, `TIP` (hint, success, done) green, `IMPORTANT` (abstract,
summary, question) purple, `WARNING` (attention, todo) amber, `CAUTION` (danger, error, failure, bug) red.

## Diagrams and media

| Markdown | Renders as |
| --- | --- |
| ` ```dot ` / ` ```graphviz ` | a Graphviz diagram (the WASM build, no system install), inline SVG |
| `{scale=0.8}` on either | resized from 1:1 |
| `![](fig.pdf#page=2)` | that page of a PDF as a vector picture (pdftocairo), at 1:1 (pt x 4/3) |
| `![](anim.gif)` | moves in `--html`; a PDF or PPTX shows its first frame |
| `![](clip.mp4)` (webm, mov) | a player in `--html`; a PDF or PPTX shows its first frame (ffmpeg) with a play mark, linked to the file; without ffmpeg, a link to the file (and a player with no poster in `--html`) |
| `![](https://youtu.be/ID "Title")` (or a youtube.com link) | a YouTube player in `--html`; a PDF or PPTX shows its thumbnail (fetched once at build time) with a play mark, linked to the video; offline, a plain link |

Diagrams and frames are cached in `~/.cache/md2s/`.

## Presenting from HTML

`md2s deck.md --html` writes one HTML file; open it in a browser. `md2s deck.md --serve` presents
the same from Marp's server instead (the deck's folder at `http://localhost:8080/`, rendered again on every
reload, so edits show up at once). Open from a file, Marp's overview cannot close again (its frame cannot
talk to the page under `file://`); over `--serve` it can. The server listens on every network interface,
so people on the same network can open the deck while it runs.

| Key | Action |
| --- | --- |
| ← → / Space / PgUp PgDn, or a click on the left / right third | previous / next slide |
| `l` | laser pointer on / off: the cursor becomes a red dot |
| `d` | pen on / off: draw on the slide (each slide keeps its own drawing) |
| `u` / `e` | undo the last stroke (or erase) / erase this slide |
| `f` / `o` or `Esc` / `p` | fullscreen / overview / presenter view (Marp's own keys, which come first; the added keys use only letters Marp leaves free) |
| `?` | these keys |

## Body

| Markdown | Renders as |
| --- | --- |
| paragraphs | body text, 11pt, no paragraph spacing |
| `- item` / `1. item` | round bullets, numbers, `a.` for a nested ordered list; markers line up with paragraph text and wrapped lines with the item's text; each level two characters further in |
| `➔ consequence` (a paragraph) | drawn as →; wrapped lines start after the arrow; right after a list it lines up with the list's text |
| a paragraph of only images | one centred figure row, 0.25in apart; each picture at 1:1, shrunk only when the row or the body is too small: a PNG / JPEG / GIF is taken as a 2x export (px / 2), an SVG is placed at its own width and height (export diagrams as SVG yourself; md2s reads no editor files) |
| `![w:300](f.png)` | Marp's size keywords still work for one picture |
| `$x_i$`, `$$ … $$`, ```` ```math ```` | KaTeX, Computer Modern, selectable and searchable in the PDF; inline math at the body size, display math centred at 1.2x the body |
| `\begin{equation} … \end{equation}` inside `$$` | numbered (1), (2) … in order through the deck, the number at the right edge; `align` / `gather` number each row (`\notag` skips one), the starred forms and plain `$$` are unnumbered, `\tag{A.1}` sets a number by hand |
| `\label{eq:x}` in a numbered row, `\eqref{eq:x}` / `\ref{eq:x}` anywhere | `(2)` / `2`, in text a link to the equation; works before the equation too; an unknown label shows as a red `(?eq:x)` and is reported |
| your own macros | `\newcommand` / `\DeclareMathOperator` lines in `~/.config/md2s/macros.tex` work in `$…$`, `$$…$$` and LaTeX-rendered fences; `\argmax`, `\argmin` are built in |
| ` ```algo ` | an `algorithm2e` body rendered with the local TeX Live (800 dpi, transparent; `{scale=1.3}` resizes) |
| ` ```latex {.render} ` | any LaTeX body rendered the same way |
| ` ```python ` (any language) | monokai on a dark rounded box with line numbers (`{.no-lines}` drops them for one block, `{.lines}` keeps them when the deck turned them off); a box as wide as its code, centred, at 9pt (smaller only when the longest line would not fit); the numbers are a separate column, so selecting or copying code (in the PDF too) leaves them out |
| ` ```python {path="human_eval/execution.py" start=98} ` | the same, with the path in white at the top of the box (a label only: nothing is read from it) and numbering from 98 |
| ` ```prompt ` | prompt template as text: `System:` bold, `{placeholder}` bold red, `<\|im_start\|>` on mark-blue |
| a table | results table, centred and compact (1px cell padding): bold header on gray, 9pt, hairline grid; cells centred unless the separator row says `:--` (left), `:-:` or `--:` (right) |
| a `role` column | each row's class, and the column is not shown: `ref` gray, `a` blue, `b` orange, `hl` highlighted, `mute` greyed out, `sep` a rule above the row |
| `\| 68.9 {.best} \|`, `{.second}` | one cell: the best number bold on a tint, the runner-up underlined |
| a table, a blank line, `{.booktabs}` | the table's style: `grid` (the default), `booktabs` (top, header and bottom rules only), `plain` (no lines), `striped` (every other row tinted), `settings` (blue header, left-aligned, short columns centred); classes combine |
| `\|\|` at the end of a cell, `^^` as a cell | the cell spans the next column / joins the cell above (MultiMarkdown); two header rows before the separator make a grouped header |
| `[Caption]` on the line right after a table | a caption under it (before it: above) |
| `<hr class="rule">` | body rule splitting the page |
| `<!-- text -->` | speaker notes |

Inline: `**bold**`, `` `chip` ``, `[link](url)`, `==WIP==`, `[4-03]{.callout}` (⤷ on orange),
`[disk full]{.alert}`, `[the formula]{.formula}`, `[aside]{.faint}`, `[<|im_end|>]{.token}`.

## Tweaking one slide

Inline HTML is on, so a one-off adjustment stays in the Markdown:

```markdown
<style scoped>
p.figures { flex: 1 1 0; } p.figures img { height: 100%; width: auto; }   /* fill the body on this slide */
table { font-size: 10.67px; }           /* an 8pt table on a crowded slide */
</style>
```

`<style scoped>` applies to its own slide only.

## Layout variables

Every anchor is a CSS variable in `:root` at the top of md2s's `themes/default.css` (px on the
960 x 540 canvas); change the theme there, not per slide. One slide can also override them:
`<style scoped>section { --rule-top: 84px; --body-top: 88px; }</style>`.

| Variable | Default | What it places |
| --- | --- | --- |
| `--title-size`, `--subtitle-size`, `--body-size`, `--table-size`, `--note-size`, `--footnote-size`, `--number-size` | 24, 14, 11, 9, 8, 7, 9 pt | the type sizes (`--note-size`: code path labels) |
| `--cover-title-size`, `--code-size`, `--leading`, `--indent` | 30 pt, 9 pt, 1.3, 2em | title-page title; code; line spacing; one list level |
| `--mark-w`, `--arrow-w` | 1.5em, 1.25em | a list marker's slot; the slot of the → opening a consequence line |
| `--bound` | 4 (3pt) | space around a table, figure or formula placed left in a column |
| `--title-top`, `--title-height` | 22, 46 | the title box (text sits on its bottom) |
| `--subtitle-top`, `--subtitle-height` | 68, 30 | the subtitle box (text centred in it) |
| `--rule-top` | 98 | the line under the subtitle |
| `--title-rule-gap` | 6 | a title with no subtitle (the contents slide) sits this far above the line |
| `--body-top` | 106 | the lead, or the body when there is no lead |
| `--lead-bottom` | 150 | where the body starts under a lead, at the earliest (not when a table, figure, formula or code comes right after it: then the usual gap) |
| `--body-bottom` | 504 | the bottom of the body box; footnotes sit below it |
| `--margin-x`, `--header-inset` | 32, 4 | side margin of header, line and body; title text inset |
| `--column-gap` | 22 | between the columns of a layout |
| `--run-label-height` | 22 | space a run label takes above its figure |
| `--footnote-width` | 916 | widest a footnote line runs, from the left edge |
| `--block-top` | 8 | extra room above a table, figure, code or formula that comes right under the line |
| `--number-right`, `--number-top`, `--number-height` | 16, 514, 24 | the slide number, right-aligned; a one-line footnote sits on its centre line |
| `--cover-title-*`, `--cover-sub-*` | | title-page title and subtitle (centred) |
| `--section-title-*`, `--divider-*` | | section-page title; plain divider line |

Moving the rule means moving `--body-top` and `--lead-bottom` with it, so the lead stays under the rule.

## Notes

- Render caches: TeX, diagram and media renders live in `~/.cache/md2s/`, keyed by content.
- Citations and footnotes are separate: a citation `[@key]` points into the bibliography and the References slides; a footnote `[^x]` is a note at the foot of its slide.
- Footnotes are numbered 1, 2 per slide in the order they are cited, marked by an italic superscript number in the text and at the foot (square brackets are left to citations); the mark in the text links to its footnote in the PDF. A definition nobody cites (a caveat or link for the whole slide) goes, after the cited ones, to the slide whose source it sits in.
- Marp does not warn about overflow: read the PDF pages before handing a deck over.
- Local images need no flag: md2s runs Marp with local file access on; paths are relative to the deck.
