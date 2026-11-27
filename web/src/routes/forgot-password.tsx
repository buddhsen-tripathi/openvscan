import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell, errorText } from "@/components/auth/AuthShell";
import { Notice } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/Input";
import { requestPasswordReset } from "@/lib/auth-server";
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
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          setSuccess(false);
          try {
            const r = await requestPasswordReset({ data: { email } });
            if (r.ok) setSuccess(true);
            else setError(r.error ?? null);
          } catch (err) {
            setError(errorText(err));
          }
          setLoading(false);
        }}
      >
        {error && <Notice tone="danger">{error}</Notice>}
        {success && (
          <Notice tone="success">
            If an account uses that email, a reset link is on its way. It
            expires in 15 minutes.
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

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Sending link…" : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}
