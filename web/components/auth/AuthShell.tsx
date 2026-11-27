import { type ReactNode, useState } from "react";
import Link from "@/components/AppLink";
import { BrushPanel } from "@/components/brand/BrushPanel";
import { Wordmark } from "@/components/brand/Mark";
import { Notice } from "@/components/dashboard/ui";
import { Github } from "@/components/icons";
import { InlineComment, TriageCard } from "@/components/landing/mocks";
import { REPO_URL } from "@/components/site";
import { Input } from "@/components/ui/Input";
import { signIn } from "@/lib/auth-client";
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

/** Plain-language text for the `?error=` codes Better Auth's OAuth flow returns. */
export function oauthErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "account_not_linked":
      return "An OpenVScan account already uses this email, but the email hasn't been verified, so GitHub can't be joined to it automatically. Sign in with your email and password below, then link GitHub in Settings → Sign-in methods.";
    case "email_not_found":
      return "GitHub didn't share an email address. Make an email visible on GitHub (or allow email access when asked) and try again.";
    case "access_denied":
      return "GitHub sign-in was cancelled.";
    case "account_already_linked_to_different_user":
      return "That GitHub account is already linked to a different OpenVScan account.";
    case "signup_disabled":
      return "New sign-ups are disabled on this deployment.";
    default:
      return `GitHub sign-in didn't complete (${code.replace(/[^\w-]/g, "").slice(0, 60)}). Please try again.`;
  }
}

/**
 * "Continue with GitHub". Starts the Better Auth GitHub OAuth flow; on success
 * the user lands on the dashboard. When GitHub OAuth isn't configured the call
 * fails and we show a short hint.
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
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            await signIn.social({
              provider: "github",
              callbackURL: redirectTo ?? "/dashboard",
              // Failures come back to the sign-in page (with ?error=) instead
              // of the landing page, keeping the destination.
              errorCallbackURL: redirectTo
                ? `/signin?redirect=${encodeURIComponent(redirectTo)}`
                : "/signin",
            });
          } catch {
            setLoading(false);
            setError("GitHub sign-in is not available. Try email instead.");
          }
        }}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-[6px] bg-ink text-[15px] font-medium text-paper transition-colors hover:bg-ink-2 disabled:opacity-60"
      >
        <Github size={17} />
        {loading ? "Redirecting…" : label}
      </button>
      {error && <Notice tone="danger">{error}</Notice>}

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
