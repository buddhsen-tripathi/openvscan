#!/bin/sh
# Drop the rules OpenGrep can't parse from the curated set in $1, until a
# scan runs clean. One unparseable rule makes OpenGrep abort the whole scan.
set -e
out="$1"
probe="$(mktemp -d)"
echo "x = 1" >"$probe/a.py"
for pass in 1 2 3 4 5; do
  opengrep scan --config "$out" --json --output "$probe/report.json" "$probe" >/dev/null 2>&1 || true
  removed=$(python3 -I "$(dirname "$0")/curate.py" --drop "$out" "$probe/report.json")
  echo "prune pass $pass: removed $removed rule(s)"
  if [ "$removed" = 0 ]; then
    rm -rf "$probe"
    exit 0
  fi
done
echo "rules still fail to parse after 5 passes" >&2
exit 1
