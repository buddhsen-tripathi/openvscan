#!/usr/bin/env python3
"""Build OpenVScan's OpenGrep rule set from several open-source rule packs.

Runs at image build time (see engine/container/Dockerfile). Reads each pack,
keeps the rules that find real vulnerabilities, and writes them to
<out>/<language>/<pack>/<original path>, so a scan can load only the
languages a repository has (see scripts/languages.sh, whose names match
LANGUAGE_DIR below). Everything else is dropped:

- rules not in the "security" category, or tagged as "audit" without "vuln"
  (they flag a risky-looking API, not a bug), or LOW confidence;
- languages and topics other scanners cover with less noise: Terraform/HCL,
  Dockerfile, Kubernetes YAML and JSON (Trivy config), GitHub Actions YAML
  (zizmor) and secrets (Gitleaks);
- rule families that fire on a sink with no untrusted source, which is where
  most false positives come from (see NOISY below).

Weak-crypto and randomness rules are kept but demoted to INFO, since they are
rarely exploitable on their own.

Usage: curate.py <out-dir> <pack-name>=<dir>[:<subdir>,<subdir>...] ...
Prints a summary. Exits non-zero if a pack yields no rules, so a pack that
changes layout fails the build instead of silently shrinking coverage.

       curate.py --drop <out-dir> <opengrep-errors.json>
Removes the rules OpenGrep failed to parse (one bad rule aborts a whole scan),
taken from the "errors" of a JSON scan report. Prints how many it removed.
"""

import json

import os
import re
import sys

import yaml

# A rule's first language → the directory it goes in. Unlisted languages go
# to "other", which every scan loads.
LANGUAGE_DIR = {
    "javascript": "js", "js": "js", "typescript": "js", "ts": "js", "jsx": "js", "tsx": "js", "vue": "js",
    "html": "html",
    "python": "python", "py": "python", "python3": "python",
    "go": "go", "golang": "go",
    "java": "jvm", "kotlin": "jvm", "kt": "jvm", "scala": "jvm",
    "c": "c", "cpp": "c", "c++": "c",
    "csharp": "csharp", "c#": "csharp",
    "php": "php",
    "ruby": "ruby", "rb": "ruby",
    "rust": "rust",
    "swift": "swift",
    "solidity": "solidity", "sol": "solidity",
    "apex": "apex",
    "elixir": "elixir", "ex": "elixir",
    "bash": "bash", "sh": "bash",
    "clojure": "clojure",
    "ocaml": "ocaml",
}

SKIP_LANGUAGES = {"terraform", "hcl", "dockerfile", "yaml", "json", "generic", "regex", "none"}

# Sink-only rule families: they match a call shape, not a data flow from
# untrusted input, and real-world triage dismisses them almost every time.
NOISY = re.compile(
    r"detect-non-literal-|object-injection|unsafe-dynamic-method|html-in-template-string"
    r"|package-dependencies-check|missing-user|detect-child-process|non-literal-fs-filename"
    r"|insecure-document-method|prototype-pollution-loop|express-check-csurf"
    # GitLab's ports of Bandit (B101 assert, B404/B603 subprocess, B113
    # timeouts, B3xx XML imports, B108 tmp paths) and Flawfinder (every
    # strcpy/printf-shaped call in C), which match an API, not a flow.
    r"|_rule-assert-used|request-without-timeout|^python_xml_rule-|hardcodedtmp"
    r"|bindall-interfaces|subprocess-call|start-process-with-no-shell|os-popen2"
    r"|^python_exec_rule-os-path|import-telnib|_ftp_rule-ftplib|import-pycrypto"
    r"|buffer-noassert|detect-new-buffer|non-literal-regexp|non-literal-require"
    r"|possible-timing-attacks|^go_blocklist_rule-|_strings_rule-"
    r"|^c_(buffer|misc|obsolete|race|tmpfile|access)_rule-"
    # Hard-coded credentials: Gitleaks finds these with far fewer misses.
    r"|hard-?coded-?(secret|password|credential|token|key|api)",
    re.IGNORECASE,
)
# Kept, but INFO: hard to exploit without more context.
DEMOTE_CWE = re.compile(r"CWE-(327|328|330|331|338|916)\b")


