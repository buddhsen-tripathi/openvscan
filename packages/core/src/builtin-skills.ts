import { builtinSkillId } from "./skills";

/**
 * Review skills shipped with OpenVScan. Written for this project; they cite
 * OWASP and CWE identifiers for orientation but don't reproduce OWASP text.
 * Workers have no filesystem and packages are source-only, so the bodies
 * live here as strings.
 */

export interface BuiltinSkill {
  slug: string;
  name: string;
  description: string;
  body: string;
}

const OWASP_ASVS = `Use this checklist on the parts of the diff it applies to. Each question names the ASVS 5.0 chapter it comes from (V8 = authorization, and so on) so you can cite it in a finding. Skip groups the change doesn't touch; don't report a missing control unless the diff introduces the code path that needs it.

## How to use it
1. Classify what the change touches (new route, new query, file upload, token handling, config…).
2. Answer only the questions for those areas, by reading the code, not by guessing.
3. A "no" is a finding only when you can describe the request an attacker sends and what they get back. Otherwise leave it out or mention it in the summary.

## Access control (V8)
- Does every new or changed handler that reads or writes a record check that the caller owns it or is allowed to see it (CWE-639)? Look for lookups by id that don't also filter by user, tenant or organisation.
- Is the check on the server, at the point of access, rather than only in the UI or a client-side route guard?
- Are admin or staff-only operations gated by a role check, and is the role taken from the session rather than the request body?
- When a list or search endpoint is added, is it scoped to the caller's tenant before pagination and filtering?
- Can a user change a foreign key (owner_id, org_id, account_id) on update to move a record into someone else's space?
- Do bulk operations (delete many, export) check every id, not just the first?

## Authentication (V6)
- Do new login, reset or verification flows compare secrets in constant time and expire the token after one use?
- Are password-reset and magic-link tokens long, random (CSPRNG) and bound to one account?
- Does the change add a way to log in or act as a user that skips the normal checks (debug flag, default account, header-based impersonation)?
- Are passwords hashed with a slow, salted algorithm (argon2, bcrypt, scrypt, PBKDF2 with high iterations), never a plain or fast hash?
- Are failed-login messages the same for an unknown user and a wrong password where the product cares about account enumeration?

## Sessions and tokens (V7, V9)
- Are session cookies set HttpOnly, Secure and with SameSite when the diff creates or changes them?
- Is the session id or token regenerated after login and invalidated on logout or password change?
- When JWTs are verified, is the algorithm pinned, the signature checked, and are expiry, issuer and audience validated? Is \`alg: none\` or a key-confusion path possible?
- Are tokens kept out of URLs, logs and error messages?

## Input validation and output encoding (V1, V2)
- Is untrusted input validated against an allowlist (type, length, format) at the boundary, not only sanitised later?
- Where user data is rendered as HTML, does it go through the framework's escaping? Flag raw HTML sinks (innerHTML, dangerouslySetInnerHTML, v-html, |safe, Markup) that receive user data.
- Is data placed into URLs, HTML attributes, JavaScript or CSS encoded for that context?
- Are redirects after login limited to relative paths or an allowlist (only report if it chains into token theft)?

## Injection (V1)
- Are SQL and NoSQL queries built with parameters or a query builder, never string concatenation or template literals with user input?
- Do shell commands get an argument array with no shell, or are inputs strictly validated? Flag \`exec\`, \`system\`, \`shell=True\` and backticks with user data.
- Are file paths built from user input normalised and checked to stay inside the intended directory (path traversal, CWE-22)?
- Is user input used in template rendering (server-side template injection), LDAP filters, XPath or regular expressions built at runtime?
- Is untrusted data deserialised with a format that can instantiate types (pickle, Java serialisation, YAML load, PHP unserialize)?

## Cryptography and secrets (V11, V13)
- Are keys, tokens and passwords read from configuration or a secret store rather than committed in code?
- Is randomness for ids, tokens or nonces from a CSPRNG (crypto.randomUUID, secrets, SecureRandom), not Math.random or time-based?
- Is encryption authenticated (AES-GCM, ChaCha20-Poly1305) with a unique nonce per message, and is ECB or a static IV avoided?
- Are signatures and MACs compared in constant time?
- Is TLS certificate verification left on in new HTTP clients?

## Files and resources (V5)
- Do uploads check size, type (by content, not only extension) and store files outside the web root with generated names?
- Can an uploaded archive be extracted outside the target directory (zip slip)?
- Do endpoints that fetch a URL supplied by a user restrict the scheme and destination (SSRF, see the API skill)?
- Are user-controlled file names sanitised before they reach Content-Disposition or the filesystem?

## API and web service (V4)
- Are new endpoints covered by the same authentication middleware as their siblings? Look for routes registered outside the protected group.
- Does the endpoint accept only the fields the caller may set (mass assignment)?
- Are CORS settings narrow: no reflected origin with credentials, no wildcard on authenticated APIs?
- Do state-changing requests that rely on cookies have CSRF protection (token or SameSite)?

## Configuration (V13)
- Does the change turn on debug modes, verbose errors, directory listings or admin consoles in production paths?
- Are security headers or framework protections removed or weakened?
- Are default credentials or sample keys shipped in config that is deployed?

## Logging and errors (V16)
- Are secrets, tokens, passwords or full card numbers written to logs?
- Do error responses leak stack traces, SQL or internal paths to the client?
- Is user input written to logs in a way that can forge entries in a log format other tools parse (only when it matters to the product)?

## Evidence needed to report
Name the entry point, the input the attacker controls, the path to the sink with file:line references, and the missing or bypassable control. If any link is an assumption, say so and lower the confidence, or drop it.

## Common false positives
- An ownership check done by a shared helper, middleware, ORM scope or row-level security that you didn't open: find it before reporting.
- Values from env vars, server config or the database that only admins write.
- Parameterised queries that look like concatenation (query builders, tagged templates such as sql\`\`).
- Test fixtures, seeds and example configs.
`;

