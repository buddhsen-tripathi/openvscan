import { type EngineRpc, isActiveRun } from "@openvscan/core";
import { completeCheckRun } from "@openvscan/github";
import { WorkerEntrypoint } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb, githubFor, logRun, schema, updateRun } from "./db";
import { devRoute } from "./dev";
import { sandboxFor } from "./sandbox";

export { Outbound } from "./outbound";
export { ScanSandbox } from "./sandbox";
export { ReviewWorkflow } from "./workflow";

/**
 * RPC surface used by the web Worker (service binding `ENGINE`). The web
 * Worker inserts the `run` row; the engine owns everything after that.
 */
export class EngineApi extends WorkerEntrypoint<Env> implements EngineRpc {
  async startRun(runId: string): Promise<{ instanceId: string }> {
    const instance = await this.env.REVIEW_WORKFLOW.create({ id: runId, params: { runId } });
    return { instanceId: instance.id };
  }

  async cancelRun(runId: string, reason = "Cancelled"): Promise<void> {
    const db = getDb(this.env);
    const run = await db.query.run.findFirst({
      where: eq(schema.run.id, runId),
      with: { repository: { with: { installation: true } } },
    });
    if (!run) return;
    if (!isActiveRun(run.status)) return;

    await updateRun(db, runId, {
      status: "cancelled",
      phase: "done",
      cancelRequested: true,
      completedAt: new Date(),
    });
    await logRun(db, runId, "warn", reason);

    // Stop the pipeline and free the container. Each is best-effort: the
    // workflow also re-checks the cancel flag between phases.
    await this.env.REVIEW_WORKFLOW.get(runId)
      .then((i) => i.terminate())
      .catch(() => {});
    await sandboxFor(this.env, runId)
      .destroy()
      .catch(() => {});
    if (run.checkRunId) {
      await completeCheckRun(githubFor(this.env, run.repository.installation.installationId), {
        owner: run.repository.owner,
        repo: run.repository.name,
        checkRunId: run.checkRunId,
        conclusion: "cancelled",
        title: "Security review cancelled",
        summary: reason,
      }).catch(() => {});
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true });
    if (url.pathname.startsWith("/__dev/") && String(env.DEV_ROUTES) === "true") {
      return devRoute(request, env);
    }
    return new Response("openvscan-engine: use the ENGINE service binding\n", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
