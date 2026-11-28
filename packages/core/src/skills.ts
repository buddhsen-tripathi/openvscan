/**
 * Review skills: markdown instructions (SKILL.md style, optional YAML
 * frontmatter with `name` and `description`) that a repository owner attaches
 * to the AI reviewer. Pure helpers shared by the web Worker (validation,
 * import) and the engine (delivery to the sandbox).
 *
 * Skills are owner-trusted instructions, but they are often written by third
 * parties, so their text is normalised before it is stored: invisible and
 * bidirectional-control characters are removed (they can hide instructions
 * from the person reading the preview), line endings are unified and sizes
 * are capped.
 */

export const SKILL_SOURCES = ["paste", "upload", "url"] as const;
export type SkillSource = (typeof SKILL_SOURCES)[number];

export const SKILL_SOURCE_INFO: Record<SkillSource, string> = {
  paste: "Pasted",
  upload: "Uploaded",
  url: "Imported",
};

export const SKILL_LIMITS = {
  /** Characters. */
  name: 80,
  /** Characters (Anthropic's skill format allows 1024). */
  description: 1024,
  /**
   * UTF-8 bytes of the body (frontmatter excluded). Generous: the agent
   * opens a skill's file only when its description fits the change, so size
   * costs nothing until it's used. Real skills reach ~100 KB; D1 rows hold 2 MB.
   */
  body: 512 * 1024,
  /** UTF-8 bytes downloaded by a URL import, frontmatter included. */
  download: 520 * 1024,
  /** Skills per account. */
  perUser: 50,
  /** Skills selected on one repository. */
  perRepo: 20,
  /** UTF-8 bytes of skill text handed to the agent in one run. */
  runBudget: 2 * 1024 * 1024,
} as const;

/** Repository and run skill lists reference built-ins as `builtin:<slug>`. */
export const BUILTIN_SKILL_PREFIX = "builtin:";

export function builtinSkillId(slug: string): string {
  return `${BUILTIN_SKILL_PREFIX}${slug}`;
}

export function isBuiltinSkillId(id: string): boolean {
  return id.startsWith(BUILTIN_SKILL_PREFIX);
}

/** A rejected skill (bad URL, too large, not text…); its message is user-facing. */
export class SkillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillError";
  }
}

/* ------------------------------ Normalisation ----------------------------- */

/**
 * Zero-width characters, bidi embeddings/overrides/isolates, invisible
 * operators, the BOM and Unicode tag characters (which can spell out hidden
 * ASCII text).
 */
const INVISIBLE =
  /[​-‏‪-‮⁠-⁤⁦-⁩﻿\u{E0000}-\u{E007F}]/gu;
/** C0 controls other than tab and newline, and DEL. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Remove invisible, bidi-control and tag characters. */
export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE, "");
}

/**
 * How many invisible, bidi-control or tag characters `text` holds. Normal
 * markdown has none (a leading BOM aside), so a count is worth showing.
 */
export function countInvisible(text: string): number {
  return (text.replace(/^\uFEFF/, "").match(INVISIBLE) ?? []).length;
}

/** Multi-line text: LF line endings, no invisible or control characters. */
export function normalizeSkillText(text: string): string {
  return stripInvisible(text.replace(/\r\n?/g, "\n")).replace(CONTROL, "");
}

/** Single-line text: whitespace collapsed, trimmed, capped at `max` characters. */
export function normalizeSkillLine(text: string, max: number): string {
  const line = normalizeSkillText(text).replace(/\s+/g, " ").trim();
  // Cap by code points so a surrogate pair is never split.
  const chars = [...line];
  return chars.length > max ? chars.slice(0, max).join("").trimEnd() : line;
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export interface SkillContent {
  name: string;
  description: string;
  body: string;
}

/**
 * Validate and normalise a skill before it is stored. Name and description
 * are trimmed to their caps; an empty name or body, or a body over the cap,
 * is rejected.
 */
export function normalizeSkill(input: {
  name?: unknown;
  description?: unknown;
  body?: unknown;
}): SkillContent {
  const name = normalizeSkillLine(String(input.name ?? ""), SKILL_LIMITS.name);
  const description = normalizeSkillLine(
    String(input.description ?? ""),
    SKILL_LIMITS.description,
  );
  const body = normalizeSkillText(String(input.body ?? "")).trim();
  if (!name) throw new SkillError("Give the skill a name");
  if (!body) throw new SkillError("The skill has no instructions");
  if (utf8Bytes(body) > SKILL_LIMITS.body) {
    throw new SkillError(
      `The skill is larger than ${SKILL_LIMITS.body / 1024} KB. Split it or trim it down.`,
    );
  }
  return { name, description, body };
}

/** Hex sha256 of the body, stored with the snapshot. */
export async function skillSha256(body: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ------------------------------- Frontmatter ------------------------------ */

export interface ParsedSkill {
  name?: string;
  description?: string;
  /** The markdown after the frontmatter. */
  body: string;
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  return v;
}

/**
 * Split SKILL.md-style markdown into its frontmatter `name` / `description`
 * and body. Handles the YAML subset skills use: `key: value` (plain, single-
 * or double-quoted), block scalars (`|`, `>`) and indented continuation
 * lines. Text without a closed frontmatter block is all body.
 */
export function parseSkillMarkdown(raw: string): ParsedSkill {
  const text = normalizeSkillText(raw);
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return { body: text.trim() };
  const end = lines.findIndex(
    (l, i) => i > 0 && (l.trim() === "---" || l.trim() === "..."),
  );
  if (end < 0) return { body: text.trim() };

  const fields: Record<string, string> = {};
  const head = lines.slice(1, end);
  for (let i = 0; i < head.length; i++) {
    const m = /^([A-Za-z_][\w-]*)\s*:(.*)$/.exec(head[i]);
    if (!m) continue;
    const key = m[1].toLowerCase();
    let value = m[2].trim();
    // Following indented lines belong to this key.
    const more: string[] = [];
    while (i + 1 < head.length && /^(\s+|$)/.test(head[i + 1]) && !/^[A-Za-z_][\w-]*\s*:/.test(head[i + 1])) {
      more.push(head[++i]);
    }
    if (/^[|>][+-]?$/.test(value)) {
      const indent = Math.min(
        ...more.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length),
      );
      const block = more.map((l) => l.slice(Number.isFinite(indent) ? indent : 0));
      value = value.startsWith("|")
        ? block.join("\n").trim()
        : block.map((l) => l.trim()).join(" ").trim();
    } else {
      value = unquote([value, ...more.map((l) => l.trim())].join(" ").trim());
    }
    fields[key] = value;
  }
  return {
    name: fields.name || undefined,
    description: fields.description || undefined,
    body: lines.slice(end + 1).join("\n").trim(),
  };
}

/** Directory-safe slug for a skill name. */
export function skillSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return slug || "skill";
}

