import { type ReactNode, useEffect, useState } from "react";
import Link from "@/components/AppLink";
import { BrushPanel } from "@/components/brand/BrushPanel";
import { Wordmark } from "@/components/brand/Mark";
import { Notice } from "@/components/dashboard/ui";
import { Github } from "@/components/icons";
import { InlineComment, TriageCard } from "@/components/landing/mocks";
import { REPO_URL } from "@/components/site";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/Input";
import { resendEmailCode, verifyEmailCode } from "@/lib/auth-server";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** "Already have an account? Sign in" under the form. */
  footer?: { prompt: string; href: string; label: string };
}

/**
 * Sign-in, sign-up and password pages: the form on paper, the product on a
 * brush panel. Uses the marketing site's palette.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="paper grid min-h-dvh bg-paper font-sans text-ink lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="flex flex-col px-6 py-6 sm:px-10">
        <Link
          href="/"
          className="inline-flex self-start text-ink"
          aria-label="OpenVScan home"
        >
          <Wordmark className="text-[23px]" />
        </Link>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[380px]">
            <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.025em] text-ink">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-3 text-[15.5px] leading-relaxed text-stone">
                {subtitle}
              </p>
            )}
            <div className="mt-8">{children}</div>
            {footer && (
              <p className="mt-8 text-[14px] text-stone">
                {footer.prompt}{" "}
                <Link
                  href={footer.href}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {footer.label}
                </Link>
              </p>
            )}
          </div>
        </div>

        <p className="text-[12.5px] text-pebble">
          Open source under AGPL-3.0 ·{" "}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="link-underline"
          >
            GitHub
          </a>
        </p>
      </section>

      <section className="hidden p-3 lg:block">
        <BrushPanel
          id="auth"
          tone="moss"
          className="flex h-full flex-col justify-center rounded-[12px] px-10 py-16"
        >
          <div className="mx-auto grid w-full max-w-[540px] gap-4">
            <TriageCard rows={3} className="max-w-none" />
            <div className="ml-10">
              <InlineComment compact />
            </div>
          </div>
        </BrushPanel>
      </section>
    </div>
  );
}

/** Plain-language text for the `?error=` codes /api/auth/callback sends. */
export function oauthErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "state":
      return "Your sign-in link expired or was opened in another tab. Please try again.";
    case "denied":
      return "GitHub sign-in was cancelled.";
    case "github":
      return "GitHub sign-in didn't complete. Try again, or use your email below.";
    case "missing_code":
    case "signin_failed":
      return "We couldn't sign you in with GitHub. Please try again.";
    default:
      return "Sign-in didn't complete. Please try again.";
  }
}

/**
 * "Continue with GitHub": straight to GitHub through WorkOS, then back to
 * /api/auth/callback. Failures come back to /signin with `?error=`.
 */
export function GithubAuthButton({
  label,
  redirectTo,
}: {
  label: string;
  /** Same-origin path to land on after signing in (default: dashboard). */
  redirectTo?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  // Coming back with the browser's Back button restores the page as it was.
  useEffect(() => {
    const reset = () => setLoading(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  const href = redirectTo
    ? `/api/auth/signin?${new URLSearchParams({ redirect: redirectTo })}`
    : "/api/auth/signin";

  return (
    <div className="space-y-5">
      <a
        href={href}
        aria-disabled={loading}
        onClick={() => setLoading(true)}
        className={cn(
          "flex h-11 w-full items-center justify-center gap-2.5 rounded-[6px] bg-ink text-[15px] font-medium text-paper transition-[background-color,transform] duration-150 ease-out hover:bg-ink-2 active:scale-[0.97] motion-reduce:active:scale-100",
          loading && "pointer-events-none opacity-60",
        )}
      >
        <Github size={17} />
        {loading ? "Redirecting…" : label}
      </a>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="eyebrow text-pebble">or with email</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

export function PasswordField({
  show,
  onToggle,
  className,
  ...props
}: {
  show: boolean;
  onToggle: () => void;
} & Omit<React.ComponentProps<"input">, "type">) {
  return (
    <div className="relative">
      <Input
        {...props}
        type={show ? "text" : "password"}
        className={cn("h-11 pr-16 text-[15px]", className)}
      />
      <button
        type="button"
        aria-label="Show password"
        aria-pressed={show}
        aria-controls={props.id}
        onClick={onToggle}
        className="absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

/** Where a server function's thrown validation message goes. */
export function errorText(err: unknown): string {
  return err instanceof Error && err.message
    ? err.message
    : "Something went wrong. Please try again.";
}

/**
 * The 6-digit code WorkOS emails when an address isn't verified yet. The
 * pending sign-in waits in an httpOnly cookie; on success we go to `redirect`.
 */
export function VerifyEmailForm({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
          const r = await verifyEmailCode({ data: { code } });
          if (r.ok) {
            window.location.href = r.redirect;
            return;
          }
          setError("error" in r ? r.error : null);
        } catch (err) {
          setError(errorText(err));
        }
        setLoading(false);
      }}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      {resent && !error && <Notice tone="success">We sent a new code.</Notice>}

      <Field label="Verification code" htmlFor="code">
        <Input
          id="code"
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          placeholder="123456"
          className="h-11 font-mono text-[17px] tracking-[0.3em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, ""))}
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? "Verifying…" : "Verify and continue"}
      </Button>

      <div className="flex items-center justify-between text-[13.5px] text-stone">
        <button
          type="button"
          onClick={onBack}
          className="transition-colors hover:text-ink"
        >
          Use a different email
        </button>
        <button
          type="button"
          className="font-medium text-ink underline-offset-4 hover:underline"
          onClick={async () => {
            setError(null);
            setResent(false);
            try {
              const r = await resendEmailCode();
              if (r.ok) setResent(true);
              else setError(r.error ?? null);
            } catch (err) {
              setError(errorText(err));
            }
          }}
        >
          Resend code
        </button>
      </div>
    </form>
  );
}