const API_SECURITY = `Apply this when the diff adds or changes HTTP, GraphQL or RPC endpoints, their handlers, or the data access behind them. The headings follow the OWASP API Security Top 10 (2023) identifiers.

## API1:2023 Broken object level authorization (BOLA)
- For every handler that takes an object id (path, query, body, GraphQL argument), find the query that loads it. Does that query also filter by the caller's user, tenant or role? A lookup by id alone, followed by no ownership check, is the classic finding (CWE-639).
- Check nested resources: \`/orgs/:org/projects/:id\` must confirm the project belongs to that org and the caller belongs to the org.
- GraphQL: resolvers for nodes reachable by global id need their own check; a check on the parent query is not enough.

## API2:2023 Broken authentication
- New endpoints outside the auth middleware, token checks that accept expired or unsigned tokens, API keys compared with \`==\` on user input, or keys passed in query strings that end up in logs.

## API3:2023 Broken object property level authorization (BOPLA)
- Responses: does the endpoint return whole model objects (password hashes, tokens, internal flags, other users' emails)? Look for \`res.json(user)\` or serializers with all fields.
- Requests (mass assignment): does the update copy the request body into the model (\`Object.assign\`, \`**request.data\`, \`.update(req.body)\`, permissive binding)? Fields like \`role\`, \`isAdmin\`, \`ownerId\`, \`balance\`, \`verified\` must not be settable.

## API4:2023 Unrestricted resource consumption
- Only report when the diff adds an expensive operation reachable by untrusted callers with no bound: unbounded page sizes, file or batch sizes, recursion depth, regex on user input of unbounded length combined with costly work, outbound calls that spend money (SMS, email, LLM tokens, paid APIs) without a per-user limit.
- Do not report generic "missing rate limiting" on cheap endpoints, or availability-only (denial of service) issues: the review excludes those. Report when the impact is money or data: a caller can spend the owner's paid quota or pull data in bulk. Name the cost in the title (e.g. "Unmetered SMS sending lets any user bill the account").

## API5:2023 Broken function level authorization (BFLA)
- Admin or internal operations (user management, refunds, feature flags, impersonation) callable by any authenticated user. Check that the route is in the admin group or the handler checks the role.
- HTTP verb confusion: a GET that's public while PUT/DELETE on the same path should be restricted.

## API6:2023 Unrestricted access to sensitive business flows
- Flows where automation hurts the business (sign-up bonuses, coupon redemption, inventory holds, voting). Report only with a concrete abuse path the change creates.

## API7:2023 Server-side request forgery (SSRF)
- Any handler that fetches a URL, hostname or webhook target influenced by the user. Is the scheme limited to https, the host checked against an allowlist (or private ranges blocked after DNS resolution), and are redirects re-checked?
- Watch for indirect inputs: image URLs for thumbnails, import-from-URL, OAuth/OIDC discovery URLs, PDF renderers, XML external entities.
- Cloud metadata endpoints (169.254.169.254, metadata.google.internal) are the usual target.

## API8:2023 Security misconfiguration
- CORS that reflects any origin with credentials, verbose errors with stack traces, debug endpoints left registered, missing TLS verification on outbound calls.

## API9:2023 Improper inventory management
- New versioned routes (\`/v2/\`) that skip middleware the old version had, or old routes left exposed after a rewrite.

## API10:2023 Unsafe consumption of APIs
- Data from third-party APIs or webhooks trusted without validation: webhook signatures not verified (or verified after use), responses deserialised into types or passed into queries, redirects followed blindly.

## Evidence needed to report
The endpoint and method, the identity of the attacker (anonymous, any user, user of another tenant), the request they send, and the data or action they gain. Cite the handler and the data-access line.

## Common false positives
- Authorization enforced by a policy layer, decorator, router group or database row-level security you haven't opened: look for it first.
- Ids that are unguessable and never exposed to other users do not by themselves make a missing check safe, but a check elsewhere does.
- Internal services reachable only from a private network, when config makes that explicit.
- Rate limiting handled at the edge or gateway.
`;

