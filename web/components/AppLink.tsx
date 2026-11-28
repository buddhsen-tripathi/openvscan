import { Link as RouterLink } from "@tanstack/react-router";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type AppLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
};

export default function AppLink({ href, children, ...props }: AppLinkProps) {
  const isExternal =
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    // Server routes (OAuth redirects and the like) need a full navigation.
    href.startsWith("/api/") ||
    // In-page anchors: plain <a> so the browser scrolls to the section.
    href.startsWith("#") ||
    href.startsWith("/#");

  if (isExternal) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }

  return (
    <RouterLink to={href} {...props}>
      {children}
    </RouterLink>
  );
}
