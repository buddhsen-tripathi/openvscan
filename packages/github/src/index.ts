import { createAppAuth } from "@octokit/auth-app";
import { verify } from "@octokit/webhooks-methods";
import { Octokit } from "octokit";

/**
 * GitHub App helpers shared by the web Worker (webhooks, install setup, repo
 * listing) and the engine Worker (scoped clone tokens, Check Runs, PR reviews,
 * sticky summary comments). Everything runs on the Workers runtime via fetch +
 * Web Crypto.
 */

export type { Octokit };

export interface AppCredentials {
  appId: string;
  privateKey: string;
}

export interface InstallationCredentials extends AppCredentials {
  installationId: string;
}

/** DER length prefix (short or long form). */
function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

function pem(label: string, der: Uint8Array): string {
  let bin = "";
  for (const b of der) bin += String.fromCharCode(b);
  const lines = btoa(bin).match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

/**
 * Normalise the GitHub App private key to PKCS#8 PEM.
 *
 * GitHub issues PKCS#1 keys ("BEGIN RSA PRIVATE KEY"), but the JWT signer
 * uses WebCrypto on Workers, which only imports PKCS#8. Also tolerates keys
 * stored with escaped newlines or squashed onto one line.
 */
export function normalizePrivateKey(raw: string): string {
  const text = raw.replace(/\\n/g, "\n").trim();
  const m = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/.exec(text);
  if (!m) return text;
  const label = m[1]!;
  const body = m[2]!.replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  if (label !== "RSA PRIVATE KEY") return pem(label, der);

  // PrivateKeyInfo ::= SEQUENCE { version 0, AlgorithmIdentifier rsaEncryption, OCTET STRING pkcs1 }
  const algorithm = [
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ];
  const octet = [0x04, ...derLength(der.length), ...der];
  const inner = [0x02, 0x01, 0x00, ...algorithm, ...octet];
  return pem("PRIVATE KEY", Uint8Array.from([0x30, ...derLength(inner.length), ...inner]));
}

/** Octokit authenticated as the GitHub App itself (JWT) — for app-level calls. */
export function appOctokit(creds: AppCredentials): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: creds.appId, privateKey: creds.privateKey },
  });
}

/** Octokit authenticated as a specific installation — for repo-scoped calls. */
export function installationOctokit(creds: InstallationCredentials): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: creds.appId,
      privateKey: creds.privateKey,
      installationId: Number(creds.installationId),
    },
  });
}

/**
 * Mint a short-lived installation token scoped to ONE repository with
 * read-only contents access. This is what the sandbox egress proxy uses to
 * clone — even if it leaked it could only read that one repo for ~1 hour.
 */
export async function createReadOnlyRepoToken(
  creds: InstallationCredentials,
  repoName: string,
): Promise<string> {
  const octokit = appOctokit(creds);
  const { data } = await octokit.request(
    "POST /app/installations/{installation_id}/access_tokens",
    {
      installation_id: Number(creds.installationId),
      repositories: [repoName],
      permissions: { contents: "read", metadata: "read" },
    },
  );
  return data.token;
}

/**
 * A short-lived codeload URL for a gzipped tarball of `repo` at `sha`. For a
 * private repository it carries a token that works for that archive only and
 * expires within minutes, so a sandbox can download it without a GitHub
 * token.
 */
export async function repoTarballUrl(
  creds: InstallationCredentials,
  owner: string,
  repo: string,
  sha: string,
): Promise<string> {
  const token = await createReadOnlyRepoToken(creds, repo);
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/tarball/${sha}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "user-agent": "openvscan",
        "x-github-api-version": "2022-11-28",
      },
      redirect: "manual",
    },
  );
  const location = res.headers.get("location");
  if (res.status < 300 || res.status >= 400 || !location) {
    throw new Error(`GitHub did not return a tarball URL (HTTP ${res.status})`);
  }
  return location;
}

export interface InstallationAccount {
  /** GitHub's numeric account id, as a string. */
  id: string;
  login: string;
  type: "User" | "Organization";
}

/** Fetch the account (user/org) a given installation belongs to. */
export async function getInstallationAccount(
  octokit: Octokit,
  installationId: string,
): Promise<InstallationAccount> {
  const { data } = await octokit.request(
    "GET /app/installations/{installation_id}",
    { installation_id: Number(installationId) },
  );
  const account = data.account as { id: number; login: string; type?: string } | null;
  if (!account) throw new Error(`Installation ${installationId} has no account`);
  return {
    id: String(account.id),
    login: account.login,
    type: account?.type === "Organization" ? "Organization" : "User",
  };
}

