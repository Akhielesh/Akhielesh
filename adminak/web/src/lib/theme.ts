import { useEffect, useState } from "react";

/**
 * Themes match akhielesh.com (light · dark · crt) and share its storage key, so a theme picked on
 * the site carries into the console when it runs at akhielesh.com/adminak. "system" follows the OS.
 */
export type ThemePref = "system" | "light" | "dark" | "crt";
type Theme = Exclude<ThemePref, "system">;

const KEY = "akh.theme";
const LEGACY_KEY = "adminak-theme";
const THEME_COLOR: Record<Theme, string> = { light: "#faf8f4", dark: "#1a1714", crt: "#0a1108" };

function read(): ThemePref {
  try {
    const value = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    return value === "light" || value === "dark" || value === "crt" ? value : "system";
  } catch {
    return "system";
  }
}

function resolve(pref: ThemePref): Theme {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(pref: ThemePref) {
  const theme = resolve(pref);
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_COLOR[theme]));
}

export function useTheme(): [ThemePref, (pref: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(read);
  useEffect(() => {
    apply(pref);
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => apply("system");
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, [pref]);
  return [
    pref,
    (next) => {
      try {
        if (next === "system") localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, next);
      } catch {
        // Storage can be unavailable (private mode); the theme still applies for this session.
      }
      setPref(next);
    },
  ];
}