const LLM_APP_SECURITY = `Apply this when the change calls a language model, builds prompts, defines tools or agents, or handles model output. It follows the risk areas of the OWASP Top 10 for LLM applications (2025 edition, LLM01–LLM10), described in our own terms.

## Prompt injection (LLM01)
- Find every place untrusted text reaches a prompt: user messages, retrieved documents (RAG), web pages, emails, file contents, tool results, other agents' output. Text the model reads can carry instructions.
- The risk is real when the same model call can do something with consequences: call tools, read private data, send messages, write files or change state. A chat that can only answer the same user is low impact.
- Report when injected text can make the model act on behalf of someone other than the person who supplied the text (indirect injection), or exfiltrate data through a channel the attacker can read (links, image URLs, tool calls).

## Sensitive information disclosure (LLM02)
- Secrets, API keys, internal URLs or other users' data placed in system prompts or context. Assume anything in the context window can be repeated to the user.
- Retrieval that isn't filtered by the caller's permissions (RAG over all tenants' documents).
- Conversation logs or traces stored with personal data or credentials.

## Supply chain and model provenance (LLM03, LLM04)
- Models, adapters or datasets downloaded from unpinned sources at runtime; \`trust_remote_code=True\`; pickle-based model files from untrusted origins.

## Improper output handling (LLM05)
- Model output treated as trusted: rendered as HTML or markdown with images/links (XSS, data exfiltration), executed (eval, exec, shell, SQL), used as a file path or URL, or parsed into commands without validation.
- Structured output: is it validated against a schema before use, and are enum-like fields checked?

## Excessive agency (LLM06)
- Tools with more power than the feature needs: generic \`run_sql\`, \`http_request\`, \`shell\` or file-system tools; write access where read would do; credentials with broad scopes.
- Tool calls executed with the application's privileges instead of the end user's. Each tool should authorize the action for the user the conversation belongs to.
- High-impact actions (payments, deletes, sending email, merging code) without human confirmation.

## System prompt leakage (LLM07)
- Security that depends on the system prompt staying secret, or on the model obeying it ("never reveal X", "only answer for user 123"). Enforcement must happen in code.

## Vector and embedding weaknesses (LLM08)
- Shared vector stores without tenant isolation, documents ingested from untrusted sources without provenance, embeddings of secrets.

## Misinformation and overreliance (LLM09)
- Only report when model output is used for a security decision (authorization, content moderation that gates access, code merged without review).

## Unbounded consumption (LLM10)
- Endpoints that let untrusted callers trigger model calls with no per-user quota, no max token or input size, unbounded agent loops or recursion, or that pass user-chosen model names. Report when a single caller can run up real cost, and frame it as cost abuse; availability-only (denial of service) issues are out of scope for this review.

## Evidence needed to report
Who controls the injected or unbounded input, how it reaches the model, what capability the model has at that point, and what the attacker gains. Cite the prompt-building code and the tool or sink.

## Common false positives
- Prompt injection against a model that has no tools, no private context and only answers the person who typed the input.
- Model output rendered by a framework that escapes it, as plain text.
- Keys in server-side env vars that are never placed into prompts.
`;

