/**
 * RPC contract of the engine Worker (`openvscan-engine`), exposed to the web
 * Worker through a service binding:
 *
 *   "services": [{ "binding": "ENGINE", "service": "openvscan-engine",
 *                  "entrypoint": "EngineApi" }]
 *
 * The web Worker owns run creation (it inserts the `run` row with status
 * `queued` and a policy snapshot), then hands the id to the engine, which
 * drives the durable ReviewWorkflow and owns every later write to the run.
 */
export interface EngineRpc {
  /** Start the review workflow for an already-inserted `queued` run. */
  startRun(runId: string): Promise<{ instanceId: string }>;
  /**
   * Stop a queued/running run (e.g. superseded by a new push, or cancelled
   * from the dashboard). Idempotent.
   */
  cancelRun(runId: string, reason?: string): Promise<void>;
}
