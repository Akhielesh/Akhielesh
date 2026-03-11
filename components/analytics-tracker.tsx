"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { postAnalyticsPageview } from "@/lib/analytics";

export function AnalyticsTracker() {
  const pathname = usePathname();
  const path = pathname;

  useEffect(() => {
    if (!path || path.startsWith("/adminak")) {
      return;
    }

    const handle = window.setTimeout(() => {
      void postAnalyticsPageview(path, document.title);
    }, 320);

    return () => window.clearTimeout(handle);
  }, [path]);

  return null;
}
