import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import Link from "@/components/AppLink";
import {
  AuthShell,
  errorText,
  GithubAuthButton,
  oauthErrorMessage,
  PasswordField,
  VerifyEmailForm,
} from "@/components/auth/AuthShell";
import { Notice } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/Input";
import {
  pendingVerificationEmail,
  signInWithPassword,
} from "@/lib/auth-server";
import { isSignedIn, safeRedirect } from "@/src/lib/session";

export const Route = createFileRoute("/signin")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    redirect?: string;
    error?: string;
    reset?: string;
    verify?: string;
  } => ({
    redirect: safeRedirect(search.redirect) ?? undefined,
    error: typeof search.error === "string" ? search.error : undefined,
    reset: search.reset ? "1" : undefined,
    // Set by /api/auth/callback when GitHub sign-in needs an email code.
    verify: search.verify ? "1" : undefined,
  }),
  // Already signed in? Skip the form and go where the user was headed.
  beforeLoad: async ({ search }) => {
    if (await isSignedIn()) {
      throw redirect({ href: search.redirect ?? "/dashboard" });
    }
  },
  loaderDeps: ({ search }) => ({ verify: search.verify }),
  loader: async ({ deps }) => ({
    pendingEmail: deps.verify ? await pendingVerificationEmail() : null,
  }),
  component: SignInPage,
});

function SignInPage() {
  const search = Route.useSearch();
  const { pendingEmail } = Route.useLoaderData();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(pendingEmail);
  const [error, setError] = useState<string | null>(() =>
    search.verify && !pendingEmail
      ? "Your sign-in code expired. Please sign in again."
      : oauthErrorMessage(search.error),
  );

  if (verifying) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={`We sent a 6-digit code to ${verifying}. Enter it to finish signing in.`}
      >
        <VerifyEmailForm onBack={() => setVerifying(null)} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue securing your code before it ships."
      footer={{
        prompt: "Don't have an account?",
        href: search.redirect
          ? `/signup?redirect=${encodeURIComponent(search.redirect)}`
          : "/signup",
        label: "Create one",
      }}
    >
      <GithubAuthButton
        label="Continue with GitHub"
        redirectTo={search.redirect}
      />

      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          try {
            const r = await signInWithPassword({
              data: { email, password, redirect: search.redirect },
            });
            if (r.ok) {
              // A full navigation: the destination may be a server route
              // (the GitHub setup callback) and the session is new.
              window.location.href = r.redirect;
              return;
            }
            if ("verify" in r) setVerifying(r.email);
            else setError(r.error);
          } catch (err) {
            setError(errorText(err));
          }
          setLoading(false);
        }}
      >
        {error && <Notice tone="danger">{error}</Notice>}
        {search.reset && !error && (
          <Notice tone="success">
            Your password was changed. Sign in with the new one.
          </Notice>
        )}

        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            className="h-10"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          aside={
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Forgot password?
            </Link>
          }
        >
          <PasswordField
            id="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            show={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
