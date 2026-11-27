/**
 * The app's icon set: Pikaicons (free tier, copied into ./pika by
 * `npx pikaicons add`) behind the names the UI uses.
 *
 * Every icon takes the usual <svg> props plus `size` (px, default 24) and
 * `strokeWidth`. A handful of concepts aren't in the free set (pull request,
 * spinner, plain check…); those are drawn below on the same 24px grid with
 * Pika's 2px round stroke so they sit with the rest.
 */
import type { CSSProperties, JSX, SVGProps } from "react";
import { cn } from "@/lib/utils";
import * as P from "./pika";

export { ClaudeMark, OpenAIMark } from "./brand";

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number | string;
};
export type Icon = (props: IconProps) => JSX.Element;

type RawIcon = (props: JSX.IntrinsicElements["svg"]) => JSX.Element;

function wrap(Raw: RawIcon, name: string): Icon {
  function Wrapped({
    size = 24,
    strokeWidth,
    className,
    style,
    ...props
  }: IconProps) {
    return (
      <Raw
        width={size}
        height={size}
        aria-hidden={props["aria-label"] ? undefined : true}
        focusable="false"
        className={cn(
          "shrink-0",
          // Pika sets stroke-width on each path; CSS overrides that attribute.
          strokeWidth != null && "[&_*]:[stroke-width:var(--icon-sw)]",
          className,
        )}
        style={
          strokeWidth != null
            ? ({ ...style, "--icon-sw": strokeWidth } as CSSProperties)
            : style
        }
        {...props}
      />
    );
  }
  Wrapped.displayName = name;
  return Wrapped;
}

/** Same shape as a Pika component, for the icons drawn here. */
function drawn(children: JSX.Element): RawIcon {
  return (props) => (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative; wrap() sets aria-hidden.
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

const RawCheck = drawn(<path d="m5 12.7 4.5 4.5A26 26 0 0 1 18.7 7.3l.3-.2" />);
const RawSpinner = drawn(<path d="M21.15 12A9.15 9.15 0 1 1 15 3.36" />);
const RawPullRequest = drawn(
  <>
    <circle cx="6" cy="5.75" r="2.25" />
    <circle cx="6" cy="18.25" r="2.25" />
    <circle cx="18" cy="18.25" r="2.25" />
    <path d="M6 8v8M18 16V9.25a3.25 3.25 0 0 0-3.25-3.25H11m2.25-2.5L10.75 6l2.5 2.5" />
  </>,
);
const RawChevronsUpDown = drawn(<path d="m8 9.5 4-4 4 4M8 14.5l4 4 4-4" />);
const RawBan = drawn(
  <>
    <circle cx="12" cy="12" r="9.15" />
    <path d="m5.6 5.6 12.8 12.8" />
  </>,
);
const RawCircleDot = drawn(
  <>
    <circle cx="12" cy="12" r="9.15" />
    <circle cx="12" cy="12" r="1.75" fill="currentColor" />
  </>,
);
const RawBook = drawn(
  <path d="M12 6.6C10.4 5.35 8.1 4.8 3 4.8v13.6c5.1 0 7.4.55 9 1.8m0-13.6c1.6-1.25 3.9-1.8 9-1.8v13.6c-5.1 0-7.4.55-9 1.8m0-13.6v13.6" />,
);

// Navigation / chrome
export const Menu = wrap(P.BurgerMenuThreeIcon, "Menu");
export const X = wrap(P.MultipleCrossCancelIcon, "X");
export const Plus = wrap(P.PlusIcon, "Plus");
export const Minus = wrap(P.MinusIcon, "Minus");
export const Search = wrap(P.SearchIcon, "Search");
export const ArrowRight = wrap(P.ArrowRightIcon, "ArrowRight");
export const ArrowLeft = wrap(P.ArrowLeftIcon, "ArrowLeft");
export const ChevronRight = wrap(P.ChevronRightIcon, "ChevronRight");
export const ChevronDown = wrap(P.ChevronDownIcon, "ChevronDown");
export const ChevronsUpDown = wrap(RawChevronsUpDown, "ChevronsUpDown");
export const ExternalLink = wrap(P.ExternalLinkSquareIcon, "ExternalLink");
export const LayoutGrid = wrap(P.GridDashboard02Icon, "LayoutGrid");
export const Sliders = wrap(P.FilterHorizontalIcon, "Sliders");
export const User = wrap(P.UserIcon, "User");
export const LogOut = wrap(P.LogOutRightIcon, "LogOut");
export const Moon = wrap(P.MoonIcon, "Moon");
export const Sun = wrap(P.SunIcon, "Sun");
export const Laptop = wrap(P.LaptopIcon, "Laptop");
export const Book = wrap(RawBook, "Book");
export const Copy = wrap(P.CopyIcon, "Copy");

// Code / GitHub
export const Github = wrap(P.GithubIcon, "Github");
export const GitBranch = wrap(P.GitBranchIcon, "GitBranch");
export const GitPullRequest = wrap(RawPullRequest, "GitPullRequest");
export const Folder = wrap(P.FolderIcon, "Folder");
export const Code = wrap(P.CodeIcon, "Code");
export const Server = wrap(P.ServerIcon, "Server");

// Status
export const Check = wrap(RawCheck, "Check");
export const CheckCircle = wrap(P.CheckTickCircleIcon, "CheckCircle");
export const XCircle = wrap(P.MultipleCrossCancelCircleIcon, "XCircle");
export const AlertTriangle = wrap(P.AlertTriangleIcon, "AlertTriangle");
export const Info = wrap(P.InformationCircleIcon, "Info");
export const Ban = wrap(RawBan, "Ban");
export const CircleDot = wrap(RawCircleDot, "CircleDot");
export const Spinner = wrap(RawSpinner, "Spinner");

// Security / agents
export const ShieldCheck = wrap(P.ShieldCheckIcon, "ShieldCheck");
export const Lock = wrap(P.LockCloseIcon, "Lock");
export const Key = wrap(P.KeyLeftIcon, "Key");
export const Bot = wrap(P.BotIcon, "Bot");
export const Sparkle = wrap(P.SparkleAi01Icon, "Sparkle");

// Actions
export const Refresh = wrap(P.RefreshIcon, "Refresh");
export const Trash = wrap(P.DeleteDustbin01Icon, "Trash");
export const Play = wrap(P.PlayCircleIcon, "Play");
export const Star = wrap(P.StarIcon, "Star");
export const Chat = wrap(P.ChatIcon, "Chat");
