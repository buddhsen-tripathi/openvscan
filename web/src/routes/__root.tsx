import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SITE_URL } from "@/components/site";
import { THEME_SCRIPT } from "@/lib/theme";
import appCss from "../styles.css?url";

const siteTitle = "OpenVScan: security review for every pull request";
const siteDescription =
  "Open-source security review for GitHub pull requests. Trivy, Opengrep and Gitleaks scan each PR, your own Claude Code or Codex agent triages the findings, and results land as a check and PR comments. Runs on Cloudflare.";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: siteTitle },
        { name: "description", content: siteDescription },
        {
          name: "keywords",
          content:
            "OpenVScan, pull request security review, SAST, secret scanning, Claude Code, Codex, Cloudflare",
        },
        { name: "creator", content: "Buddhsen Tripathi" },
        { property: "og:title", content: siteTitle },
        { property: "og:description", content: siteDescription },
        { property: "og:url", content: SITE_URL },
        { property: "og:site_name", content: "OpenVScan" },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: siteTitle },
        { name: "twitter:description", content: siteDescription },
      ],
      links: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@400..600&display=swap",
        },
        { rel: "stylesheet", href: appCss },
        { rel: "icon", href: "/logo.svg", type: "image/svg+xml" },
        { rel: "apple-touch-icon", href: "/logo.png" },
      ],
    }),
    component: RootComponent,
  },
);

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before paint, so there's no flash. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: required for the pre-paint theme script */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
