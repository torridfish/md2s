#!/usr/bin/env bash
# Render a LaTeX snippet (an equation, an algorithm2e block, or any body) to a PNG
# with the local TeX Live, so nothing leaves the machine; the fonts are Computer Modern, as in the slides' math.
#
#   tex2img.sh --math  'a^2 + b^2 = c^2'            -o out/eq1       # inline math, no delimiters
#   tex2img.sh --display 'E = mc^2'                  -o out/eq2       # displaystyle
#   tex2img.sh --algo  algo-body.tex                 -o out/alg1      # an algorithm2e body (\KwIn ... \Return)
#   tex2img.sh --body  body.tex                      -o out/x         # any LaTeX body, your own markup
#   tex2img.sh --math-file eq.txt -o out/eq3                          # math read from a file
# Options: -o <basename> (required)  --dpi N (PNG, default 800)  --opaque (white ground instead of
#          transparent)  --preamble F (replace the theme preamble)
# Output: <basename>.png with a transparent ground (+ the .tex it compiled, kept for edits).
# Placement: px/dpi inches is 1:1 with 12pt body text.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRE="$HERE/../tex"
# the user's own macros (md2s reads the same file for KaTeX)
MACROS="${XDG_CONFIG_HOME:-$HOME/.config}/md2s/macros.tex"
mode=""; src=""; out=""; dpi=800; transp=1; pre_override=""
while [ $# -gt 0 ]; do
  case "$1" in
    --math|--display|--algo|--body|--math-file) mode="${1#--}"; src="$2"; shift 2;;
    -o) out="$2"; shift 2;;
    --dpi) dpi="$2"; shift 2;;
    --opaque) transp=0; shift;;
    --preamble) pre_override="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done
[ -n "$mode" ] && [ -n "$out" ] || { echo "usage: tex2img.sh (--math EXPR | --display EXPR | --math-file F | --algo FILE | --body FILE) -o BASENAME" >&2; exit 2; }
mkdir -p "$(dirname "$out")"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
case "$mode" in
  math)      body="\\( $src \\)";;
  display)   body="\\( \\displaystyle $src \\)";;
  math-file) body="\\( $(cat "$src") \\)";;
  algo)      body="$(cat "$src")";;
  body)      body="$(cat "$src")";;
esac
if [ -n "$pre_override" ]; then pre="$pre_override"
elif [ "$mode" = algo ]; then pre="$PRE/preamble-algo.tex"; else pre="$PRE/preamble-math.tex"; fi
{ cat "$pre"; [ -f "$MACROS" ] && cat "$MACROS"; printf '\n\\begin{document}\n%s\n\\end{document}\n' "$body"; } > "$work/fig.tex"
cp "$work/fig.tex" "$out.tex"
for cmd in pdflatex pdftocairo; do
  command -v "$cmd" >/dev/null || { echo "$cmd not found: install TeX Live (pdflatex) and poppler (pdftocairo); md2s --check" >&2; exit 1; }
done
if ! ( cd "$work" && pdflatex -interaction=batchmode -halt-on-error fig.tex >/dev/null 2>&1 ); then
  cp "$work/fig.log" "$out.log"
  # name a missing package outright; otherwise the first LaTeX error
  missing="$(grep -o "File \`[^']*' not found" "$work/fig.log" | head -1 | sed "s/File \`\(.*\)' not found/\1/" || true)"
  if [ -n "$missing" ]; then echo "$missing missing (tlmgr install ${missing%.*}); see $out.log" >&2
  else echo "pdflatex failed: $(grep -m1 '^!' "$work/fig.log" || echo 'see the log'); see $out.log" >&2; fi
  exit 1
fi
if [ "$transp" = 1 ]; then pdftocairo -png -transp -r "$dpi" -singlefile "$work/fig.pdf" "$out"
else pdftocairo -png -r "$dpi" -singlefile "$work/fig.pdf" "$out"; fi
