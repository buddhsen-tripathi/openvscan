import { type AgentProvider, type CredentialKind, SCANNERS } from "@openvscan/core";
import { agentFailure, agentInvocation, PROMPT_PATH, REVIEW_PATH, TASK_DIR, WORK_DIR } from "./agent";
import { sandboxFor } from "./sandbox";
import { OUT_DIR, REPO_DIR, SCANNER_SPECS } from "./scanners";

/**
 * Local smoke test of the sandbox + egress + scanners + agent wiring without
 * a GitHub App or D1 run. Only mounted when DEV_ROUTES=true (.dev.vars).
 *
 *   curl -X POST localhost:8787/__dev/scan -d '{"repo":"octocat/Hello-World"}'
 *   curl -X POST localhost:8787/__dev/agent -d '{"kind":"anthropic_api_key","secret":"sk-ant-…"}'
 */
export async function devRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as Record<string, string>;
  const sb = sandboxFor(env, "dev-smoke");

  if (url.pathname === "/__dev/scan") {
    const repo = body.repo ?? "OWASP/NodeGoat";
    const t0 = Date.now();
    await sb.start();
    const blocked = await sb.exec(["curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}", "https://example.com"]);
    await sb.setEgress({ phase: "checkout", repo, githubToken: "" });
    const clone = await sb.exec(
      ["sh", "-c", 'set -e; rm -rf "$1"; git clone -q --depth=1 "$2" "$1"; mkdir -p "$3"', "c", REPO_DIR, `https://github.com/${repo}.git`, OUT_DIR],
      { timeoutSec: 300 },
    );
    const pushBlocked = await sb.exec(["git", "-C", REPO_DIR, "ls-remote", "https://github.com/torvalds/linux.git"], { timeoutSec: 60 });
    await sb.lockEgress();
    const results: Record<string, unknown> = {};
    for (const name of SCANNERS) {
      const spec = SCANNER_SPECS[name];
      const s = Date.now();
      await sb.setEgress(name === "trivy" ? { phase: "scan" } : { phase: "locked" });
      const r = await sb.exec(spec.argv, { env: spec.env, timeoutSec: spec.timeoutSec });
      await sb.lockEgress();
      const raw = await sb.readText(spec.outputPath);
      const parsed = raw ? spec.parse(raw) : [];
      results[name] = {
        exitCode: r.exitCode,
        stderr: r.stderr.slice(-300),
        findings: parsed.length,
        bySeverity: parsed.reduce<Record<string, number>>((a, f) => ((a[f.severity] = (a[f.severity] ?? 0) + 1), a), {}),
        sample: parsed.slice(0, 3).map((f) => `${f.severity} ${f.filePath}:${f.startLine ?? "-"} ${f.title}`),
        ms: Date.now() - s,
      };
    }
    return Response.json({
      repo,
      egressBlockedStatus: blocked.stdout || blocked.stderr.slice(-200),
      clone: { exitCode: clone.exitCode, stderr: clone.stderr.slice(-300) },
      otherRepoBlocked: { exitCode: pushBlocked.exitCode, stderr: pushBlocked.stderr.slice(-200) },
      results,
      totalMs: Date.now() - t0,
    });
  }

  if (url.pathname === "/__dev/agent") {
    const kind = (body.kind ?? "anthropic_api_key") as CredentialKind;
    const provider: AgentProvider = kind === "openai_api_key" ? "codex" : "claude";
    await sb.start();
    await sb.writeText(PROMPT_PATH, `Write the JSON {"summary":"smoke test","risk":"none"} to ${REVIEW_PATH}.`);
    const inv = agentInvocation(provider, kind, body.model ?? null);
    await sb.setEgress({ phase: "agent", kind, secret: body.secret ?? "invalid" });
    await sb.startTask(TASK_DIR, inv.argv, { cwd: WORK_DIR, env: inv.env });
    let state = await sb.taskState(TASK_DIR);
    for (let i = 0; i < 90 && state.state === "running"; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      state = await sb.taskState(TASK_DIR);
    }
    await sb.lockEgress();
    const stdout = (await sb.readText(`${TASK_DIR}/stdout.log`)) ?? "";
    const stderr = (await sb.readText(`${TASK_DIR}/stderr.log`)) ?? "";
    return Response.json({
      state,
      review: await sb.readText(REVIEW_PATH),
      failure: state.state === "exited" ? agentFailure(provider, state.exitCode, stdout, stderr) : null,
      stdoutTail: stdout.slice(-1500),
    });
  }

  if (url.pathname === "/__dev/destroy") {
    await sb.destroy();
    return Response.json({ destroyed: true });
  }
  return new Response("not found", { status: 404 });
}
