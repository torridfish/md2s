#!/usr/bin/env bash
# Rebuild themes/fonts: the theme's fonts cut down to the characters slides use, as woff2. Run it only to
# change the set; the output is committed. Needs uv (for fonttools) and the source fonts at the paths below
# (Ubuntu: fonts-liberation, fonts-freefont-ttf; Fira Code from https://github.com/tonsky/FiraCode).
# A subset is a Modified Version under the OFL, and Liberation is a Reserved Font Name, so the subsets keep
# only the copyright and license names (IDs 0, 13, 14) and go by md2s-* names; see themes/fonts/README.md.
#
#   scripts/subset-fonts.sh [FIRA_CODE_RETINA_TTF]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$HERE/../themes/fonts"
F=/usr/share/fonts/truetype
fira="${1:-$HOME/.local/share/fonts/FiraCode-Retina.ttf}"
# Latin, Latin Extended-A, Greek, punctuation, super/subscripts, letterlike symbols, arrows, math operators,
# technical and geometric shapes, check marks, fi/fl ligatures; anything else falls back to a system font
U='U+0000-00FF,U+0100-017F,U+0192,U+02C6-02DD,U+0370-03FF,U+2000-206F,U+2070-209F,U+20AC,U+2100-214F,U+2190-21FF,U+2200-22FF,U+2300-23FF,U+25A0-25FF,U+2713-2717,U+FB01-FB02'
sub() {
  uvx -q --from 'fonttools[woff]' pyftsubset "$1" --unicodes="$2" --flavor=woff2 --layout-features='*' \
    --name-IDs=0,13,14 --output-file="$out/$3.woff2" 2> >(grep -v 'FFTM NOT subset' >&2)
}
for s in Regular Bold Italic BoldItalic; do
  lc="$(echo "$s" | sed 's/BoldItalic/bold-italic/; s/.*/\L&/')"
  sub "$F/liberation/LiberationSerif-$s.ttf" "$U" "md2s-serif-$lc"
  sub "$F/liberation/LiberationMono-$s.ttf" "$U" "md2s-mono-$lc"
done
sub "$fira" "$U" md2s-code
sub "$F/freefont/FreeSerif.ttf" 'U+2190-21FF,U+2794,U+27A4,U+2933-2937' md2s-arrows
du -ch "$out"/*.woff2 | tail -1
