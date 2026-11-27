import { useSyncExternalStore } from "react";

/**
 * Theme preference: "light", "dark", or "system" (follow the OS). Stored in
 * localStorage; the pre-paint script in __root.tsx applies it before React
 * loads, and every switch on the page shares this store.
 */
export type ThemePreference = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "openvscan-theme";

/** Inline, pre-paint version of `apply()`. Keep the two in step. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

const listeners = new Set<() => void>();

function read(): ThemePreference {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function systemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply() {
  const pref = read();
  const dark = pref === "dark" || (pref === "system" && systemDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

function setTheme(next: ThemePreference) {
  try {
    if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* private mode: still apply for this page */
  }
  apply();
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (read() === "system") apply();
    listener();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) {
      apply();
      listener();
    }
  };
  mq.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    mq.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
  };
}

/** The stored theme preference and its setter. */
export function useTheme() {
  const preference = useSyncExternalStore(
    subscribe,
    read,
    () => "system" as const,
  );
  return { preference, setTheme };
}
