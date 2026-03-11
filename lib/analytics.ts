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
  source: "live" | "demo";
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
const analyticsApiBase = process.env.NEXT_PUBLIC_ANALYTICS_API_BASE?.replace(/\/$/, "") ?? "";

export const hasAnalyticsBackend = analyticsApiBase.length > 0;

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

function buildDemoSnapshot(range: AnalyticsRange): AnalyticsDashboardSnapshot {
  const now = new Date();
  const pointCount = range === "24h" ? 24 : range === "7d" ? 7 : 30;
  const stepHours = range === "24h" ? 1 : 24;

  const trends = Array.from({ length: pointCount }, (_, index) => {
    const date = new Date(now.getTime() - (pointCount - index - 1) * stepHours * 60 * 60 * 1000);
    const base = range === "24h" ? 8 : range === "7d" ? 62 : 48;
    const wave = Math.sin(index * 0.78) * (range === "24h" ? 4 : 18);
    const pageviews = Math.max(6, Math.round(base + wave + (index % 3) * 3));
    const visitors = Math.max(3, Math.round(pageviews * 0.68));

    return {
      label:
        range === "24h"
          ? date.toLocaleTimeString("en-US", { hour: "numeric" })
          : date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      timestamp: date.toISOString(),
      visitors,
      pageviews
    };
  });

  const locations: LocationPoint[] = [
    { country: "United States", region: "Virginia", city: "Fairfax", latitude: 38.8462, longitude: -77.3064, visits: 42 },
    { country: "United States", region: "New York", city: "New York", latitude: 40.7128, longitude: -74.006, visits: 27 },
    { country: "United States", region: "California", city: "San Francisco", latitude: 37.7749, longitude: -122.4194, visits: 18 },
    { country: "India", region: "Tamil Nadu", city: "Chennai", latitude: 13.0827, longitude: 80.2707, visits: 16 },
    { country: "United Kingdom", region: "England", city: "London", latitude: 51.5072, longitude: -0.1276, visits: 11 },
    { country: "Germany", region: "Berlin", city: "Berlin", latitude: 52.52, longitude: 13.405, visits: 8 }
  ];

  const pages: PageMetric[] = [
    { path: "/", title: "Homepage", views: 196, uniqueVisitors: 129 },
    { path: "/projects/atlas-ai-search-workspace", title: "Atlas case study", views: 102, uniqueVisitors: 71 },
    { path: "/projects/dreamstream-comic-studio", title: "DreamStream case study", views: 84, uniqueVisitors: 57 },
    { path: "/#experience", title: "Experience section", views: 63, uniqueVisitors: 45 },
    { path: "/#contact", title: "Links section", views: 37, uniqueVisitors: 29 }
  ];

  const referrers: ReferrerMetric[] = [
    { source: "direct", visits: 118 },
    { source: "linkedin.com", visits: 42 },
    { source: "google.com", visits: 27 },
    { source: "github.com", visits: 21 },
    { source: "railway.app", visits: 8 }
  ];

  const devices: DeviceMetric[] = [
    { label: "Mobile", visits: 124, share: 0.48 },
    { label: "Desktop", visits: 103, share: 0.4 },
    { label: "Tablet", visits: 18, share: 0.07 },
    { label: "Other", visits: 11, share: 0.05 }
  ];

  const uniqueVisitors = trends.reduce((sum, point) => sum + point.visitors, 0);
  const pageviews = trends.reduce((sum, point) => sum + point.pageviews, 0);

  return {
    range,
    source: "demo",
    collectedAt: now.toISOString(),
    summary: {
      uniqueVisitors,
      pageviews,
      liveVisitors: range === "24h" ? trends.slice(-3).reduce((sum, point) => sum + point.visitors, 0) : 12,
      avgVisitDurationSeconds: 164,
      returningVisitors: Math.round(uniqueVisitors * 0.36),
      bounceRate: 27,
      topRegion: `${locations[0].city}, ${locations[0].region}`
    },
    trends,
    locations,
    pages,
    referrers,
    devices,
    pulse: [
      {
        label: "Geo ingress spike",
        detail: "Northern Virginia and New York are driving the strongest recruiter-facing traffic wave.",
        timestamp: new Date(now.getTime() - 14 * 60 * 1000).toISOString(),
        emphasis: "warm"
      },
      {
        label: "Product page traction",
        detail: "Atlas is still pulling the heaviest detail-page attention across the current range.",
        timestamp: new Date(now.getTime() - 33 * 60 * 1000).toISOString(),
        emphasis: "cool"
      },
      {
        label: "Mobile-first traffic",
        detail: "Mobile sessions remain the dominant surface, so layout and speed need to stay mobile-led.",
        timestamp: new Date(now.getTime() - 51 * 60 * 1000).toISOString(),
        emphasis: "neutral"
      }
    ]
  };
}

export async function fetchAnalyticsSnapshot(
  range: AnalyticsRange,
  password: string,
  signal?: AbortSignal
): Promise<AnalyticsDashboardSnapshot> {
  if (!hasAnalyticsBackend) {
    return buildDemoSnapshot(range);
  }

  const response = await fetch(`${analyticsApiBase}/dashboard?range=${range}`, {
    method: "GET",
    headers: {
      "x-admin-password": password
    },
    cache: "no-store",
    signal
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Unable to load analytics snapshot.");
  }

  return (await response.json()) as AnalyticsDashboardSnapshot;
}

export async function postAnalyticsPageview(path: string, title: string) {
  if (!hasAnalyticsBackend || trackingDisabled() || typeof window === "undefined") {
    return;
  }

  const payload: AnalyticsPageviewPayload = {
    type: "pageview",
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
      mode: "cors",
      cache: "no-store"
    });
  } catch {
    // Telemetry must never block page rendering or route changes.
  }
}
