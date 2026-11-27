import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Notice } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/Input";
import { isSignedIn } from "@/src/lib/session";

export const Route = createFileRoute("/forgot-password")({
  // Already signed in? No need for the reset flow.
  beforeLoad: async () => {
    if (await isSignedIn()) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to reset your password."
      footer={{
        prompt: "Remember your password?",
        href: "/signin",
        label: "Sign in",
      }}
    >
      <form
        className="space-y-4"
        autoComplete="off"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          setSuccess(false);
          try {
            // Relative URL resolves against the current origin — works in dev
            // (:3000) and prod (openvscan.com) without a hardcoded host.
            const response = await fetch("/api/auth/request-password-reset", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, redirectTo: "/reset-password" }),
            });
            if (!response.ok) {
              const body = (await response.json().catch(() => undefined)) as
                | { message?: string }
                | undefined;
              setError(body?.message || "An error occurred");
              return;
            }
            setSuccess(true);
          } catch {
            setError("An unexpected error occurred.");
          } finally {
            setLoading(false);
          }
        }}
      >
        {error && <Notice tone="danger">{error}</Notice>}
        {success && (
          <Notice tone="success">Check your email for a reset link.</Notice>
        )}

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

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Sending link…" : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}
