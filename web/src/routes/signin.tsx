import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import Link from "@/components/AppLink";
import {
  AuthShell,
  GithubAuthButton,
  oauthErrorMessage,
  PasswordField,
} from "@/components/auth/AuthShell";
import { Notice } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/Input";
import { signIn } from "@/lib/auth-client";
import { isSignedIn, safeRedirect } from "@/src/lib/session";

export const Route = createFileRoute("/signin")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string; error?: string } => ({
    redirect: safeRedirect(search.redirect) ?? undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  // Already signed in? Skip the form and go where the user was headed.
  beforeLoad: async ({ search }) => {
    if (await isSignedIn()) {
      throw redirect({ href: search.redirect ?? "/dashboard" });
    }
  },
  component: SignInPage,
});

function SignInPage() {
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    oauthErrorMessage(search.error),
  );
  const navigate = useNavigate();

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue securing your code before it ships."
      footer={{
        prompt: "Don't have an account?",
        href: "/signup",
        label: "Create one",
      }}
    >
      <GithubAuthButton
        label="Continue with GitHub"
        redirectTo={search.redirect}
      />

      <form
        className="mt-4 space-y-4"
        autoComplete="off"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          await signIn.email({
            email,
            password,
            callbackURL: "/dashboard",
            fetchOptions: {
              onSuccess: () => {
                setLoading(false);
                // Honor a post-login destination (the GitHub setup callback
                // bounces unauthenticated users through /signin?redirect=…). It
                // may be a non-router path, so use a full navigation when set.
                const target = search.redirect;
                if (target) {
                  window.location.href = target;
                } else {
                  navigate({ to: "/dashboard" });
                }
              },
              onError: (ctx) => {
                setLoading(false);
                setError(ctx.error.message);
              },
            },
          });
        }}
      >
        {error && <Notice tone="danger">{error}</Notice>}

        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
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
