import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "@/components/AppLink";
import { Wordmark } from "@/components/brand/Mark";
import {
  Book,
  Bot,
  ChevronRight,
  ChevronsUpDown,
  Folder,
  Github,
  GitPullRequest,
  LayoutGrid,
  LogOut,
  Menu,
  Sliders,
  User,
  X,
} from "@/components/icons";
import { REPO_URL } from "@/components/site";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { useGithubConnectionQuery } from "@/lib/api";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useDashboardUser } from "./DashboardContext";
import { Avatar, CrumbContext, GithubAvatar } from "./ui";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/dashboard/repositories", label: "Repositories", icon: Folder },
  { href: "/dashboard/runs", label: "Reviews", icon: GitPullRequest },
  { href: "/dashboard/settings", label: "Settings", icon: Sliders },
];

/** Top-level crumb for a path; detail pages append their own label. */
function sectionFor(pathname: string): { label: string; href: string } {
  if (pathname.startsWith("/dashboard/repositories"))
    return { label: "Repositories", href: "/dashboard/repositories" };
  if (pathname.startsWith("/dashboard/runs"))
    return { label: "Reviews", href: "/dashboard/runs" };
  if (pathname.startsWith("/dashboard/settings"))
    return { label: "Settings", href: "/dashboard/settings" };
  return { label: "Overview", href: "/dashboard" };
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [crumb, setCrumbState] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const setCrumb = useCallback((l: string | null) => setCrumbState(l), []);
  const section = sectionFor(pathname);

  // Close the drawer on navigation.
  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <CrumbContext value={setCrumb}>
      <div className="dash flex min-h-dvh bg-background font-sans text-foreground">
        <div className="hidden w-[252px] shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
          <aside className="sticky top-0 h-dvh">
            <SidebarBody pathname={pathname} />
          </aside>
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-[280px] border-r border-sidebar-border bg-sidebar shadow-float animate-in slide-in-from-left duration-200">
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-3 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent"
              >
                <X size={17} />
              </button>
              <SidebarBody pathname={pathname} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:px-6">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
              className="grid size-9 place-items-center rounded-md text-foreground hover:bg-accent lg:hidden"
            >
              <Menu size={18} />
            </button>
            <nav
              aria-label="Breadcrumb"
              className="flex min-w-0 items-center gap-1.5 text-[13.5px]"
            >
              <Link
                href={section.href}
                className={cn(
                  "shrink-0 transition-colors",
                  crumb
                    ? "text-muted-foreground hover:text-foreground"
                    : "font-medium text-foreground",
                )}
              >
                {section.label}
              </Link>
              {crumb && (
                <>
                  <ChevronRight
                    size={14}
                    className="shrink-0 text-muted-foreground/60"
                  />
                  <span className="truncate font-medium text-foreground">
                    {crumb}
                  </span>
                </>
              )}
            </nav>
            <div className="ml-auto flex items-center gap-1">
              <Link
                href="/docs"
                className="hidden h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-accent sm:inline-flex"
              >
                <Book size={15} className="text-muted-foreground" />
                Docs
              </Link>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="OpenVScan on GitHub"
                className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Github size={16} />
              </a>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-8 sm:px-8 lg:py-10">
            {children}
          </main>
        </div>
      </div>
    </CrumbContext>
  );
}

function SidebarBody({ pathname }: { pathname: string }) {
  const isActive = (item: NavItem) =>
    item.exact
      ? pathname === item.href || pathname === `${item.href}/`
      : pathname.startsWith(item.href);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-5">
        <Link
          href="/dashboard"
          aria-label="OpenVScan dashboard"
          className="text-foreground"
        >
          <Wordmark className="text-[21px]" />
        </Link>
      </div>

      <div className="px-3 pb-2">
        <AccountChip />
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-px">
          {NAV.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-8 items-center gap-2.5 rounded-[6px] px-2.5 text-[13.5px] transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon
                  size={16}
                  className={cn(
                    "shrink-0",
                    active
                      ? "text-accent-brand"
                      : "text-muted-foreground group-hover:text-sidebar-accent-foreground",
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="space-y-2.5 border-t border-sidebar-border p-3">
        <ThemeSwitch labels />
        <UserMenu />
      </div>
    </div>
  );
}

/** Which GitHub account this dashboard reviews. */
function AccountChip() {
  const { data } = useGithubConnectionQuery();
  const inst = data?.installations[0];
  const more = (data?.installations.length ?? 0) - 1;
  return (
    <Link
      href="/dashboard/repositories"
      className="flex items-center gap-2.5 rounded-[8px] border border-sidebar-border bg-background px-2.5 py-2 shadow-card transition-colors hover:border-input"
    >
      {inst ? (
        <GithubAvatar login={inst.accountLogin} />
      ) : (
        <span className="grid size-6 shrink-0 place-items-center rounded-[5px] bg-muted text-muted-foreground">
          <Github size={13} />
        </span>
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[13px] font-medium text-foreground">
          {inst ? inst.accountLogin : "No GitHub account"}
        </div>
        <div className="truncate text-[11.5px] text-muted-foreground">
          {inst
            ? more > 0
              ? `GitHub · +${more} more`
              : "GitHub App installed"
            : "Install the GitHub App"}
        </div>
      </div>
      <ChevronsUpDown size={14} className="shrink-0 text-muted-foreground" />
    </Link>
  );
}

function UserMenu() {
  const user = useDashboardUser();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex h-8 w-full items-center gap-2.5 rounded-[5px] px-2 text-left text-[13px] text-foreground hover:bg-accent";

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute right-0 bottom-full left-0 mb-2 rounded-[8px] border border-border bg-popover p-1 shadow-float animate-in fade-in-0 slide-in-from-bottom-1 duration-150">
          <Link
            href="/dashboard/settings#account"
            className={item}
            onClick={() => setOpen(false)}
          >
            <User size={15} className="text-muted-foreground" /> Account
          </Link>
          <Link
            href="/dashboard/settings#agents"
            className={item}
            onClick={() => setOpen(false)}
          >
            <Bot size={15} className="text-muted-foreground" /> AI agents
          </Link>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            className={item}
            onClick={async () => {
              await signOut();
              navigate({ to: "/signin" });
            }}
          >
            <LogOut size={15} className="text-muted-foreground" /> Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent"
      >
        <Avatar name={user.name} image={user.image} size={28} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-medium text-foreground">
            {user.name}
          </div>
          <div className="truncate text-[11.5px] text-muted-foreground">
            {user.email}
          </div>
        </div>
        <ChevronsUpDown size={14} className="shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}
