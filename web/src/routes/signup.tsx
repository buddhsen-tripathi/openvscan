import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  AuthShell,
  GithubAuthButton,
  oauthErrorMessage,
  PasswordField,
} from "@/components/auth/AuthShell";
import { Notice } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/Input";
import { signUp } from "@/lib/auth-client";
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
  const [username, setUsername] = useState("");
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
      title="Create your account"
      subtitle="Start finding vulnerabilities before they ship."
      footer={{
        prompt: "Already have an account?",
        href: "/signin",
        label: "Sign in",
      }}
    >
      <GithubAuthButton
        label="Sign up with GitHub"
        redirectTo={search.redirect}
      />

      <form
        className="mt-4 space-y-4"
        autoComplete="off"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          await signUp.email({
            email,
            password,
            name: username,
            callbackURL: "/dashboard",
            fetchOptions: {
              onSuccess: () => {
                setLoading(false);
                if (search.redirect) window.location.href = search.redirect;
                else navigate({ to: "/dashboard" });
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

        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            type="text"
            required
            placeholder="Ada Lovelace"
            className="h-10"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>

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

        <Field label="Password" htmlFor="password">
          <PasswordField
            id="password"
            required
            placeholder="At least 8 characters"
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