/** One distinct directory name per skill, in order (`a`, `a-2`, …). */
export function uniqueSkillSlugs(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    const base = skillSlug(n);
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
    used.add(slug);
    return slug;
  });
}

/**
 * SKILL.md as written into the sandbox: frontmatter the agent CLIs read
 * (name = the directory slug, which Claude Code requires to be lowercase and
 * hyphenated), then the stored body. Values are JSON-quoted, which is valid
 * YAML, so a description can't inject keys.
 */
export function skillFileContent(skill: {
  slug: string;
  name: string;
  description: string;
  body: string;
}): string {
  const description = skill.description || skill.name;
  return `---\nname: ${JSON.stringify(skill.slug)}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${skill.name}\n\n${skill.body.trim()}\n`;
}

/**
 * Keep a run's skills within the agent's text budget: in selection order,
 * each skill that still fits is included and the rest are skipped.
 */
export function fitSkillsToBudget<
  T extends { name: string; description: string; body: string },
>(skills: T[], budget: number = SKILL_LIMITS.runBudget): { included: T[]; skipped: T[] } {
  const included: T[] = [];
  const skipped: T[] = [];
  let used = 0;
  for (const s of skills) {
    const size = utf8Bytes(s.body) + utf8Bytes(s.name) + utf8Bytes(s.description);
    if (used + size > budget) {
      skipped.push(s);
      continue;
    }
    used += size;
    included.push(s);
  }
  return { included, skipped };
}

/* -------------------------------- URL import ------------------------------- */

/** Hosts a skill may be imported from (and redirected to). Exact match only. */
export const SKILL_URL_HOSTS = [
  "github.com",
  "raw.githubusercontent.com",
  "gist.github.com",
  "gist.githubusercontent.com",
  "skills.sh",
  "www.skills.sh",
] as const;

export function isAllowedSkillHost(host: string): boolean {
  return (SKILL_URL_HOSTS as readonly string[]).includes(host.toLowerCase());
}

/**
 * Where to fetch a skill from:
 * - `raw`: one raw file URL.
 * - `skills.sh`: a skills.sh listing (`skills.sh/<owner>/<repo>/<skill>`),
 *   i.e. the SKILL.md whose frontmatter name is `<skill>` somewhere in the
 *   GitHub repository `<owner>/<repo>`.
 */
export type SkillImportPlan =
  | { kind: "raw"; url: string }
  | { kind: "skills.sh"; owner: string; repo: string; skill: string };

const SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/;

/** Parse an https URL on an allowlisted host, or throw a user-facing error. */
export function parseSkillUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new SkillError("That isn't a valid URL");
  }
  if (url.protocol !== "https:") throw new SkillError("Only https:// URLs can be imported");
  if (url.username || url.password) throw new SkillError("URLs with credentials aren't accepted");
  if (url.port && url.port !== "443") throw new SkillError("URLs with a custom port aren't accepted");
  if (!isAllowedSkillHost(url.hostname)) {
    throw new SkillError(
      "Skills can be imported from github.com, raw.githubusercontent.com, gist.github.com or skills.sh",
    );
  }
  return url;
}

