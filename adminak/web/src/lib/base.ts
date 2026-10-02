/**
 * Where the console is mounted: "" at the root, "/adminak" on akhielesh.com. The server writes it
 * into index.html (<meta name="adminak-base">), so one build works under any prefix.
 */
function meta(name: string): string | null {
  return typeof document === "undefined" ? null : document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;
}

export const BASE = (meta("adminak-base") ?? "").replace(/\/+$/, "");

/** A same-origin URL inside the console, e.g. appUrl("/api/export.json"). */
export function appUrl(path: string): string {
  return `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Link to the sibling site-analytics dashboard, when the console runs inside akhielesh.com. */
export const SITE_DASHBOARD_URL = meta("adminak-site-dashboard");