def as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def keep(rule):
    """None to keep the rule, or the reason it's dropped."""
    meta = rule.get("metadata") or {}
    category = str(meta.get("category", "security")).lower()
    if category != "security":
        return "not security"
    subs = {str(s).lower() for s in as_list(meta.get("subcategory"))}
    if "audit" in subs and "vuln" not in subs:
        return "audit"
    if str(meta.get("confidence", "")).upper() == "LOW":
        return "low confidence"
    langs = {str(l).lower() for l in as_list(rule.get("languages"))}
    if not langs or langs <= SKIP_LANGUAGES:
        return "language covered elsewhere"
    if NOISY.search(str(rule.get("id", ""))):
        return "noisy family"
    return None


def curate_file(path):
    with open(path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    if not isinstance(doc, dict) or not isinstance(doc.get("rules"), list):
        return [], {}
    kept, dropped = [], {}
    for rule in doc["rules"]:
        if not isinstance(rule, dict) or "id" not in rule:
            continue
        why = keep(rule)
        if why:
            dropped[why] = dropped.get(why, 0) + 1
            continue
        cwe = " ".join(str(c) for c in as_list((rule.get("metadata") or {}).get("cwe")))
        if DEMOTE_CWE.search(cwe):
            rule["severity"] = "INFO"
        kept.append(rule)
    return kept, dropped


def rule_files(root, subdirs):
    bases = [os.path.join(root, s) for s in subdirs] if subdirs else [root]
    for base in bases:
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            for name in sorted(filenames):
                if not name.endswith((".yaml", ".yml")):
                    continue
                if ".test." in name or name.startswith("."):
                    continue
                yield os.path.join(dirpath, name)


def drop(out, report):
    with open(report, encoding="utf-8") as f:
        errors = json.load(f).get("errors") or []
    # rule_id is the rule's dotted path under the config root, then its id
    # (which may itself contain dots).
    bad = {str(e["rule_id"]) for e in errors if e.get("rule_id")}
    removed = 0
    for path in rule_files(out, []):
        with open(path, encoding="utf-8") as f:
            doc = yaml.safe_load(f)
        rules = doc.get("rules") or []
        kept = [r for r in rules if not any(b == str(r.get("id")) or b.endswith("." + str(r.get("id"))) for b in bad)]
        if len(kept) == len(rules):
            continue
        removed += len(rules) - len(kept)
        if kept:
            with open(path, "w", encoding="utf-8") as f:
                yaml.safe_dump({"rules": kept}, f, sort_keys=False, allow_unicode=True)
        else:
            os.remove(path)
    print(removed)


def main():
    if sys.argv[1] == "--drop":
        drop(sys.argv[2], sys.argv[3])
        return
    out = sys.argv[1]
    total = 0
    failed = False
    per_language = {}
    for spec in sys.argv[2:]:
        name, _, rest = spec.partition("=")
        root, _, subs = rest.partition(":")
        subdirs = [s for s in subs.split(",") if s]
        kept_n, dropped_all, files = 0, {}, 0
        for path in rule_files(root, subdirs):
            try:
                kept, dropped = curate_file(path)
            except yaml.YAMLError:
                continue
            for k, v in dropped.items():
                dropped_all[k] = dropped_all.get(k, 0) + v
            by_dir = {}
            for rule in kept:
                first = str(as_list(rule.get("languages"))[0]).lower()
                by_dir.setdefault(LANGUAGE_DIR.get(first, "other"), []).append(rule)
            rel = os.path.relpath(path, root)
            for lang, rules in by_dir.items():
                dest = os.path.join(out, lang, name, rel)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(dest, "w", encoding="utf-8") as f:
                    yaml.safe_dump({"rules": rules}, f, sort_keys=False, allow_unicode=True)
                per_language[lang] = per_language.get(lang, 0) + len(rules)
                files += 1
            kept_n += len(kept)
        total += kept_n
        summary = ", ".join(f"{k} {v}" for k, v in sorted(dropped_all.items()))
        print(f"{name}: kept {kept_n} rules in {files} files; dropped: {summary or 'none'}")
        if kept_n == 0:
            failed = True
    print("by language: " + ", ".join(f"{k} {v}" for k, v in sorted(per_language.items())))
    print(f"total: {total} rules")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
