import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
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
import { signUpWithPassword } from "@/lib/auth-server";
import { isSignedIn, safeRedirect } from "@/src/lib/session";

export const Route = createFileRoute("/signup")({
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
  component: SignUpPage,
});

function SignUpPage() {
  const search = Route.useSearch();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() =>
    oauthErrorMessage(search.error),
  );

  if (verifying) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={`We sent a 6-digit code to ${verifying}. Enter it to finish creating your account.`}
      >
        <VerifyEmailForm onBack={() => setVerifying(null)} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start finding vulnerabilities before they ship."
      footer={{
        prompt: "Already have an account?",
        href: search.redirect
          ? `/signin?redirect=${encodeURIComponent(search.redirect)}`
          : "/signin",
        label: "Sign in",
      }}
    >
      <GithubAuthButton
        label="Sign up with GitHub"
        redirectTo={search.redirect}
      />

      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          try {
            const r = await signUpWithPassword({
              data: { name, email, password, redirect: search.redirect },
            });
            if (r.ok) {
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

        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Ada Lovelace"
            className="h-10"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

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

        <Field label="Password" htmlFor="password">
          <PasswordField
            id="password"
            required
            minLength={10}
            autoComplete="new-password"
            placeholder="At least 10 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            show={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
