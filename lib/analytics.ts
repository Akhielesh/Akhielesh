export type AnalyticsRange = "24h" | "7d" | "30d";

export interface AnalyticsSummary {
  uniqueVisitors: number;
  pageviews: number;
  liveVisitors: number;
  avgVisitDurationSeconds: number;
  returningVisitors: number;
  bounceRate: number;
  topRegion: string;
}

export interface TrendPoint {
  label: string;
  timestamp: string;
  visitors: number;
  pageviews: number;
}

export interface LocationPoint {
  country: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  visits: number;
}

export interface PageMetric {
  path: string;
  title: string;
  views: number;
  uniqueVisitors: number;
}

export interface ReferrerMetric {
  source: string;
  visits: number;
}

export interface DeviceMetric {
  label: string;
  visits: number;
  share: number;
}

export interface PulseItem {
  label: string;
  detail: string;
  timestamp: string;
  emphasis: "warm" | "cool" | "neutral";
}

export interface AnalyticsDashboardSnapshot {
  range: AnalyticsRange;
  source: "live";
  collectedAt: string;
  summary: AnalyticsSummary;
  trends: TrendPoint[];
  locations: LocationPoint[];
  pages: PageMetric[];
  referrers: ReferrerMetric[];
  devices: DeviceMetric[];
  pulse: PulseItem[];
}

interface AnalyticsPageviewPayload {
  type: "pageview";
  eventId: string;
  path: string;
  title: string;
  referrer: string;
  host: string;
  language: string;
  timezone: string;
  screen: string;
  viewport: string;
  sessionId: string;
  visitorId: string;
  occurredAt: string;
}

const VISITOR_KEY = "akhielesh-analytics-visitor-id";
const SESSION_KEY = "akhielesh-analytics-session-id";
const SESSION_TS_KEY = "akhielesh-analytics-session-start";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const analyticsApiBase = (process.env.NEXT_PUBLIC_ANALYTICS_API_BASE?.replace(/\/$/, "") ?? "/api/analytics").replace(/\/$/, "");

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function getVisitorId() {
  const existing = window.localStorage.getItem(VISITOR_KEY);

  if (existing) {
    return existing;
  }

  const next = createId();
  window.localStorage.setItem(VISITOR_KEY, next);
  return next;
}

function getSessionId() {
  const now = Date.now();
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  const startedAt = Number(window.sessionStorage.getItem(SESSION_TS_KEY) ?? "0");

  if (existing && now - startedAt < SESSION_TIMEOUT_MS) {
    window.sessionStorage.setItem(SESSION_TS_KEY, String(now));
    return existing;
  }

  const next = createId();
  window.sessionStorage.setItem(SESSION_KEY, next);
  window.sessionStorage.setItem(SESSION_TS_KEY, String(now));
  return next;
}

function trackingDisabled() {
  if (typeof navigator === "undefined") {
    return true;
  }

  return (
    navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
  );
}

export async function fetchAnalyticsSnapshot(
  range: AnalyticsRange,
  password: string,
  signal?: AbortSignal
): Promise<AnalyticsDashboardSnapshot> {
  const response = await fetch(`${analyticsApiBase}/dashboard?range=${range}`, {
    method: "GET",
    headers: {
      "x-admin-password": password
    },
    cache: "no-store",
    signal
  });

  if (!response.ok) {
    const rawError = await response.text();
    let parsedError = "";

    try {
      const parsed = JSON.parse(rawError) as { error?: string };
      parsedError = parsed.error ?? "";
    } catch {}

    throw new Error(parsedError || rawError || "Unable to load analytics snapshot.");
  }

  return (await response.json()) as AnalyticsDashboardSnapshot;
}

export async function postAnalyticsPageview(path: string, title: string) {
  if (trackingDisabled() || typeof window === "undefined") {
    return;
  }

  const payload: AnalyticsPageviewPayload = {
    type: "pageview",
    eventId: createId(),
    path,
    title,
    referrer: document.referrer,
    host: window.location.host,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    sessionId: getSessionId(),
    visitorId: getVisitorId(),
    occurredAt: new Date().toISOString()
  };

  try {
    await fetch(`${analyticsApiBase}/collect`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      keepalive: true,
      cache: "no-store"
    });
  } catch {
    // Telemetry must never block page rendering or route changes.
  }
}
