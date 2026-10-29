# Fonts

The theme sets every slide in these fonts, so a deck looks the same on any machine. Each file is a subset
(Latin, Latin Extended-A, Greek, punctuation, arrows, math symbols) made by `scripts/subset-fonts.sh`;
characters outside it, Chinese above all, fall back to the system fonts named after them in the theme.

| File | Made from | Used for | License |
|---|---|---|---|
| `md2s-serif-*.woff2` | Liberation Serif 2.1.5 (Times New Roman's metrics) | all slide text | SIL OFL 1.1 |
| `md2s-mono-*.woff2` | Liberation Mono 2.1.5 (Courier New's metrics) | inline code, prompt templates | SIL OFL 1.1 |
| `md2s-code.woff2` | Fira Code Retina 6.002 | code boxes | SIL OFL 1.1 |
| `md2s-arrows.woff2` | FreeSerif (GNU FreeFont), arrows only | → ⤷ ➔ in text | GPL-3.0-or-later with the font exception |

**Modified versions.** Subsetting makes a Modified Version under the OFL. Liberation is a Reserved Font
Name, so these files do not carry it: the subsets keep only the copyright and license names, and the
theme calls them `md2s Serif`, `md2s Mono` and `md2s Code`.

**Copyright.**

- Liberation Serif, Liberation Mono: Digitized data copyright (c) 2010 Google Corporation with Reserved
  Font Arimo, Tinos and Cousine. Copyright (c) 2012 Red Hat, Inc. with Reserved Font Name Liberation.
- Fira Code: Copyright 2014-2021 The Fira Code Project Authors (https://github.com/tonsky/FiraCode).
- FreeSerif: Copyright 2002-2012 GNU FreeFont contributors (https://www.gnu.org/software/freefont/).

**Licenses.** The OFL is in [OFL.txt](OFL.txt). FreeFont is under the GNU GPL version 3 or later
(https://www.gnu.org/licenses/gpl-3.0.html) with this exception:

> As a special exception, if you create a document which uses this font, and embed this font or unaltered
> portions of this font into the document, this font does not by itself cause the resulting document to be
> covered by the GNU General Public License. This exception does not however invalidate any other reasons
> why the document might be covered by the GNU General Public License. If you modify this font, you may
> extend this exception to your version of the font, but you are not obligated to do so. If you do not wish
> to do so, delete this exception statement from your version.