export interface InstallationRepo {
  githubRepoId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

/** List every repository the installation can access. */
export async function listInstallationRepos(
  octokit: Octokit,
): Promise<InstallationRepo[]> {
  const repos = await octokit.paginate("GET /installation/repositories");
  return repos.map((r) => ({
    githubRepoId: String(r.id),
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    defaultBranch: r.default_branch ?? "main",
    private: r.private,
  }));
}

/** Resolve a branch to its head commit sha. */
export async function getBranchHeadSha(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
): Promise<string> {
  const { data } = await octokit.request(
    "GET /repos/{owner}/{repo}/commits/{ref}",
    { owner, repo, ref: `heads/${branch}` },
  );
  return data.sha;
}

/** A pull request, in the shape the `pull_request` webhook sends it. */
export interface PullRequestData {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  merged?: boolean;
  draft?: boolean;
  user: { login: string; avatar_url?: string; type?: string };
  /** OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR, FIRST_TIMER, NONE, … */
  author_association?: string;
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  base: { ref: string; sha: string };
}

export async function getPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestData> {
  const { data } = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      owner,
      repo,
      pull_number: prNumber,
    },
  );
  return data as PullRequestData;
}

/** Post a plain comment on a PR (or issue). */
export async function postComment(
  octokit: Octokit,
  opts: { owner: string; repo: string; prNumber: number; body: string },
): Promise<void> {
  await octokit.request(
    "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
    {
      owner: opts.owner,
      repo: opts.repo,
      issue_number: opts.prNumber,
      body: opts.body,
    },
  );
}

/** React to a PR conversation comment, e.g. 👀 to acknowledge a command. */
export async function reactToComment(
  octokit: Octokit,
  opts: {
    owner: string;
    repo: string;
    commentId: number;
    content: "eyes" | "+1" | "confused";
  },
): Promise<void> {
  await octokit.request(
    "POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions",
    {
      owner: opts.owner,
      repo: opts.repo,
      comment_id: opts.commentId,
      content: opts.content,
    },
  );
}

/** Whether a user can push to the repo (write, maintain or admin). */
export async function canPush(
  octokit: Octokit,
  opts: { owner: string; repo: string; username: string },
): Promise<boolean> {
  try {
    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/collaborators/{username}/permission",
      opts,
    );
    return data.permission === "admin" || data.permission === "write";
  } catch {
    return false;
  }
}

/** Verify a GitHub webhook's `X-Hub-Signature-256` against the shared secret. */
export function verifyWebhookSignature(
  secret: string,
  payload: string,
  signature: string,
): Promise<boolean> {
  return verify(secret, payload, signature);
}

/* ------------------------------- Check Runs ------------------------------ */

export const CHECK_NAME = "OpenVScan Security Review";

export interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: "notice" | "warning" | "failure";
  title: string;
  message: string;
}

export async function createCheckRun(
  octokit: Octokit,
  opts: {
    owner: string;
    repo: string;
    headSha: string;
    externalId: string;
    detailsUrl: string;
  },
): Promise<string> {
  const { data } = await octokit.request("POST /repos/{owner}/{repo}/check-runs", {
    owner: opts.owner,
    repo: opts.repo,
    name: CHECK_NAME,
    head_sha: opts.headSha,
    external_id: opts.externalId,
    details_url: opts.detailsUrl,
    status: "in_progress",
    started_at: new Date().toISOString(),
    output: {
      title: "Security review in progress",
      summary: "Running scanners and the AI reviewer on this commit…",
    },
  });
  return String(data.id);
}

/**
 * Complete a Check Run. GitHub accepts at most 50 annotations per request, so
 * extra annotations are appended with follow-up PATCHes.
 */
