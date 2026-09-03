"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Light / Dark / System theme control. The actual `.dark` class is set on
 * <html> before first paint by the inline script in layout.tsx (reads the
 * same localStorage key), so there's no flash; this component only handles
 * changing it afterwards and keeping it in step with the OS setting while in
 * "system" mode. State lives in localStorage so it persists across
 * navigation and syncs across tabs.
 */

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";
const CHANGE_EVENT = "nt-theme-change";
const CYCLE: Theme[] = ["system", "light", "dark"];

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function applyTheme(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function label(theme: Theme): string {
  return theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const reapply = () => applyTheme("system");
    mq.addEventListener("change", reapply);
    return () => mq.removeEventListener("change", reapply);
  }, [theme]);

  const next = CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length];
  const setTheme = () => {
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked — the toggle still works for this page view */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <button
      type="button"
      onClick={setTheme}
      aria-label={`Theme: ${label(theme)}. Switch to ${label(next)}.`}
      title={`Theme: ${label(theme)} — click for ${label(next)}`}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-fg-subtle hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}
    >
      {theme === "light" ? <SunIcon /> : theme === "dark" ? <MoonIcon /> : <MonitorIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2.5v2M10 15.5v2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M2.5 10h2M15.5 10h2M4.5 15.5l1.4-1.4M14.1 5.9l1.4-1.4" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
      <path d="M16 11.5A6.5 6.5 0 0 1 8.5 4a6.5 6.5 0 1 0 7.5 7.5z" strokeLinejoin="round" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" />
      <path d="M7 16.5h6M10 13.5v3" strokeLinecap="round" />
    </svg>
  );
}
