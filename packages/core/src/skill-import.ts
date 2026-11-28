import {
  decodeSkillBytes,
  isTextContentType,
  normalizeSkill,
  parseSkillMarkdown,
  planSkillImport,
  rankSkillPaths,
  redirectTarget,
  SKILL_LIMITS,
  type SkillContent,
  SkillError,
  skillsShCandidates,
} from "./skills";

/**
 * Server-side import of a skill from a URL. Only https URLs on the skill
 * hosts allowlist are fetched; redirects are followed by hand and only to
 * allowlisted hosts; every request has a timeout and a size cap, and binary
 * content is refused. The caller shows the result to the user, who saves it
 * as a snapshot: nothing is fetched again at review time.
 */

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ImportOptions {
  fetch?: Fetch;
  /** Per request. */
  timeoutMs?: number;
}

export interface ImportedSkill extends SkillContent {
  /** The file the content came from (after mapping and redirects). */
  sourceUrl: string;
}

const MAX_REDIRECTS = 5;
/** The repository tree listing used to find a skills.sh skill. */
const TREE_MAX_BYTES = 4 * 1024 * 1024;

class NotFound extends SkillError {}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) {
    throw new SkillError(`That file is larger than ${Math.round(max / 1024)} KB`);
  }
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new SkillError(`That file is larger than ${Math.round(max / 1024)} KB`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * GET an allowlisted URL, following up to 5 redirects that stay on the
 * allowlist. Returns the final URL and body text.
 */
export async function fetchAllowlisted(
  url: string,
  opts: ImportOptions & { maxBytes?: number; accept?: string } = {},
): Promise<{ url: string; text: string }> {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxBytes ?? SKILL_LIMITS.download;
  // The first URL must pass the same check as a redirect target.
  let current = redirectTarget(url, url);
  for (let hop = 0; ; hop++) {
    let res: Response;
    try {
      res = await doFetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          accept: opts.accept ?? "text/markdown, text/plain;q=0.9, */*;q=0.1",
          "user-agent": "OpenVScan-skill-import",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new SkillError(`${new URL(current).hostname} did not answer within ${timeoutMs / 1000}s`);
      }
      throw new SkillError(`Could not reach ${new URL(current).hostname}`);
    }
    if (res.status >= 300 && res.status < 400) {
      if (hop >= MAX_REDIRECTS) throw new SkillError("Too many redirects");
      current = redirectTarget(current, res.headers.get("location"));
      continue;
    }
    if (res.status === 404) throw new NotFound("Nothing was found at that URL");
    if (!res.ok) throw new SkillError(`${new URL(current).hostname} answered ${res.status}`);
    if (!isTextContentType(res.headers.get("content-type"))) {
      throw new SkillError("That URL isn't a text file");
    }
    const text = decodeSkillBytes(await readCapped(res, maxBytes));
    return { url: current, text };
  }
}

function toSkill(text: string, sourceUrl: string, fallbackName: string): ImportedSkill {
  const parsed = parseSkillMarkdown(text);
  return {
    ...normalizeSkill({
      name: parsed.name ?? fallbackName,
      description: parsed.description ?? "",
      body: parsed.body,
    }),
    sourceUrl,
  };
}

/** A name for a file without frontmatter: its folder or file name. */
function nameFromUrl(url: string): string {
  const segs = new URL(url).pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const file = segs[segs.length - 1] ?? "skill";
  if (/^skill\.md$/i.test(file) && segs.length > 1) return segs[segs.length - 2];
  return file.replace(/\.(md|markdown|txt)$/i, "") || "skill";
}

/** Fetch, parse and normalise a skill from a user-supplied URL. */
export async function importSkillFromUrl(
  input: string,
  opts: ImportOptions = {},
): Promise<ImportedSkill> {
  const plan = planSkillImport(input);
  if (plan.kind === "raw") {
    const { url, text } = await fetchAllowlisted(plan.url, opts);
    return toSkill(text, url, nameFromUrl(url));
  }

  // skills.sh lists skills by frontmatter name; the folder in the repository
  // can differ. Try the usual layouts, then search the repository tree.
  const { owner, repo, skill } = plan;
  const matches = (text: string) =>
    parseSkillMarkdown(text).name?.trim().toLowerCase() === skill.toLowerCase();
  const tried = new Set<string>();
  const attempt = async (url: string) => {
    if (tried.has(url)) return null;
    tried.add(url);
    try {
      const got = await fetchAllowlisted(url, opts);
      return matches(got.text) ? got : null;
    } catch (err) {
      if (err instanceof NotFound) return null;
      throw err;
    }
  };
  for (const url of skillsShCandidates(owner, repo, skill)) {
    const got = await attempt(url);
    if (got) return toSkill(got.text, got.url, skill);
  }

  let paths: string[] = [];
  try {
    const res = await (opts.fetch ?? fetch)(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
      {
        // A redirect (renamed repository) answers 3xx and is reported below.
        redirect: "manual",
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "OpenVScan-skill-import",
        },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      },
    );
    if (res.status === 404) throw new SkillError(`GitHub has no public repository ${owner}/${repo}`);
    if (!res.ok) throw new SkillError(`GitHub answered ${res.status} listing ${owner}/${repo}`);
    const tree = JSON.parse(decodeSkillBytes(await readCapped(res, TREE_MAX_BYTES))) as {
      tree?: { path?: unknown; type?: unknown }[];
    };
    paths = (tree.tree ?? [])
      .filter((t) => t.type === "blob" && typeof t.path === "string")
      .map((t) => t.path as string);
  } catch (err) {
    if (err instanceof SkillError) throw err;
    throw new SkillError(`Could not list ${owner}/${repo} on GitHub`);
  }
  for (const path of rankSkillPaths(paths, skill)) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    const got = await attempt(url);
    if (got) return toSkill(got.text, got.url, skill);
  }
  throw new SkillError(
    `No SKILL.md named "${skill}" was found in ${owner}/${repo}. Link the file on GitHub instead.`,
  );
}
