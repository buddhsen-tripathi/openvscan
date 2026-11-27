import { useRouterState } from "@tanstack/react-router";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "@/components/AppLink";
import { Mark, Wordmark } from "@/components/brand/Mark";
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
  PanelLeft,
  Sliders,
  User,
} from "@/components/icons";
import { REPO_URL } from "@/components/site";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { useGithubConnectionQuery } from "@/lib/api";
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

/** Top-level section of a path; detail pages add their own crumb after it. */
function sectionFor(pathname: string) {
  return NAV.find((n) => !n.exact && pathname.startsWith(n.href)) ?? NAV[0];
}

/* --------------------------- Collapsed preference -------------------------- */

const COLLAPSED_KEY = "ovs:sidebar-collapsed";
const collapseListeners = new Set<() => void>();

function subscribeCollapsed(fn: () => void) {
  collapseListeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    collapseListeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

/** Collapsed rail on desktop, remembered per browser. */
function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    () => localStorage.getItem(COLLAPSED_KEY) === "1",
    () => false,
  );
  const setCollapsed = useCallback((v: boolean) => {
    localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
    for (const fn of collapseListeners) fn();
  }, []);
  return [collapsed, setCollapsed] as const;
}

/* ---------------------------------- Shell ---------------------------------- */

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [crumb, setCrumbState] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const setCrumb = useCallback((l: string | null) => setCrumbState(l), []);
  const section = sectionFor(pathname);

  // Close the drawer on navigation.
  useEffect(() => setMobileOpen(false), [pathname]);

  // ⌘B / Ctrl+B toggles the sidebar, as in most editors.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed(!collapsed);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, setCollapsed]);

  return (
    <CrumbContext value={setCrumb}>
      <div className="dash flex min-h-dvh bg-background font-sans text-foreground lg:bg-sidebar">
        <aside
          className={cn(
            "sticky top-0 hidden h-dvh shrink-0 transition-[width] duration-200 lg:block",
            collapsed ? "w-[60px]" : "w-[248px]",
          )}
        >
          <SidebarBody
            pathname={pathname}
            collapsed={collapsed}
            onToggle={() => setCollapsed(!collapsed)}
          />
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-[280px] overscroll-contain border-r border-sidebar-border bg-sidebar shadow-float animate-in slide-in-from-left duration-300 ease-drawer">
              <SidebarBody
                pathname={pathname}
                collapsed={false}
                onToggle={() => setMobileOpen(false)}
              />
            </aside>
          </div>
        )}

        {/* Content sits in an inset panel on the sidebar's surface. */}
        <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
          <div className="flex flex-1 flex-col bg-background lg:rounded-[12px] lg:border lg:border-transparent lg:shadow-edge">
            <div className="flex h-14 items-center gap-2 px-3 lg:hidden">
              <button
                type="button"
                aria-label="Open menu"
                onClick={() => setMobileOpen(true)}
                className="grid size-9 place-items-center rounded-md text-foreground hover:bg-accent"
              >
                <Menu size={18} />
              </button>
              <Link href="/dashboard" aria-label="OpenVScan dashboard">
                <Wordmark className="text-[19px]" />
              </Link>
            </div>

            <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-4 pb-10 sm:px-8 lg:px-10 lg:pt-10">
              {crumb && (
                <nav
                  aria-label="Breadcrumb"
                  className="mb-5 flex min-w-0 items-center gap-1.5 text-[13px]"
                >
                  <Link
                    href={section.href}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {section.label}
                  </Link>
                  <ChevronRight
                    size={13}
                    className="shrink-0 text-muted-foreground/60"
                  />
                  <span className="truncate text-foreground">{crumb}</span>
                </nav>
              )}
              {children}
            </main>
          </div>
        </div>
      </div>
    </CrumbContext>
  );
}

/* --------------------------------- Sidebar --------------------------------- */

const itemClass = (active: boolean, collapsed: boolean) =>
  cn(
    "group flex h-8 items-center gap-2.5 rounded-[6px] text-[13.5px] transition-colors",
    collapsed ? "w-9 justify-center" : "px-2.5",
    active
      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
  );

const iconClass = (active: boolean) =>
  cn(
    "shrink-0",
    active
      ? "text-accent-brand"
      : "text-muted-foreground group-hover:text-sidebar-accent-foreground",
  );