export async function completeCheckRun(
  octokit: Octokit,
  opts: {
    owner: string;
    repo: string;
    checkRunId: string;
    conclusion: "success" | "failure" | "neutral" | "cancelled";
    title: string;
    summary: string;
    text?: string;
    annotations?: CheckAnnotation[];
  },
): Promise<void> {
  const annotations = opts.annotations ?? [];
  const batches: CheckAnnotation[][] = [];
  for (let i = 0; i < annotations.length; i += 50) {
    batches.push(annotations.slice(i, i + 50));
  }
  const clip = (s: string) => (s.length > 65_000 ? `${s.slice(0, 64_990)}\n…` : s);

  await octokit.request("PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}", {
    owner: opts.owner,
    repo: opts.repo,
    check_run_id: Number(opts.checkRunId),
    status: "completed",
    conclusion: opts.conclusion,
    completed_at: new Date().toISOString(),
    output: {
      title: opts.title,
      summary: clip(opts.summary),
      text: opts.text ? clip(opts.text) : undefined,
      annotations: batches[0],
    },
  });
  for (const batch of batches.slice(1)) {
    await octokit.request("PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}", {
      owner: opts.owner,
      repo: opts.repo,
      check_run_id: Number(opts.checkRunId),
      output: { title: opts.title, summary: clip(opts.summary), annotations: batch },
    });
  }
}

/* ------------------------------- PR reviews ------------------------------ */

export interface ReviewComment {
  path: string;
  /** Line in the PR head version of the file (RIGHT side). */
  line: number;
  /** For multi-line comments. Must be < line. */
  start_line?: number;
  body: string;
}

/**
 * Post a COMMENT review with inline comments. If GitHub rejects the inline
 * comments (422 — e.g. a line isn't part of the diff), retry once with the
 * body only so the summary still lands. Returns the review id.
 */
export async function createReview(
  octokit: Octokit,
  opts: {
    owner: string;
    repo: string;
    prNumber: number;
    commitSha: string;
    body: string;
    comments: ReviewComment[];
  },
): Promise<{ id: string; inlineDropped: boolean }> {
  const comments = opts.comments.map((c) => ({
    path: c.path,
    line: c.line,
    side: "RIGHT" as const,
    ...(c.start_line && c.start_line < c.line
      ? { start_line: c.start_line, start_side: "RIGHT" as const }
      : {}),
    body: c.body,
  }));
  const send = (withComments: boolean) =>
    octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
      owner: opts.owner,
      repo: opts.repo,
      pull_number: opts.prNumber,
      commit_id: opts.commitSha,
      event: "COMMENT",
      body: opts.body,
      comments: withComments ? comments : undefined,
    });
  try {
    const { data } = await send(comments.length > 0);
    return { id: String(data.id), inlineDropped: false };
  } catch (err) {
    if (comments.length > 0 && (err as { status?: number }).status === 422) {
      const { data } = await send(false);
      return { id: String(data.id), inlineDropped: true };
    }
    throw err;
  }
}

/** Marker used to find (and only ever edit) our own sticky summary comment. */
export const SUMMARY_MARKER = "<!-- openvscan:summary -->";

/**
 * Create or update the single OpenVScan summary comment on a PR. Prefers the
 * known comment id; falls back to searching for the marker (e.g. after the
 * stored id was lost), and creates a new comment if neither exists.
 */
export async function upsertSummaryComment(
  octokit: Octokit,
  opts: {
    owner: string;
    repo: string;
    prNumber: number;
    body: string;
    knownCommentId?: string | null;
    /** Only adopt an existing marker comment posted by this GitHub App. */
    appId: string | number;
  },
): Promise<string> {
  const body = `${SUMMARY_MARKER}\n${opts.body}`;
  const update = async (id: string) => {
    await octokit.request("PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}", {
      owner: opts.owner,
      repo: opts.repo,
      comment_id: Number(id),
      body,
    });
    return id;
  };

  if (opts.knownCommentId) {
    try {
      return await update(opts.knownCommentId);
    } catch (err) {
      if ((err as { status?: number }).status !== 404) throw err;
    }
  }

  const existing = await octokit.paginate(
    "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
    { owner: opts.owner, repo: opts.repo, issue_number: opts.prNumber, per_page: 100 },
  );
  // Anyone can paste the marker into a comment; only adopt our App's own.
  const ours = existing.find(
    (c) =>
      String(c.performed_via_github_app?.id) === String(opts.appId) &&
      c.body?.startsWith(SUMMARY_MARKER),
  );
  if (ours) return update(String(ours.id));

  const { data } = await octokit.request(
    "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
    { owner: opts.owner, repo: opts.repo, issue_number: opts.prNumber, body },
  );
  return String(data.id);
}
