#!/bin/sh
# Opens every simulator preset the decks use and writes what it shows to a JSON
# file, using headless Chrome. Needs the repo root served at port 8815.
#
#   sh tests/check-sim.sh out.json

out="$1"
base="http://localhost:8815"
chrome="/c/Program Files/Google/Chrome/Application/chrome.exe"
flags="--headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --disk-cache-size=1 --disable-crash-reporter --force-prefers-reduced-motion"

# Chrome's profile and temp files stay in one folder, removed at the end
run="$(mktemp -d "$(dirname "$out")/chrome-run.XXXXXX")"
trap 'rm -rf "$run"' EXIT
winrun="$(cygpath -w "$run")"
export TEMP="$winrun" TMP="$winrun"

"$chrome" $flags --user-data-dir="$run/profile" --window-size=1300,800 --virtual-time-budget=400000 \
  --dump-dom "$base/tests/sim-qa.html" 2>/dev/null |
  sed -n '/<pre id="out">/,/<\/pre>/p' | sed 's/<[^>]*>//g' |
  sed 's/&lt;/</g; s/&gt;/>/g; s/&amp;/\&/g' > "$out"
wc -c "$out"
