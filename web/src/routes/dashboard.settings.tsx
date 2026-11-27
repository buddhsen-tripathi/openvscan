import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import Link from "@/components/AppLink";
import { oauthErrorMessage } from "@/components/auth/AuthShell";
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
import { CheckCircle, Github, Key, Laptop } from "@/components/icons";
import { Pill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/Input";
import {
  useAccountQuery,
  useChangePasswordMutation,
  useDeleteAccountMutation,
  useGithubConnectionQuery,
  useRevokeOtherSessionsMutation,
  useRevokeSessionMutation,
  useSetPasswordMutation,
  useUnlinkGithubMutation,
  useUpdateProfileMutation,
} from "@/lib/api";
import { authClient, signOut } from "@/lib/auth-client";

export const Route = createFileRoute("/dashboard/settings")({
  // `?error=` comes back from a failed "Link GitHub" round trip.
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({
    error: typeof search.error === "string" ? search.error : undefined,
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
            description="Your name and avatar in the dashboard."
          >
            <ProfilePanel account={account} />
          </SettingsSection>
          <SettingsSection
            id="sign-in"
            title="Sign-in methods"
            description="Link GitHub to sign in with one click and to connect your GitHub App installations."
          >
            <SignInMethods account={account} />
          </SettingsSection>
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
  const [image, setImage] = useState(user.image ?? "");
  const [saved, setSaved] = useState(false);
  const [verifySent, setVerifySent] = useState(false);

  useEffect(() => {
    setName(user.name);
    setImage(user.image ?? "");
  }, [user.name, user.image]);

  const dirty =
    name.trim() !== user.name || image.trim() !== (user.image ?? "");

  return (
    <Panel>
      <form
        className="space-y-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          update.mutate(
            { name: name.trim(), image: image.trim() || null },
            {
              onSuccess: () => {
                setSaved(true);
                router.invalidate(); // sidebar avatar + name
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
          <Avatar name={name} image={image.trim() || null} size={48} />
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
            <Label htmlFor="image">Avatar URL</Label>
            <Input
              id="image"
              type="url"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Input
              id="email"
              value={user.email}
              disabled
              className="max-w-sm"
            />
            {user.emailVerified ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-status-completed">
                <CheckCircle size={14} /> Verified
              </span>
            ) : verifySent ? (
              <span className="text-xs text-muted-foreground">
                Check your inbox for the link.
              </span>
            ) : account.capabilities.email ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await authClient.sendVerificationEmail({
                    email: user.email,
                    callbackURL: "/dashboard/settings",
                  });
                  setVerifySent(true);
                }}
              >
                Verify email
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Unverified</span>
            )}
          </div>
        </div>

        <Button type="submit" size="sm" disabled={!dirty || update.isPending}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Panel>
  );
}

/* ----------------------------- Sign-in methods ---------------------------- */

function SignInMethods({ account }: { account: Account }) {
  const unlink = useUnlinkGithubMutation();
  const [linking, setLinking] = useState(false);
  const search = Route.useSearch();
  const [linkError, setLinkError] = useState<string | null>(() =>
    oauthErrorMessage(search.error),
  );
  const [passwordOpen, setPasswordOpen] = useState(false);
  const { github, hasPassword } = account;

  return (
    <Panel>
      <div className="divide-y divide-border">
        <SettingRow
          title={
            <span className="inline-flex items-center gap-2">
              <Github size={16} /> GitHub
            </span>
          }
          description={
            github
              ? `Linked${github.login ? ` as @${github.login}` : ""}.`
              : account.capabilities.githubSignIn
                ? "Not linked. Required to connect GitHub App installations."
                : "GitHub sign-in isn't configured on this deployment."
          }
        >
          {github ? (
            hasPassword && (
              <Button
                variant="outline"
                size="sm"
                disabled={unlink.isPending}
                onClick={() => {
                  if (
                    confirm(
                      "Unlink GitHub? You'll sign in with your email and password.",
                    )
                  )
                    unlink.mutate(undefined);
                }}
              >
                Unlink
              </Button>
            )
          ) : account.capabilities.githubSignIn ? (
            <Button
              size="sm"
              disabled={linking}
              onClick={async () => {
                setLinking(true);
                setLinkError(null);
                const res = await authClient.linkSocial({
                  provider: "github",
                  callbackURL: "/dashboard/settings#sign-in",
                  errorCallbackURL: "/dashboard/settings",
                });
                if (res?.error) {
                  setLinking(false);
                  setLinkError(res.error.message ?? "Could not link GitHub");
                }
              }}
            >
              <Github /> {linking ? "Redirecting…" : "Link GitHub"}
            </Button>
          ) : null}
        </SettingRow>

        <SettingRow
          title={
            <span className="inline-flex items-center gap-2">
              <Key size={16} /> Password
            </span>
          }
          description={
            hasPassword
              ? "Sign in with your email and password."
              : "Not set. You sign in with GitHub."
          }
        >
          {!passwordOpen && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPasswordOpen(true)}
            >
              {hasPassword ? "Change password" : "Set password"}
            </Button>
          )}
        </SettingRow>
        {passwordOpen && (
          <PasswordForm
            hasPassword={hasPassword}
            onDone={() => setPasswordOpen(false)}
          />
        )}
      </div>
      {(linkError || unlink.isError) && (
        <div className="border-t border-border p-4">
          <Notice tone="danger">
            {linkError ?? errorText(unlink.error, "Could not unlink")}
          </Notice>
        </div>
      )}
    </Panel>
  );
}

function PasswordForm({
  hasPassword,
  onDone,
}: {
  hasPassword: boolean;
  onDone: () => void;
}) {
  const change = useChangePasswordMutation();
  const set = useSetPasswordMutation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const pending = change.isPending || set.isPending;

  if (done) {
    return (
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <Notice tone="success">
          {hasPassword ? "Password changed." : "Password set."}
        </Notice>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4 bg-muted/30 px-5 py-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (next.length < 8) {
          setError("Password must be at least 8 characters.");
          return;
        }
        const handlers = {
          onSuccess: () => setDone(true),
          onError: (err: unknown) =>
            setError(errorText(err, "Could not save the password")),
        };
        if (hasPassword) {
          change.mutate(
            { currentPassword: current, newPassword: next, signOutOthers },
            handlers,
          );
        } else {
          set.mutate(next, handlers);
        }
      }}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        {hasPassword && (
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
      </div>
      {hasPassword && (
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <input
            type="checkbox"
            checked={signOutOthers}
            onChange={(e) => setSignOutOthers(e.target.checked)}
            className="size-3.5 accent-current"
          />
          Sign out of other devices
        </label>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending
            ? "Saving…"
            : hasPassword
              ? "Change password"
              : "Set password"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
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
  const others = account.sessions.filter((s) => !s.current).length;

  return (
    <Panel>
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
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await signOut();
        window.location.href = "/signin";
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}

/* ------------------------------ Delete account ----------------------------- */

function DeleteAccount({ account }: { account: Account }) {
  const del = useDeleteAccountMutation();
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
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
          del.mutate(account.hasPassword ? password : undefined, {
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
        {account.hasPassword && (
          <div className="space-y-1.5">
            <Label htmlFor="delete-password">Password</Label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
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
