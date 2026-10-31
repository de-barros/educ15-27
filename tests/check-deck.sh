#!/bin/sh
# Checks a deck and takes a full-size screenshot of every slide, using headless
# Chrome. Needs the repo root served at port 8815 (the "simulator" preview).
#
#   sh tests/check-deck.sh 03-central-variability [folder for screenshots]

deck="$1"
shots="${2:-$TEMP/deck-shots/$deck}"
base="http://localhost:8815"
chrome="/c/Program Files/Google/Chrome/Application/chrome.exe"
flags="--headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --disk-cache-size=1 --disable-crash-reporter"

# Each run gets its own folder for Chrome's profile and temp files, so several
# checks can run side by side and nothing stays behind in the shared Temp folder
mkdir -p "$shots"
run="$(cd "$shots" && pwd)/chrome-run"
rm -rf "$run"
mkdir -p "$run/temp"
trap 'rm -rf "$run"' EXIT
profile="$run/profile"
winrun="$(cygpath -w "$run/temp")"
export TEMP="$winrun" TMP="$winrun"

"$chrome" $flags --user-data-dir="$profile" --window-size=1300,800 --virtual-time-budget=240000 \
  --dump-dom "$base/tests/deck-qa.html?deck=$deck" 2>/dev/null |
  sed -n '/<pre id="out">/,/<\/pre>/p' | sed 's/<[^>]*>//g'

rm -f "$shots"/s*.png
count="$(grep -c '^---$' "slides/$deck.Rmd")"
i=1
while [ "$i" -le $((count + 1)) ]; do
  n="$(printf '%02d' "$i")"
  "$chrome" $flags --user-data-dir="$profile" --window-size=1210,681 --virtual-time-budget=5000 \
    --screenshot="$shots/s$n.png" "$base/slides/$deck.html#$i" >/dev/null 2>&1
  i=$((i + 1))
done
echo "Screenshots in $shots"
