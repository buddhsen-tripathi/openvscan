#!/bin/sh
# Print the OpenGrep rule directories (see rules/curate.py, LANGUAGE_DIR)
# for the languages present under $1, one per line. Vendored, generated and
# test code is skipped, as in the scan itself.
find "$1" \( -name .git -o -name node_modules -o -name vendor -o -name third_party -o -name dist \) -prune -o -type f -print 2>/dev/null |
  awk '
    { n = split($0, p, "."); ext = (n > 1) ? tolower(p[n]) : "" }
    ext ~ /^(js|jsx|mjs|cjs|ts|tsx|mts|cts|vue|svelte)$/ { seen["js"] = 1 }
    ext ~ /^(html|htm)$/ { seen["html"] = 1; seen["js"] = 1 }
    ext ~ /^(py|pyi)$/ { seen["python"] = 1 }
    ext == "go" { seen["go"] = 1 }
    ext ~ /^(java|kt|kts|scala|sc)$/ { seen["jvm"] = 1 }
    ext ~ /^(c|h|cc|cpp|cxx|hpp|hh|hxx)$/ { seen["c"] = 1 }
    ext ~ /^(cs|cshtml|razor)$/ { seen["csharp"] = 1 }
    ext ~ /^(php|phtml)$/ { seen["php"] = 1 }
    ext ~ /^(rb|erb|rake|gemspec)$/ { seen["ruby"] = 1 }
    ext == "rs" { seen["rust"] = 1 }
    ext == "swift" { seen["swift"] = 1 }
    ext == "sol" { seen["solidity"] = 1 }
    ext ~ /^(cls|trigger)$/ { seen["apex"] = 1 }
    ext ~ /^(ex|exs)$/ { seen["elixir"] = 1 }
    ext ~ /^(sh|bash)$/ { seen["bash"] = 1 }
    ext ~ /^(clj|cljs|cljc)$/ { seen["clojure"] = 1 }
    ext ~ /^(ml|mli)$/ { seen["ocaml"] = 1 }
    END { for (l in seen) print l }
  '