/** Map a user-supplied URL to what should be fetched. Throws `SkillError`. */
export function planSkillImport(input: string): SkillImportPlan {
  const url = parseSkillUrl(input);
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.some((p) => p === ".." || p === "." || /[\0\\]/.test(p))) {
    throw new SkillError("That URL has an invalid path");
  }
  const enc = (segs: string[]) => segs.map(encodeURIComponent).join("/");
  const raw = (h: string, segs: string[]): SkillImportPlan => ({
    kind: "raw",
    url: `https://${h}/${enc(segs)}`,
  });

  if (host === "skills.sh" || host === "www.skills.sh") {
    const [owner, repo, skill] = parts;
    if (!owner || !repo || !skill || ![owner, repo, skill].every((s) => SEGMENT.test(s))) {
      throw new SkillError("Use a skills.sh skill page: https://skills.sh/<owner>/<repo>/<skill>");
    }
    return { kind: "skills.sh", owner, repo, skill };
  }
  if (host === "github.com") {
    const [owner, repo, kind, ...rest] = parts;
    if (!owner || !repo || !SEGMENT.test(owner) || !SEGMENT.test(repo)) {
      throw new SkillError("Use a link to a file on GitHub");
    }
    if (!kind) return raw("raw.githubusercontent.com", [owner, repo, "HEAD", "SKILL.md"]);
    if ((kind === "blob" || kind === "raw") && rest.length >= 2) {
      return raw("raw.githubusercontent.com", [owner, repo, ...rest]);
    }
    if (kind === "tree" && rest.length >= 1) {
      const last = rest[rest.length - 1];
      return raw(
        "raw.githubusercontent.com",
        [owner, repo, ...rest, ...(/\.(md|markdown)$/i.test(last) ? [] : ["SKILL.md"])],
      );
    }
    throw new SkillError("Use a link to a file on GitHub (…/blob/<branch>/path/SKILL.md)");
  }
  if (host === "raw.githubusercontent.com") {
    if (parts.length < 4) throw new SkillError("That raw.githubusercontent.com URL has no file path");
    return raw(host, parts);
  }
  if (host === "gist.github.com") {
    // gist.github.com/<user>/<id>: the raw endpoint serves the gist's first file.
    if (parts.length === 2) return raw("gist.githubusercontent.com", [...parts, "raw"]);
    if (parts.length >= 3 && parts[2] === "raw") return raw("gist.githubusercontent.com", parts);
    throw new SkillError("Use a gist link: https://gist.github.com/<user>/<id>");
  }
  // gist.githubusercontent.com
  if (parts.length < 3) throw new SkillError("That gist URL has no file path");
  return raw(host, parts);
}

/**
 * Where a redirect may go: an https URL on an allowlisted host, resolved
 * against the URL that answered. Throws `SkillError` otherwise.
 */
export function redirectTarget(from: string, location: string | null): string {
  if (!location) throw new SkillError("The server sent a redirect without a location");
  let next: URL;
  try {
    next = new URL(location, from);
  } catch {
    throw new SkillError("The server redirected to an invalid URL");
  }
  if (next.protocol !== "https:" || next.username || next.password || (next.port && next.port !== "443")) {
    throw new SkillError("The server redirected to a URL that isn't plain https");
  }
  if (!isAllowedSkillHost(next.hostname)) {
    throw new SkillError(`The server redirected to ${next.hostname}, which isn't an allowed host`);
  }
  return next.toString();
}

/** Content types that can hold a markdown file. */
export function isTextContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  const type = contentType.split(";")[0].trim().toLowerCase();
  return (
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "application/octet-stream" ||
    type === "application/x-markdown"
  );
}

/** Decode UTF-8 text, rejecting NUL bytes and invalid encodings (binary). */
export function decodeSkillBytes(bytes: Uint8Array): string {
  if (bytes.includes(0)) throw new SkillError("That file is binary, not markdown");
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new SkillError("That file isn't UTF-8 text");
  }
}

/** Raw URLs to try first for a skills.sh listing, cheapest guesses first. */
export function skillsShCandidates(owner: string, repo: string, skill: string): string[] {
  const base = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD`;
  return [
    `${base}/skills/${skill}/SKILL.md`,
    `${base}/${skill}/SKILL.md`,
    `${base}/.claude/skills/${skill}/SKILL.md`,
    `${base}/SKILL.md`,
  ];
}

/**
 * SKILL.md paths of a repository tree most likely to hold `skill`, best
 * first: the folder name equals the skill, then one is a suffix of the other
 * (`react-best-practices` for `vercel-react-best-practices`), then contains.
 */
export function rankSkillPaths(paths: string[], skill: string, limit = 8): string[] {
  const want = skill.toLowerCase();
  const score = (path: string) => {
    const segs = path.split("/");
    const dir = (segs.length > 1 ? segs[segs.length - 2] : "").toLowerCase();
    if (dir === want) return 0;
    if (dir && (want.endsWith(dir) || dir.endsWith(want))) return 1;
    if (dir && (want.includes(dir) || dir.includes(want))) return 2;
    return 3;
  };
  return paths
    .filter((p) => p === "SKILL.md" || p.endsWith("/SKILL.md"))
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s < 3)
    .sort((a, b) => a.s - b.s || a.p.length - b.p.length)
    .slice(0, limit)
    .map((x) => x.p);
}
