/**
 * PR diff model built from GitHub's "list pull request files" API, i.e. the
 * exact diff GitHub renders and accepts review comments against.
 */

export interface PrFile {
  filename: string;
  status: string; // added | modified | removed | renamed | …
  patch?: string;
  previous_filename?: string;
}

export interface FileDiff {
  status: string;
  /** Lines (head side) the PR added or modified. */
  added: number[];
  /** Head-side lines inside a hunk: valid targets for inline review comments. */
  commentable: number[];
  /** No patch (binary / too large): only file-level membership is known. */
  noPatch: boolean;
  /** Raw patch (capped), to match dependency findings against lockfile edits. */
  patch?: string;
}

export type DiffMap = Record<string, FileDiff>;

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

const PATCH_CAP = 256 * 1024;
/** How far above a changed version line to look for the package name. */
const PACKAGE_WINDOW = 40;

export function parsePatch(patch: string): { added: number[]; commentable: number[] } {
  const added: number[] = [];
  const commentable: number[] = [];
  let line = 0;
  for (const l of patch.split("\n")) {
    const h = HUNK.exec(l);
    if (h) {
      line = Number(h[1]);
      continue;
    }
    if (line === 0) continue;
    if (l.startsWith("+")) {
      added.push(line);
      commentable.push(line);
      line++;
    } else if (l.startsWith("-")) {
      // removed line: exists only on the base side
    } else if (l.startsWith("\\")) {
      // "\ No newline at end of file"
    } else {
      commentable.push(line);
      line++;
    }
  }
  return { added, commentable };
}

export function buildDiffMap(files: PrFile[]): DiffMap {
  const map: DiffMap = {};
  for (const f of files) {
    if (f.status === "removed") continue;
    if (!f.patch) {
      map[f.filename] = { status: f.status, added: [], commentable: [], noPatch: true };
      continue;
    }
    map[f.filename] = {
      status: f.status,
      ...parsePatch(f.patch),
      noPatch: false,
      patch: f.patch.length <= PATCH_CAP ? f.patch : undefined,
    };
  }
  return map;
}

/**
 * Did the PR introduce or change this dependency? A lockfile edit alone
 * doesn't count: the package and its installed version must appear on an
 * added line, so pre-existing vulnerable dependencies don't block the PR.
 */
export function isDependencyInDiff(
  diff: DiffMap | null,
  file: string | null,
  pkg: string | null,
  version: string | null,
): boolean {
  if (!diff || !file) return false;
  const d = diff[file];
  if (!d) return false;
  if (d.noPatch || d.patch === undefined) return true;
  if (!pkg) return false;
  // The installed version sits on an added line, and the package name is on
  // that line or shortly above it in the same hunk (lockfile entries put the
  // name and the version on different lines).
  const lines = d.patch.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (!l.startsWith("+") || (version && !l.includes(version))) continue;
    if (!version && !l.includes(pkg)) continue;
    for (let j = i; j >= 0 && j >= i - PACKAGE_WINDOW; j--) {
      const above = lines[j]!;
      if (above.startsWith("@@")) break;
      if (!above.startsWith("-") && above.includes(pkg)) return true;
    }
  }
  return false;
}

/**
 * Did the PR touch this finding? Line-level when we have a line and a patch;
 * file-level for findings without a line or files without a patch.
 */
export function isInDiff(
  diff: DiffMap | null,
  file: string | null,
  startLine: number | null,
  endLine: number | null,
): boolean {
  if (!diff || !file) return false;
  const d = diff[file];
  if (!d) return false;
  if (d.noPatch || startLine == null) return true;
  const end = endLine && endLine >= startLine ? endLine : startLine;
  return d.added.some((l) => l >= startLine && l <= end);
}

/** Pick the head-side line to anchor an inline comment on, if any. */
export function commentLine(
  diff: DiffMap | null,
  file: string | null,
  startLine: number | null,
  endLine: number | null,
): { line: number; startLine?: number } | null {
  if (!diff || !file || startLine == null) return null;
  const d = diff[file];
  if (!d || d.noPatch) return null;
  const end = endLine && endLine >= startLine ? endLine : startLine;
  const set = new Set(d.commentable);
  // Multi-line only if the whole range is commentable; otherwise anchor on
  // the last commentable line inside the range.
  let allIn = true;
  for (let l = startLine; l <= end; l++) if (!set.has(l)) allIn = false;
  if (allIn) return end > startLine ? { line: end, startLine } : { line: startLine };
  for (let l = end; l >= startLine; l--) if (set.has(l)) return { line: l };
  return null;
}

/** Reassemble a unified diff for the agent, capped to `maxBytes`. */
export function renderUnifiedDiff(files: PrFile[], maxBytes = 400_000): {
  text: string;
  truncated: boolean;
} {
  let text = "";
  let truncated = false;
  for (const f of files) {
    const from = f.previous_filename ?? f.filename;
    const header = `diff --git a/${from} b/${f.filename}\n--- ${f.status === "added" ? "/dev/null" : `a/${from}`}\n+++ ${f.status === "removed" ? "/dev/null" : `b/${f.filename}`}\n`;
    const body = f.patch ? `${f.patch}\n` : "(binary or too large to show)\n";
    if (text.length + header.length + body.length > maxBytes) {
      truncated = true;
      text += `${header}(omitted: diff too large; read the file directly)\n`;
      continue;
    }
    text += header + body;
  }
  return { text, truncated };
}
