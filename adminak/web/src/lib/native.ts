import { useEffect, useState, useSyncExternalStore } from "react";
import { isIos, isStandalone } from "./push";

/** Short vibration on devices that support it (Android). iOS ignores it silently. */
export function haptic(kind: "tap" | "success" | "warn" = "tap"): void {
  try {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    navigator.vibrate?.(kind === "tap" ? 8 : kind === "success" ? [10, 40, 18] : [24, 60, 24]);
  } catch {
    // Not supported.
  }
}

export function isTouch(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Chrome fires beforeinstallprompt once, often before React mounts, so capture it at module load.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const notifyInstall = () => installListeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notifyInstall();
  });
}

const DISMISS_KEY = "adminak:install-dismissed";

function readDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < 30 * 86_400_000;
  } catch {
    return false;
  }
}

/** What the install card should offer: a real prompt (Chrome/Edge/Android), iOS instructions, or nothing. */
export function useInstallOffer(): { kind: "prompt" | "ios" | null; install: () => Promise<void>; dismiss: () => void } {
  const available = useSyncExternalStore(
    (cb) => {
      installListeners.add(cb);
      return () => installListeners.delete(cb);
    },
    () => deferredPrompt !== null,
  );
  const [dismissed, setDismissed] = useState(readDismissed);
  const standalone = isStandalone();
  // Only Safari can add to the iOS home screen with full standalone support.
  const iosSafari = isIos() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
  const kind = standalone || dismissed ? null : available ? "prompt" : iosSafari ? "ios" : null;
  return {
    kind,
    install: async () => {
      if (!deferredPrompt) return;
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      notifyInstall();
    },
    dismiss: () => {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {
        // Private mode: dismiss for this session only.
      }
      setDismissed(true);
    },
  };
}

/** Mirrors the open-alert count onto the home-screen icon where supported (installed PWAs). */
export function useAppBadge(count: number): void {
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!nav.setAppBadge) return;
    const run = count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge?.();
    run?.catch(() => undefined);
  }, [count]);
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
  );
}

/** True while the on-screen keyboard covers a good part of the viewport (so fixed bars can step aside). */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !isTouch()) return;
    const check = () => {
      const el = document.activeElement;
      const typing = el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      setOpen(typing && window.innerHeight - vv.height > 140);
    };
    const later = () => setTimeout(check, 50);
    vv.addEventListener("resize", check);
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", later);
    return () => {
      vv.removeEventListener("resize", check);
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", later);
    };
  }, []);
  return open;
}

/** Whether the page has scrolled past `threshold` px. */
export function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}