const CI_CD_SECURITY = `Apply this to changes in \`.github/workflows/\`, composite actions (\`action.yml\`), other CI configs (GitLab CI, CircleCI, Buildkite), build scripts they call, Dockerfiles and release tooling.

## pull_request_target and workflow_run
- \`pull_request_target\` runs with the base repository's secrets and a write token. If the job checks out the PR head (\`ref: \${{ github.event.pull_request.head.sha }}\`, \`head.ref\`, or \`refs/pull/N/merge\`) and then runs anything from it (install scripts, build, tests, \`make\`, local actions), a fork can run code with those secrets. Report it as critical when secrets or a write token are reachable.
- The same applies to \`workflow_run\` jobs that download artifacts from a PR workflow and execute or extract them unsafely (artifact poisoning).
- Labels or \`if:\` conditions on the author are not a reliable gate unless they check an authorized actor.

## Script injection
- \`\${{ github.event.* }}\` values that attackers control interpolated directly into \`run:\` scripts or \`actions/github-script\` code: issue and PR titles and bodies, comment bodies, review bodies, branch names (\`head_ref\`), commit messages, author names and emails, page names, labels.
- The fix is to pass the value through \`env:\` and reference it as a shell variable. Report with the exact field and the step.

## Token permissions
- Workflows or jobs without a \`permissions:\` block on repos where the default token is read-write, or with \`write-all\` / broad scopes (\`contents: write\`, \`pull-requests: write\`, \`id-token: write\`) that the job doesn't need.
- \`id-token: write\` lets the job mint cloud credentials via OIDC; check the trust policy is scoped to the branch or environment.

## Third-party actions and tools
- Actions from outside the organisation referenced by a tag or branch (\`@v3\`, \`@main\`) instead of a full commit SHA. Report when the action receives secrets or a write token; otherwise mention it in the summary.
- \`curl | sh\`, unpinned downloads without checksum verification, and package installs from mutable sources in jobs that hold secrets.

## Secrets exposure
- Secrets echoed, written to files that are uploaded as artifacts, passed on the command line of tools that log their arguments, or set as outputs.
- Secrets made available to jobs that run on events from forks.
- \`ACTIONS_ALLOW_UNSECURE_COMMANDS\`, or \`set-env\`/\`add-path\` style commands fed by untrusted input; writes to \`$GITHUB_ENV\` or \`$GITHUB_PATH\` from attacker-controlled values.

## Self-hosted runners
- Self-hosted runners used by workflows that public forks can trigger: any PR can run code on the machine and persist there.
- Runners shared between trust levels, or non-ephemeral runners that keep state between jobs.

## Caches and artifacts
- Caches keyed on attacker-controlled values, or restored in privileged workflows from keys a PR workflow can write (cache poisoning).

## Containers and images
- Base images by mutable tag in release builds, \`--privileged\` containers, Docker socket mounts, secrets passed as build args (they persist in image layers).

## Evidence needed to report
The trigger, who can fire it (anyone with a fork, any commenter, maintainers only), the attacker-controlled value or code, the step where it executes, and what that step can reach (which secrets, token scopes, runners).

## Common false positives
- \`pull_request\` (not \`_target\`) workflows from forks: they get a read-only token and no secrets.
- Interpolation of values attackers can't set: \`github.sha\`, \`github.repository\`, numeric ids, \`github.event.pull_request.number\`, \`inputs.*\` of \`workflow_dispatch\` when only maintainers can dispatch.
- First-party actions (\`actions/*\`, \`github/*\`) pinned by tag, if the project's policy accepts that.
`;

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    slug: "owasp-asvs",
    name: "OWASP ASVS checklist",
    description:
      "Diff-checkable review questions grouped by area (access control, authentication, sessions, validation, injection, crypto, files, API, config, logging), keyed to ASVS 5.0 chapters.",
    body: OWASP_ASVS,
  },
  {
    slug: "api-security",
    name: "API security",
    description:
      "OWASP API Security Top 10 (2023): object and property level authorization, function level authorization, SSRF, mass assignment and resource limits on expensive endpoints.",
    body: API_SECURITY,
  },
  {
    slug: "llm-app-security",
    name: "LLM application security",
    description:
      "Risks in apps that call LLMs: prompt injection through untrusted content, unsafe handling of model output, over-powered tools, secrets in prompts and unbounded consumption.",
    body: LLM_APP_SECURITY,
  },
  {
    slug: "ci-cd-security",
    name: "CI/CD security",
    description:
      "GitHub Actions and CI risks: pull_request_target with PR checkout, script injection from event fields, broad token permissions, unpinned actions, secrets reachable from forks and self-hosted runners.",
    body: CI_CD_SECURITY,
  },
];

const BY_ID = new Map(BUILTIN_SKILLS.map((s) => [builtinSkillId(s.slug), s]));

/** The built-in skill for a `builtin:<slug>` id, if there is one. */
export function builtinSkill(id: string): BuiltinSkill | undefined {
  return BY_ID.get(id);
}
