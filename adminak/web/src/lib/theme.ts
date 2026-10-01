import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";

function read(): ThemePref {
  try {
    const value = localStorage.getItem("adminak-theme");
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const meta = document.querySelectorAll('meta[name="theme-color"]');
  meta.forEach((m) => m.setAttribute("content", dark ? "#0c0d0f" : "#f6f5f1"));
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
        localStorage.setItem("adminak-theme", next);
      } catch {
        // Storage can be unavailable (private mode); the theme still applies for this session.
      }
      setPref(next);
    },
  ];
}
