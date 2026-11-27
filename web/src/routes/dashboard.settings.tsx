import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import Link from "@/components/AppLink";
import { AgentCredentials } from "@/components/dashboard/AgentCredentials";
import { timeAgo } from "@/components/dashboard/RunList";
import {
  Avatar,
  GithubAvatar,
  Loading,
  Notice,
  PageHeader,
  Panel,
  SettingRow,
  SettingsSection,
} from "@/components/dashboard/ui";
import { CheckCircle, Github, Laptop } from "@/components/icons";
import { Pill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Input, Label } from "@/components/ui/Input";
import {
  useAccountQuery,
  useDeleteAccountMutation,
  useGithubConnectionQuery,
  useRevokeOtherSessionsMutation,
  useRevokeSessionMutation,
  useUnlinkGithubMutation,
  useUpdateProfileMutation,
} from "@/lib/api";

export const Route = createFileRoute("/dashboard/settings")({
  // `?github=` comes back from the "Link GitHub" round trip.
  validateSearch: (search: Record<string, unknown>): { github?: string } => ({
    github: typeof search.github === "string" ? search.github : undefined,
  }),
  component: SettingsPage,
});

type Account = NonNullable<ReturnType<typeof useAccountQuery>["data"]>;

const errorText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

function SettingsPage() {
  const { data: account, isLoading } = useAccountQuery();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your coding agents, GitHub connection and account."
      />

      <SettingsSection
        id="agents"
        title="AI agents"
        description="Bring your own coding agent. OpenVScan runs it headless on each pull request to triage scanner findings and review the diff."
      >
        <AgentCredentials />
      </SettingsSection>

      <SettingsSection
        id="github"
        title="GitHub App"
        description="Reads code and writes checks and review comments on the repositories you choose."
      >
        <GithubAppPanel />
      </SettingsSection>

      {isLoading || !account ? (
        <Loading />
      ) : (
        <>
          <SettingsSection
            id="account"
            title="Profile"
            description="Your name in the dashboard. Your avatar comes from the account you sign in with."
          >
            <ProfilePanel account={account} />
          </SettingsSection>
          <SettingsSection
            id="github-account"
            title="GitHub account"
            description="Proves which GitHub App installations you may connect: your own account, or organizations you administer."
          >
            <GithubAccount account={account} />
          </SettingsSection>
          {account.capabilities.mcpUrl && (
            <SettingsSection
              id="mcp"
              title="Connect your coding agent"
              description="OpenVScan is an MCP server. Add it to Claude Code, Codex or Cursor to read reviews and findings, start a review and change repository settings from your editor. You sign in once in the browser."
            >
              <McpPanel url={account.capabilities.mcpUrl} />
            </SettingsSection>
          )}
          <SettingsSection
            id="sessions"
            title="Sessions"
            description="Devices signed in to your account. Sign out any you don't recognise."
          >
            <Sessions account={account} />
          </SettingsSection>
          <SettingsSection
            id="danger"
            title="Delete account"
            description="Removes your account, repositories, review history and stored credentials. This can't be undone."
          >
            <DeleteAccount account={account} />
          </SettingsSection>
        </>
      )}
    </>
  );
}

/* ------------------------------- GitHub App ------------------------------ */

function GithubAppPanel() {
  const { data: connection } = useGithubConnectionQuery();
  const installations = connection?.installations ?? [];
  return (
    <Panel>
      {installations.length > 0 ? (
        <div className="divide-y divide-border">
          {installations.map((inst) => (
            <SettingRow
              key={inst.id}
              title={
                <span className="inline-flex items-center gap-2.5">
                  <GithubAvatar login={inst.accountLogin} />
                  {inst.accountLogin}
                </span>
              }
              description={
                inst.suspendedAt
                  ? "Suspended on GitHub. Reviews are paused until it's unsuspended."
                  : `Installed on ${inst.accountType === "Organization" ? "an organization" : "a personal account"}`
              }
            >
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/repositories">Repositories</Link>
              </Button>
            </SettingRow>
          ))}
        </div>
      ) : (
        <SettingRow
          title="Not installed"
          description={
            connection?.configured
              ? "Install the GitHub App to review your pull requests."
              : "GitHub isn't configured on this deployment."
          }
        >
          {connection?.installUrl && (
            <Button size="sm" asChild>
              <a href={connection.installUrl}>
                <Github />
                Install GitHub App
              </a>
            </Button>
          )}
        </SettingRow>
      )}
      {installations.length > 0 && connection?.installUrl && (
        <div className="border-t border-border bg-muted/40 px-5 py-3 text-[13px] text-muted-foreground">
          Add repositories or another account on{" "}
          <a
            href={connection.installUrl}
            className="font-medium text-foreground underline underline-offset-2"
          >
            GitHub
          </a>
          .
        </div>
      )}
    </Panel>
  );
}

