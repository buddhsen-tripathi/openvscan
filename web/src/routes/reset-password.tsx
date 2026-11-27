import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import Link from "@/components/AppLink";
import { AuthShell, PasswordField } from "@/components/auth/AuthShell";
import { Notice } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/Input";
import { resetPassword } from "@/lib/auth-client";
import { isSignedIn } from "@/src/lib/session";

export const Route = createFileRoute("/reset-password")({
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
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const search = Route.useSearch() as { token?: string; error?: string };
  const token = search.token;

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => navigate({ to: "/signin" }), 2000);
    return () => clearTimeout(t);
  }, [success, navigate]);

  if (search.error === "INVALID_TOKEN") {
    return (
      <InvalidLink
        title="Invalid or expired link"
        message="This password reset link is invalid or has expired. Please request a new one."
      />
    );
  }

  if (!token) {
    return (
      <InvalidLink
        title="Missing token"
        message="No reset token found. Please check your email link."
      />
    );
  }

  return (
    <form
      className="space-y-4"
      autoComplete="off"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
          setError("Passwords don't match");
          return;
        }
        setLoading(true);
        setError(null);
        setSuccess(false);
        try {
          await resetPassword({
            newPassword: password,
            token,
            fetchOptions: {
              onSuccess: () => {
                setLoading(false);
                setSuccess(true);
              },
              onError: (ctx) => {
                setLoading(false);
                setError(ctx.error.message);
              },
            },
          });
        } catch {
          setLoading(false);
          setError("An unexpected error occurred.");
        }
      }}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      {success && (
        <Notice tone="success">
          Password reset successfully! Redirecting…
        </Notice>
      )}

      <Field label="New password" htmlFor="password">
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

      <Field label="Confirm password" htmlFor="confirm">
        <PasswordField
          id="confirm"
          required
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