function SidebarBody({
  pathname,
  collapsed,
  onToggle,
}: {
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const isActive = (item: NavItem) =>
    item.exact
      ? pathname === item.href || pathname === `${item.href}/`
      : pathname.startsWith(item.href);

  return (
    <div
      className={cn(
        "flex h-full flex-col px-3 py-3",
        collapsed && "items-center",
      )}
    >
      <div
        className={cn(
          "mb-3 flex h-9 w-full shrink-0 items-center",
          collapsed ? "justify-center" : "justify-between pl-2",
        )}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={onToggle}
            title="Expand sidebar (⌘B)"
            aria-label="Expand sidebar"
            className="group/logo relative grid size-9 place-items-center rounded-[6px] hover:bg-sidebar-accent"
          >
            <Mark className="h-[15px] w-[19px] text-brand group-hover/logo:opacity-0" />
            <PanelLeft
              size={17}
              className="absolute text-muted-foreground opacity-0 group-hover/logo:opacity-100"
            />
          </button>
        ) : (
          <>
            <Link
              href="/dashboard"
              aria-label="OpenVScan dashboard"
              className="text-foreground"
            >
              <Wordmark className="text-[20px]" />
            </Link>
            <button
              type="button"
              onClick={onToggle}
              title="Collapse sidebar (⌘B)"
              aria-label="Collapse sidebar"
              className="grid size-8 place-items-center rounded-[6px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              <PanelLeft size={17} />
            </button>
          </>
        )}
      </div>

      <AccountChip collapsed={collapsed} />

      <nav aria-label="Main" className="mt-3 flex-1 space-y-px">
        {NAV.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
              className={itemClass(active, collapsed)}
            >
              <item.icon size={16} className={iconClass(active)} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-px">
        <Link
          href="/docs"
          title={collapsed ? "Docs" : undefined}
          aria-label={collapsed ? "Docs" : undefined}
          className={itemClass(false, collapsed)}
        >
          <Book size={16} className={iconClass(false)} />
          {!collapsed && "Docs"}
        </Link>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={collapsed ? "GitHub" : undefined}
          aria-label={collapsed ? "OpenVScan on GitHub" : undefined}
          className={itemClass(false, collapsed)}
        >
          <Github size={16} className={iconClass(false)} />
          {!collapsed && "GitHub"}
        </a>
      </div>

      <div className={cn("mt-2", !collapsed && "w-full")}>
        <UserMenu collapsed={collapsed} />
      </div>
    </div>
  );
}

/** Which GitHub account this dashboard reviews. */
function AccountChip({ collapsed }: { collapsed: boolean }) {
  const { data } = useGithubConnectionQuery();
  const inst = data?.installations[0];
  const more = (data?.installations.length ?? 0) - 1;
  const label = inst ? inst.accountLogin : "Install the GitHub App";
  const avatar = inst ? (
    <GithubAvatar login={inst.accountLogin} />
  ) : (
    <span className="grid size-6 shrink-0 place-items-center rounded-[5px] bg-muted text-muted-foreground">
      <Github size={13} />
    </span>
  );
  if (collapsed) {
    return (
      <Link
        href="/dashboard/repositories"
        title={label}
        aria-label={label}
        className="grid size-9 place-items-center rounded-[6px] hover:bg-sidebar-accent"
      >
        {avatar}
      </Link>
    );
  }
  return (
    <Link
      href="/dashboard/repositories"
      className="flex w-full items-center gap-2.5 rounded-[8px] border border-transparent bg-background px-2.5 py-2 shadow-edge transition-shadow duration-150 hover:shadow-edge-hover"
    >
      {avatar}
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

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const user = useDashboardUser();
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
        <div
          className={cn(
            "absolute z-40 rounded-[10px] border border-border bg-popover p-1 shadow-float animate-in fade-in-0 zoom-in-95 duration-150 ease-out",
            collapsed
              ? "bottom-0 left-full ml-2 w-[232px] origin-bottom-left slide-in-from-left-1"
              : "right-0 bottom-full left-0 mb-2 origin-bottom slide-in-from-bottom-1",
          )}
        >
          {collapsed && (
            <>
              <div className="px-2 pt-1.5 pb-2">
                <div className="truncate text-[13px] font-medium text-foreground">
                  {user.name}
                </div>
                <div className="truncate text-[12px] text-muted-foreground">
                  {user.email}
                </div>
              </div>
              <div className="my-1 h-px bg-border" />
            </>
          )}
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
          <div className="flex h-9 items-center justify-between pr-1 pl-2 text-[13px] text-foreground">
            Theme
            <ThemeSwitch />
          </div>
          <div className="my-1 h-px bg-border" />
          <form method="post" action="/api/auth/signout">
            <button type="submit" className={`${item} w-full`}>
              <LogOut size={15} className="text-muted-foreground" /> Sign out
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={collapsed ? "Account menu" : undefined}
        title={collapsed ? user.name : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center rounded-[8px] text-left transition-colors hover:bg-sidebar-accent",
          collapsed ? "size-9 justify-center" : "w-full gap-2.5 px-2 py-1.5",
        )}
      >
        <Avatar
          name={user.name}
          image={user.image}
          size={collapsed ? 26 : 28}
        />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-medium text-foreground">
                {user.name}
              </div>
              <div className="truncate text-[11.5px] text-muted-foreground">
                {user.email}
              </div>
            </div>
            <ChevronsUpDown
              size={14}
              className="shrink-0 text-muted-foreground"
            />
          </>
        )}
      </button>
    </div>
  );
}