/* --------------------------------- Profile -------------------------------- */

function ProfilePanel({ account }: { account: Account }) {
  const router = useRouter();
  const update = useUpdateProfileMutation();
  const { user } = account;
  const [name, setName] = useState(user.name);
  const [saved, setSaved] = useState(false);

  useEffect(() => setName(user.name), [user.name]);

  const dirty = name.trim() !== user.name;

  return (
    <Panel>
      <form
        className="space-y-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          update.mutate(
            { name: name.trim() },
            {
              onSuccess: () => {
                setSaved(true);
                router.invalidate(); // sidebar name
              },
            },
          );
        }}
      >
        {update.isError && (
          <Notice tone="danger">
            {errorText(update.error, "Could not update profile")}
          </Notice>
        )}
        {saved && !dirty && <Notice tone="success">Profile updated.</Notice>}

        <div className="flex items-center gap-4">
          <Avatar name={name} image={user.image} size={48} />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-medium text-foreground">
              {name || "Your name"}
            </div>
            <div className="text-[13px] text-muted-foreground">
              Member since{" "}
              {new Date(user.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              required
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <div className="flex items-center gap-3">
              <Input id="email" value={user.email} disabled />
              {user.emailVerified && (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-status-completed">
                  <CheckCircle size={14} /> Verified
                </span>
              )}
            </div>
          </div>
        </div>

        <p className="text-[13px] text-muted-foreground">
          Signing in with GitHub or Google refreshes your name from that
          account. To change your password, use{" "}
          <span className="font-medium text-foreground">Forgot password</span>{" "}
          on the sign-in page.
        </p>

        <Button type="submit" size="sm" disabled={!dirty || update.isPending}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Panel>
  );
}

/* ----------------------------- GitHub account ----------------------------- */

const LINK_MESSAGES: Record<
  string,
  { tone: "success" | "danger"; text: string }
> = {
  linked: { tone: "success", text: "GitHub account linked." },
  taken: {
    tone: "danger",
    text: "That GitHub account is linked to another OpenVScan account.",
  },
  denied: { tone: "danger", text: "GitHub didn't grant access. Try again." },
  state: { tone: "danger", text: "The link request expired. Try again." },
  failed: { tone: "danger", text: "Could not link GitHub. Try again." },
};

function GithubAccount({ account }: { account: Account }) {
  const unlink = useUnlinkGithubMutation();
  const search = Route.useSearch();
  const result = search.github ? LINK_MESSAGES[search.github] : undefined;
  const { github } = account;

  return (
    <Panel>
      <SettingRow
        title={
          <span className="inline-flex items-center gap-2">
            <Github size={16} /> GitHub
          </span>
        }
        description={
          github
            ? `Linked as @${github.login}.`
            : account.capabilities.githubLink
              ? "Not linked. Needed to connect GitHub App installations."
              : "GitHub linking isn't configured on this deployment."
        }
      >
        {github ? (
          <Button
            variant="outline"
            size="sm"
            disabled={unlink.isPending}
            onClick={() => {
              if (
                confirm(
                  "Unlink GitHub? You'll need to link it again to connect new installations.",
                )
              )
                unlink.mutate(undefined);
            }}
          >
            Unlink
          </Button>
        ) : account.capabilities.githubLink ? (
          <Button size="sm" asChild>
            <a href="/api/github/link?redirect=%2Fdashboard%2Fsettings%23github-account">
              <Github /> Link GitHub
            </a>
          </Button>
        ) : null}
      </SettingRow>
      {(result || unlink.isError) && (
        <div className="border-t border-border p-4">
          <Notice tone={unlink.isError ? "danger" : (result?.tone ?? "danger")}>
            {unlink.isError
              ? errorText(unlink.error, "Could not unlink")
              : result?.text}
          </Notice>
        </div>
      )}
    </Panel>
  );
}

/* ----------------------------------- MCP ----------------------------------- */

