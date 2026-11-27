import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import Link from "@/components/AppLink";
import {
  AuthShell,
  errorText,
  PasswordField,
} from "@/components/auth/AuthShell";
import { Notice } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/Input";
import { resetPassword } from "@/lib/auth-server";
import { isSignedIn } from "@/src/lib/session";

/** WorkOS's reset email links here as `?token=` (the Password reset URL). */
export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === "string" ? { token: search.token } : {},
  // Already signed in? Send them to the dashboard rather than the reset form.
  beforeLoad: async () => {
    if (await isSignedIn()) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: ResetPasswordPage,
});

function InvalidLink({ title, message }: { title: string; message: string }) {
  return (
    <div className="text-center">
      <h2 className="mb-2 font-display text-lg text-destructive">{title}</h2>
      <p className="mb-6 text-sm text-muted-foreground">{message}</p>
      <Button asChild size="lg" className="w-full">
        <Link href="/forgot-password">Request new link</Link>
      </Button>
    </div>
  );
}

function ResetPasswordContent() {
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (invalid) {
    return <InvalidLink title="Invalid or expired link" message={invalid} />;
  }

  if (!token) {
    return (
      <InvalidLink
        title="Missing token"
        message="No reset token found. Open the link from your email again, or request a new one."
      />
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
          setError("Passwords don't match");
          return;
        }
        setLoading(true);
        setError(null);
        try {
          const r = await resetPassword({ data: { token, password } });
          if (r.ok) {
            setSuccess(true);
            window.location.href = r.redirect;
            return;
          }
          if ("invalidLink" in r) setInvalid(r.error);
          else if ("verify" in r) window.location.href = "/signin?reset=1";
          else setError(r.error);
        } catch (err) {
          setError(errorText(err));
        }
        setLoading(false);
      }}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      {success && (
        <Notice tone="success">Password changed. Signing you in…</Notice>
      )}

      <Field label="New password" htmlFor="password">
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

      <Field label="Confirm password" htmlFor="confirm">
        <PasswordField
          id="confirm"
          required
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          show={showPassword}
          onToggle={() => setShowPassword((v) => !v)}
        />
      </Field>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={loading || success}
      >
        {loading ? "Resetting…" : "Reset password"}
      </Button>
    </form>
  );
}

function ResetPasswordPage() {
  return (
    <AuthShell
      title="Set a new password"
      footer={{
        prompt: "Remember your password?",
        href: "/signin",
        label: "Sign in",
      }}
    >
      <ResetPasswordContent />
    </AuthShell>
  );
}
