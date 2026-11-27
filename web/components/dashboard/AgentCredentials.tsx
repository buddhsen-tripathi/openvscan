import {
  AGENT_INFO,
  AGENT_PROVIDERS,
  type AgentProvider,
  CREDENTIAL_INFO,
  CREDENTIAL_KINDS,
  type CredentialKind,
} from "@openvscan/core";
import { type FormEvent, useState } from "react";
import { timeAgo } from "@/components/dashboard/RunList";
import { Key, ShieldCheck, Spinner, Trash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  useCredentialsQuery,
  useDeleteCredentialMutation,
  useSaveCredentialMutation,
} from "@/lib/api";
import { Loading, Notice, Panel } from "./ui";

type Credential = NonNullable<
  ReturnType<typeof useCredentialsQuery>["data"]
>["credentials"][number];

function ProviderCard({
  provider,
  credential,
  disabled,
}: {
  provider: AgentProvider;
  credential: Credential | undefined;
  disabled: boolean;
}) {
  const kinds = CREDENTIAL_KINDS.filter(
    (k) => CREDENTIAL_INFO[k].provider === provider,
  );
  const [kind, setKind] = useState<CredentialKind>(
    credential?.kind ?? kinds[0],
  );
  const [secret, setSecret] = useState("");
  const [replacing, setReplacing] = useState(false);
  const editing = !credential || replacing;
  const save = useSaveCredentialMutation();
  const remove = useDeleteCredentialMutation();
  const info = AGENT_INFO[provider];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await save.mutateAsync({ kind, secret });
      setSecret("");
      setReplacing(false);
    } catch {
      /* surfaced below */
    }
  };

  return (
    <Panel>
      <div className="flex items-start gap-4 px-5 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-[8px] border border-border bg-background font-mono text-[12px] text-foreground shadow-card">
          {info.short}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-foreground">
              {info.label}
            </span>
            <code className="rounded-[4px] bg-muted px-1.5 py-px font-mono text-[11px] text-muted-foreground">
              {info.cmd}
            </code>
            {credential && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-status-completed">
                <span className="size-1.5 rounded-full bg-status-completed" />
                Connected
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {info.blurb}
          </p>
        </div>
      </div>

      {credential && !editing && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-5 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <Key size={14} className="text-muted-foreground" />
              {CREDENTIAL_INFO[credential.kind].label}
            </span>
            <span className="font-mono text-[12px] text-muted-foreground">
              {credential.hint}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {credential.lastUsedAt
                ? `Used ${timeAgo(credential.lastUsedAt)}`
                : "Not used yet"}
            </span>
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReplacing(true)}
            >
              Replace
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Remove credential"
              className="text-destructive hover:bg-destructive/[0.07] hover:text-destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(credential.id, {
                  onSuccess: () => setReplacing(false),
                })
              }
            >
              <Trash />
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <form
          onSubmit={submit}
          className="space-y-4 border-t border-border px-5 py-4"
        >
          {kinds.length > 1 && (
            <SegmentedControl
              label="Credential type"
              value={kind}
              onChange={setKind}
              options={kinds.map((k) => ({
                value: k,
                label: CREDENTIAL_INFO[k].label,
              }))}
            />
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`secret-${provider}`}>Token</Label>
            <Input
              id={`secret-${provider}`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={`${CREDENTIAL_INFO[kind].prefix ?? ""}…`}
              disabled={disabled}
              className="font-mono text-[13px]"
            />
            <p className="text-[12.5px] text-muted-foreground">
              {CREDENTIAL_INFO[kind].hint}
            </p>
          </div>
          {save.error && (
            <Notice tone="danger">
              {save.error instanceof Error
                ? save.error.message
                : "Failed to save"}
            </Notice>
          )}
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={disabled || save.isPending || !secret.trim()}
            >
              {save.isPending && <Spinner className="animate-spin" />}
              Save credential
            </Button>
            {credential && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setReplacing(false)}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
    </Panel>
  );
}

export function AgentCredentials() {
  const { data, isLoading } = useCredentialsQuery();

  if (isLoading || !data) return <Loading className="py-10" />;

  return (
    <div className="space-y-4">
      {!data.encryptionConfigured && (
        <Notice tone="warning">
          This deployment has no{" "}
          <code className="font-mono">CREDENTIALS_KEY</code> set, so credentials
          can't be saved yet. Ask the operator to configure it.
        </Notice>
      )}
      {AGENT_PROVIDERS.map((p) => (
        <ProviderCard
          key={p}
          provider={p}
          credential={data.credentials.find((c) => c.provider === p)}
          disabled={!data.encryptionConfigured}
        />
      ))}
      <div className="flex items-start gap-3 rounded-[10px] border border-dashed border-border px-4 py-3.5 text-[13px] leading-relaxed text-muted-foreground">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent-brand" />
        <span>
          Tokens are encrypted at rest (AES-256-GCM) and never sent back to your
          browser. During a review the agent only sees a placeholder; the real
          token is swapped in at the sandbox's network egress, on requests to
          the model API. For Claude, run{" "}
          <code className="rounded-[4px] bg-muted px-1 font-mono text-[12px] text-foreground">
            claude setup-token
          </code>{" "}
          to create a long-lived subscription token.
        </span>
      </div>
    </div>
  );
}