function McpPanel({ url }: { url: string }) {
  const rows = [
    {
      name: "Server URL",
      hint: "Streamable HTTP, OAuth sign-in",
      command: url,
    },
    {
      name: "Claude Code",
      hint: "Then run /mcp to sign in",
      command: `claude mcp add --transport http openvscan ${url}`,
    },
    {
      name: "Codex",
      command: `codex mcp add openvscan --url ${url} && codex mcp login openvscan`,
    },
    {
      name: "Cursor",
      hint: "Add to .cursor/mcp.json",
      command: JSON.stringify({ mcpServers: { openvscan: { url } } }),
    },
  ];
  return (
    <Panel>
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.name} className="space-y-2 px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium text-foreground">
                {r.name}
              </span>
              {r.hint && (
                <span className="text-[12px] text-muted-foreground">
                  {r.hint}
                </span>
              )}
            </div>
            {/* Concentric: 10px outer = 5px button + 4px inset + 1px border. */}
            <div className="flex items-center gap-2 rounded-[10px] border border-border bg-muted/40 p-1 pl-3">
              <code className="min-w-0 flex-1 overflow-x-auto py-1 font-mono text-[12px] whitespace-nowrap text-foreground">
                {r.command}
              </code>
              <CopyButton
                getText={() => r.command}
                label={`Copy ${r.name}`}
                className="grid size-7 shrink-0 place-items-center rounded-[5px] text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-card hover:text-foreground active:scale-[0.97] motion-reduce:active:scale-100"
              />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* --------------------------------- Sessions -------------------------------- */

/** "Chrome on macOS" from a user-agent string (good enough for a list). */
function describeDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : /curl|node|undici/i.test(ua)
            ? "API client"
            : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return os ? `${browser} on ${os}` : browser;
}

function Sessions({ account }: { account: Account }) {
  const revoke = useRevokeSessionMutation();
  const revokeOthers = useRevokeOtherSessionsMutation();
  if (!account.sessions) {
    return (
      <Panel>
        <div className="p-5 text-[13px] text-muted-foreground">
          Sessions couldn't be loaded right now. Try again in a moment.
        </div>
      </Panel>
    );
  }
  const others = account.sessions.filter((s) => !s.current).length;

  return (
    <Panel>
      {(revoke.isError || revokeOthers.isError) && (
        <div className="border-b border-border p-4">
          <Notice tone="danger">
            {errorText(
              revoke.error ?? revokeOthers.error,
              "Could not sign out that session",
            )}
          </Notice>
        </div>
      )}
      <ul className="divide-y divide-border">
        {account.sessions.map((s) => (
          <li key={s.id}>
            <SettingRow
              title={
                <span className="inline-flex items-center gap-2">
                  <Laptop size={16} className="text-muted-foreground" />
                  {describeDevice(s.userAgent)}
                  {s.current && <Pill tone="success">This device</Pill>}
                </span>
              }
              description={
                <>
                  {s.ipAddress ? `${s.ipAddress} · ` : ""}
                  {s.current
                    ? "Active now"
                    : `Last active ${timeAgo(s.updatedAt)}`}
                </>
              }
            >
              {s.current ? (
                <SignOutButton />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revoke.isPending && revoke.variables === s.id}
                  onClick={() => revoke.mutate(s.id)}
                >
                  Sign out
                </Button>
              )}
            </SettingRow>
          </li>
        ))}
      </ul>
      {others > 0 && (
        <div className="flex items-center justify-between gap-4 border-t border-border bg-muted/40 px-5 py-3 text-[13px] text-muted-foreground">
          <span>
            {others} other {others === 1 ? "session" : "sessions"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={revokeOthers.isPending}
            onClick={() => revokeOthers.mutate(undefined)}
          >
            Sign out everywhere else
          </Button>
        </div>
      )}
    </Panel>
  );
}

function SignOutButton() {
  return (
    <form method="post" action="/api/auth/signout">
      <Button type="submit" variant="outline" size="sm">
        Sign out
      </Button>
    </form>
  );
}

/* ------------------------------ Delete account ----------------------------- */

function DeleteAccount({ account }: { account: Account }) {
  const del = useDeleteAccountMutation();
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const matches =
    confirmEmail.trim().toLowerCase() === account.user.email.toLowerCase();

  let body: ReactNode;
  if (!open) {
    body = (
      <SettingRow
        title="Delete this account"
        description="Running reviews are cancelled and stored artifacts are removed. Uninstall the GitHub App on GitHub separately."
      >
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </SettingRow>
    );
  } else {
    body = (
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!matches) return;
          del.mutate(confirmEmail, {
            onSuccess: () => {
              window.location.href = "/";
            },
          });
        }}
      >
        <Notice tone="danger">
          This permanently deletes your account and everything in it.
        </Notice>
        {del.isError && (
          <Notice tone="danger">
            {errorText(del.error, "Could not delete")}
          </Notice>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="confirm-email">
            Type <span className="font-mono">{account.user.email}</span> to
            confirm
          </Label>
          <Input
            id="confirm-email"
            autoComplete="off"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={!matches || del.isPending}
          >
            {del.isPending ? "Deleting…" : "Delete permanently"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }
  return <Panel>{body}</Panel>;
}
